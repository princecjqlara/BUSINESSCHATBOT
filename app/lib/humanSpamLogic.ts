/**
 * Human Spam Logic Service
 * 
 * Implements the "Human Spam Logic" framework for AI follow-up decisions.
 * Instead of asking "Am I being spammy?", this asks "Is the expected value > the annoyance cost?"
 * 
 * Core Components:
 * 1. Spam Tolerance Score (0-100)
 * 2. 4 Spam Justification Conditions
 * 3. Human Escalation Arc (5 positions)
 * 4. Hard Human Limits
 * 5. "Would I Regret Not Sending" Test
 */

import { supabase } from './supabase';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface SpamToleranceScore {
    total: number; // 0-100
    breakdown: {
        stakes: number;         // 0-25 points
        warmth: number;         // 0-20 points
        channelNorms: number;   // 0-15 points
        timePressure: number;   // 0-15 points
        engagement: number;     // 0-15 points
        silenceAmbiguity: number; // 0-10 points
    };
    interpretation: 'wait' | 'careful' | 'acceptable';
}

export interface SpamJustification {
    conditions: {
        highStakes: boolean;      // A. Stakes are high
        ambiguousSilence: boolean; // B. Silence is ambiguous
        tolerantChannel: boolean;  // C. Channel tolerates noise
        asymmetricValue: boolean;  // D. Asymmetric value
    };
    activeCount: number;
    reasons: string[];
}

export interface EscalationArc {
    position: 1 | 2 | 3 | 4 | 5;
    description: 'normal' | 'shorter' | 'urgent_nudge' | 'final_try' | 'stopped';
    timingMultiplier: number; // Multiplier for wait time
    canSend: boolean;
}

export interface HardLimitCheck {
    blocked: boolean;
    reason: string | null;
    limits: {
        rapidFire: boolean;       // < 3 min since last
        lateNight: boolean;       // 10PM - 7AM
        sessionLimit: boolean;    // > 3 in same session
        guiltLanguage: boolean;   // Detected guilt language
    };
}

export interface DisengagementSignals {
    shouldStop: boolean;
    signals: {
        readNoReply: boolean;           // Read but never replied
        shorterReplies: boolean;        // Replies getting shorter
        slowerReplies: boolean;         // Reply time increasing
        explicitDisengage: boolean;     // Said "busy", "later", etc.
        multipleNoResponse: boolean;    // 3+ followups with no response
    };
    confidence: number; // 0-100
}

export interface LeadContext {
    id: string;
    senderId: string;
    name: string | null;
    pipelineStage: string | null;
    messageCount: number;
    lastMessageAt: Date | null;
    lastAiFollowupAt: Date | null;
    escalationArcPosition: number;
    consecutiveFollowupsNoResponse: number;
    disengagementSignals: Record<string, unknown>;
}

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    createdAt?: Date;
}

// ============================================
// SPAM SIGNAL CLASSIFICATION
// ============================================

/**
 * Spam feels acceptable when it signals these qualities
 * Spam feels BAD when it signals these qualities
 */
export type SpamSignalType =
    | 'urgency'       // Acceptable: "This is time-sensitive"
    | 'care'          // Acceptable: "I'm thinking about you"
    | 'responsibility'// Acceptable: "I'm doing my job well"
    | 'anxiety'       // Bad: "I'm nervous you haven't replied"
    | 'automation'    // Bad: "This is clearly automated"
    | 'desperation';  // Bad: "Please please respond"

export interface SpamSignalAnalysis {
    primarySignal: SpamSignalType;
    isAcceptable: boolean;
    confidence: number; // 0-100
    indicators: string[];
}

// ============================================
// TIMING RELAXATION (WHEN SPAM IS ALLOWED)
// ============================================

/**
 * When AI decides spam is acceptable, timing rules can be relaxed
 * But NEVER cross hard limits even when spam is "allowed"
 */
export interface TimingRelaxation {
    canSendSameDay: boolean;
    minIntervalMinutes: number;  // Minimum wait (normally 30-60, can go to 15-30)
    ignoresFreshDay: boolean;    // Can reuse same time window
    sessionBreakMinutes: number; // How long until considered new session
    description: string;
}

// ============================================
// CONSTANTS
// ============================================

const RAPID_FIRE_MINUTES = 3;
const LATE_NIGHT_START = 22; // 10 PM
const LATE_NIGHT_END = 7;    // 7 AM
const SESSION_LIMIT = 3;
const MAX_NO_RESPONSE_COUNT = 3;

const GUILT_LANGUAGE_PATTERNS = [
    'still waiting',
    'haven\'t heard',
    'no response',
    'waiting for your',
    'following up again',
    'just checking if you',
    'did you get my',
    'please respond',
    'urgent'
];

const DISENGAGEMENT_PHRASES = [
    'busy',
    'later',
    'not now',
    'will check',
    'get back to you',
    'i\'ll think about it',
    'maybe later',
    'not interested',
    'no thanks',
    'stop',
    'unsubscribe'
];

// Acceptable spam signal indicators (signals urgency/care/responsibility)
const ACCEPTABLE_SPAM_PATTERNS = [
    'just wanted to make sure',
    'in case you missed',
    'thought you might',
    'wanted to share',
    'quick update',
    'following up on your question',
    'as promised',
    'here\'s the info',
    'good news',
    'special for you'
];

// Bad spam signal indicators (signals anxiety/automation/desperation)
const BAD_SPAM_PATTERNS = [
    'still waiting',
    'haven\'t heard back',
    'did you see my',
    'please respond',
    'why no reply',
    'i really need',
    'last chance',
    'act now or',
    'don\'t miss out',
    'limited time only'
];

// ============================================
// TIMING RELAXATION FUNCTIONS
// ============================================

/**
 * Get timing relaxation based on spam tolerance score
 * Higher scores = more relaxed timing rules
 * 
 * Human thought: "Do I care more about the outcome than about how this looks?"
 */
export function getTimingRelaxation(score: number): TimingRelaxation {
    // Low score (0-30): Wait / Stop - Very strict timing
    if (score < 30) {
        return {
            canSendSameDay: false,
            minIntervalMinutes: 60,  // 1 hour minimum
            ignoresFreshDay: false,
            sessionBreakMinutes: 60, // Need 1 hour session break
            description: 'Conservative: Standard timing rules apply'
        };
    }

    // Medium score (30-60): Careful - Slightly relaxed
    if (score < 60) {
        return {
            canSendSameDay: true,
            minIntervalMinutes: 45,  // 45 min minimum
            ignoresFreshDay: false,
            sessionBreakMinutes: 45,
            description: 'Moderate: Can send same day, slightly shorter intervals'
        };
    }

    // High score (60-80): Acceptable - Relaxed timing
    if (score < 80) {
        return {
            canSendSameDay: true,
            minIntervalMinutes: 30,  // 30 min minimum
            ignoresFreshDay: true,
            sessionBreakMinutes: 30,
            description: 'Relaxed: Shorter intervals allowed, can reuse time windows'
        };
    }

    // Very high score (80+): Very relaxed (but still respects hard limits!)
    return {
        canSendSameDay: true,
        minIntervalMinutes: 15,  // 15 min minimum (but still >3 min hard limit)
        ignoresFreshDay: true,
        sessionBreakMinutes: 15,
        description: 'Aggressive: Minimal timing restrictions (hard limits still apply)'
    };
}

// ============================================
// SESSION DETECTION (MESSENGER-SPECIFIC)
// ============================================

/**
 * Detect if we're in a "live session" or if there was a session break
 * 
 * On Messenger, spam is more tolerable AFTER a session break (30-45 min)
 * Within a live session, we should be more careful
 */
export function detectSessionState(
    lastMessageAt: Date | null,
    lastAiFollowupAt: Date | null
): { inLiveSession: boolean; minutesSinceActivity: number; sessionBreakOccurred: boolean } {
    const now = Date.now();

    // Get most recent activity (either user message or AI followup)
    const lastActivityTime = Math.max(
        lastMessageAt?.getTime() || 0,
        lastAiFollowupAt?.getTime() || 0
    );

    if (lastActivityTime === 0) {
        return {
            inLiveSession: false,
            minutesSinceActivity: Infinity,
            sessionBreakOccurred: true // No prior activity = safe to message
        };
    }

    const minutesSinceActivity = (now - lastActivityTime) / (1000 * 60);

    // Session break threshold: 30-45 minutes
    const SESSION_BREAK_THRESHOLD = 35; // Middle ground

    return {
        inLiveSession: minutesSinceActivity < SESSION_BREAK_THRESHOLD,
        minutesSinceActivity: Math.round(minutesSinceActivity),
        sessionBreakOccurred: minutesSinceActivity >= SESSION_BREAK_THRESHOLD
    };
}

// ============================================
// SPAM SIGNAL CLASSIFICATION
// ============================================

/**
 * Classify whether a message signals acceptable vs bad spam
 * 
 * Acceptable spam signals: Urgency, Care, Responsibility
 * Bad spam signals: Anxiety, Automation, Desperation
 */
export function classifySpamSignal(message: string): SpamSignalAnalysis {
    const lowerMessage = message.toLowerCase();
    const indicators: string[] = [];

    // Check for acceptable patterns
    let acceptableScore = 0;
    for (const pattern of ACCEPTABLE_SPAM_PATTERNS) {
        if (lowerMessage.includes(pattern)) {
            acceptableScore++;
            indicators.push(`✓ "${pattern}"`);
        }
    }

    // Check for bad patterns
    let badScore = 0;
    for (const pattern of BAD_SPAM_PATTERNS) {
        if (lowerMessage.includes(pattern)) {
            badScore++;
            indicators.push(`✗ "${pattern}"`);
        }
    }

    // Determine primary signal
    let primarySignal: SpamSignalType;
    let isAcceptable: boolean;

    if (acceptableScore > badScore) {
        // More acceptable patterns found
        if (lowerMessage.includes('urgent') || lowerMessage.includes('today') || lowerMessage.includes('asap')) {
            primarySignal = 'urgency';
        } else if (lowerMessage.includes('thought') || lowerMessage.includes('wanted')) {
            primarySignal = 'care';
        } else {
            primarySignal = 'responsibility';
        }
        isAcceptable = true;
    } else if (badScore > 0) {
        // Bad patterns found
        if (lowerMessage.includes('waiting') || lowerMessage.includes('haven\'t heard')) {
            primarySignal = 'anxiety';
        } else if (lowerMessage.includes('limited') || lowerMessage.includes('act now')) {
            primarySignal = 'desperation';
        } else {
            primarySignal = 'automation';
        }
        isAcceptable = false;
    } else {
        // Neutral - default to care (acceptable)
        primarySignal = 'care';
        isAcceptable = true;
        indicators.push('(neutral tone - acceptable)');
    }

    const total = acceptableScore + badScore;
    const confidence = total > 0 ? Math.min(100, (Math.abs(acceptableScore - badScore) / total) * 100 + 50) : 50;

    return {
        primarySignal,
        isAcceptable,
        confidence: Math.round(confidence),
        indicators
    };
}

// ============================================
// SPAM TOLERANCE SCORE COMPUTATION
// ============================================

/**
 * Compute the Spam Tolerance Score (0-100)
 * Higher score = more acceptable to follow up
 */
export function computeSpamToleranceScore(
    lead: LeadContext,
    conversationHistory: ConversationMessage[],
    settings: { aggressiveness: number }
): SpamToleranceScore {
    const breakdown = {
        stakes: computeStakesScore(lead, conversationHistory),
        warmth: computeWarmthScore(lead, conversationHistory),
        channelNorms: computeChannelNormsScore(), // Messenger is always tolerant
        timePressure: computeTimePressureScore(lead, conversationHistory),
        engagement: computeEngagementScore(lead, conversationHistory),
        silenceAmbiguity: computeSilenceAmbiguityScore(lead, conversationHistory),
    };

    // Apply aggressiveness modifier (1-10 scale affects total by ±20%)
    const aggressivenessModifier = 1 + ((settings.aggressiveness - 5) * 0.04); // 5 = 1.0, 10 = 1.2, 1 = 0.8

    let total = Math.round(
        (breakdown.stakes + breakdown.warmth + breakdown.channelNorms +
            breakdown.timePressure + breakdown.engagement + breakdown.silenceAmbiguity) *
        aggressivenessModifier
    );

    // Clamp to 0-100
    total = Math.max(0, Math.min(100, total));

    const interpretation: SpamToleranceScore['interpretation'] =
        total < 30 ? 'wait' :
            total < 60 ? 'careful' :
                'acceptable';

    return { total, breakdown, interpretation };
}

function computeStakesScore(lead: LeadContext, history: ConversationMessage[]): number {
    let score = 5; // Base score

    // High message count indicates engaged lead = higher stakes
    if (lead.messageCount >= 10) score += 8;
    else if (lead.messageCount >= 5) score += 5;
    else if (lead.messageCount >= 2) score += 2;

    // Pipeline stage indicates value
    const highValueStages = ['qualified', 'proposal', 'negotiation', 'hot'];
    if (lead.pipelineStage && highValueStages.some(s =>
        lead.pipelineStage!.toLowerCase().includes(s))) {
        score += 7;
    }

    // Recent conversation = higher stakes (opportunity is warm)
    if (lead.lastMessageAt) {
        const hoursSinceMessage = (Date.now() - lead.lastMessageAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceMessage < 4) score += 5;
        else if (hoursSinceMessage < 24) score += 3;
    }

    return Math.min(25, score);
}

function computeWarmthScore(lead: LeadContext, history: ConversationMessage[]): number {
    let score = 5; // Base score

    // Active conversation = warm relationship
    if (history.length >= 10) score += 8;
    else if (history.length >= 5) score += 5;
    else if (history.length >= 2) score += 3;

    // User-initiated messages count
    const userMessages = history.filter(m => m.role === 'user');
    if (userMessages.length >= 5) score += 4;
    else if (userMessages.length >= 2) score += 2;

    // Name known = more personal
    if (lead.name) score += 3;

    return Math.min(20, score);
}

function computeChannelNormsScore(): number {
    // Messenger is inherently a noisy, tolerant channel
    return 12; // Out of 15 - messenger is quite tolerant
}

function computeTimePressureScore(lead: LeadContext, history: ConversationMessage[]): number {
    let score = 3; // Base score

    // Check for time-sensitive keywords in conversation
    const recentContent = history.slice(-5).map(m => m.content.toLowerCase()).join(' ');

    const urgentKeywords = ['today', 'tomorrow', 'asap', 'urgent', 'deadline', 'limited',
        'last chance', 'ending soon', 'sale ends', 'only', 'hurry'];

    const matchedKeywords = urgentKeywords.filter(kw => recentContent.includes(kw));
    score += Math.min(8, matchedKeywords.length * 3);

    // Stale conversation might need urgency
    if (lead.lastMessageAt) {
        const hoursSinceMessage = (Date.now() - lead.lastMessageAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceMessage > 48) score += 4; // Need to re-engage
    }

    return Math.min(15, score);
}

function computeEngagementScore(lead: LeadContext, history: ConversationMessage[]): number {
    let score = 2; // Base score

    // Recent activity from user
    const userMessages = history.filter(m => m.role === 'user');
    if (userMessages.length > 0) {
        score += 5;
    }

    // Questions asked by user = high engagement
    const questionsFromUser = userMessages.filter(m => m.content.includes('?'));
    score += Math.min(5, questionsFromUser.length * 2);

    // Low consecutive no-responses = good engagement
    if (lead.consecutiveFollowupsNoResponse === 0) score += 3;

    return Math.min(15, score);
}

function computeSilenceAmbiguityScore(lead: LeadContext, history: ConversationMessage[]): number {
    // Check if silence is ambiguous (no clear "no")
    let score = 5; // Default: assume ambiguous

    if (history.length === 0) return score;

    const lastUserMessage = [...history].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) return score;

    const content = lastUserMessage.content.toLowerCase();

    // Check for explicit disengagement
    if (DISENGAGEMENT_PHRASES.some(phrase => content.includes(phrase))) {
        return 0; // Clear disengagement = not ambiguous = low score
    }

    // Questions from user = very ambiguous (waiting for answer)
    if (content.includes('?')) {
        score += 5;
    }

    return Math.min(10, score);
}

// ============================================
// 4 SPAM JUSTIFICATION CONDITIONS
// ============================================

/**
 * Check the 4 conditions that justify "spam is okay"
 */
export function checkJustificationConditions(
    lead: LeadContext,
    history: ConversationMessage[],
    score: SpamToleranceScore
): SpamJustification {
    const conditions = {
        highStakes: checkHighStakes(lead, history),
        ambiguousSilence: checkAmbiguousSilence(lead, history),
        tolerantChannel: true, // Messenger is always tolerant
        asymmetricValue: checkAsymmetricValue(lead, history),
    };

    const activeCount = Object.values(conditions).filter(Boolean).length;

    const reasons: string[] = [];
    if (conditions.highStakes) reasons.push('Stakes are high - opportunity worth pursuing');
    if (conditions.ambiguousSilence) reasons.push('Silence is ambiguous - no clear rejection');
    if (conditions.tolerantChannel) reasons.push('Messenger channel tolerates multiple messages');
    if (conditions.asymmetricValue) reasons.push('Value to them is high, interruption cost is low');

    return { conditions, activeCount, reasons };
}

function checkHighStakes(lead: LeadContext, history: ConversationMessage[]): boolean {
    // High message count = invested lead
    if (lead.messageCount >= 5) return true;

    // Qualified pipeline stage
    const highValueStages = ['qualified', 'proposal', 'negotiation', 'hot', 'interested'];
    if (lead.pipelineStage && highValueStages.some(s =>
        lead.pipelineStage!.toLowerCase().includes(s))) {
        return true;
    }

    return false;
}

function checkAmbiguousSilence(lead: LeadContext, history: ConversationMessage[]): boolean {
    if (history.length === 0) return true; // New lead = ambiguous

    const lastUserMessage = [...history].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) return true;

    const content = lastUserMessage.content.toLowerCase();

    // Check for explicit "no"
    const noPatterns = ['not interested', 'no thanks', 'don\'t contact', 'stop messaging', 'remove me'];
    if (noPatterns.some(p => content.includes(p))) {
        return false; // Clear no = not ambiguous
    }

    return true;
}

function checkAsymmetricValue(lead: LeadContext, history: ConversationMessage[]): boolean {
    // If they asked questions, we have valuable answers
    const userMessages = history.filter(m => m.role === 'user');
    const hasQuestions = userMessages.some(m => m.content.includes('?'));

    if (hasQuestions) return true;

    // If they've engaged significantly, our follow-up has value
    if (lead.messageCount >= 3) return true;

    return false;
}

// ============================================
// HUMAN ESCALATION ARC
// ============================================

/**
 * Get the current position in the human escalation arc
 */
export function getEscalationArc(position: number): EscalationArc {
    const safePosition = Math.max(1, Math.min(5, position)) as 1 | 2 | 3 | 4 | 5;

    const arcMap: Record<1 | 2 | 3 | 4 | 5, Omit<EscalationArc, 'position'>> = {
        1: { description: 'normal', timingMultiplier: 1.0, canSend: true },
        2: { description: 'shorter', timingMultiplier: 0.5, canSend: true },
        3: { description: 'urgent_nudge', timingMultiplier: 0.3, canSend: true },
        4: { description: 'final_try', timingMultiplier: 0.3, canSend: true },
        5: { description: 'stopped', timingMultiplier: 0, canSend: false },
    };

    return { position: safePosition, ...arcMap[safePosition] };
}

/**
 * Advance the escalation arc position for a lead
 */
export async function advanceEscalationArc(leadId: string): Promise<number> {
    const { data, error } = await supabase
        .from('leads')
        .select('escalation_arc_position')
        .eq('id', leadId)
        .single();

    const currentPosition = data?.escalation_arc_position || 1;
    const newPosition = Math.min(5, currentPosition + 1);

    await supabase
        .from('leads')
        .update({
            escalation_arc_position: newPosition,
            consecutive_followups_no_response: supabase.rpc('increment', { row_id: leadId, column: 'consecutive_followups_no_response' })
        })
        .eq('id', leadId);

    return newPosition;
}

/**
 * Reset escalation arc when lead responds
 */
export async function resetEscalationArc(leadId: string): Promise<void> {
    await supabase
        .from('leads')
        .update({
            escalation_arc_position: 1,
            consecutive_followups_no_response: 0,
            follow_up_sequence_started_at: null,
            disengagement_signals: {},
        })
        .eq('id', leadId);
}

// ============================================
// HARD HUMAN LIMITS
// ============================================

/**
 * Check hard limits that should NEVER be crossed
 */
export function checkHardLimits(
    lead: LeadContext,
    proposedMessage?: string
): HardLimitCheck {
    const limits = {
        rapidFire: checkRapidFire(lead.lastAiFollowupAt),
        lateNight: checkLateNight(),
        sessionLimit: lead.consecutiveFollowupsNoResponse >= SESSION_LIMIT,
        guiltLanguage: proposedMessage ? checkGuiltLanguage(proposedMessage) : false,
    };

    const blocked = Object.values(limits).some(Boolean);

    let reason: string | null = null;
    if (limits.rapidFire) reason = 'Too soon since last message (< 3 min)';
    else if (limits.lateNight) reason = 'Late night hours (10PM - 7AM)';
    else if (limits.sessionLimit) reason = `Session limit reached (${SESSION_LIMIT} messages without response)`;
    else if (limits.guiltLanguage) reason = 'Message contains guilt-inducing language';

    return { blocked, reason, limits };
}

function checkRapidFire(lastFollowupAt: Date | null): boolean {
    if (!lastFollowupAt) return false;

    const minutesSince = (Date.now() - lastFollowupAt.getTime()) / (1000 * 60);
    return minutesSince < RAPID_FIRE_MINUTES;
}

function checkLateNight(): boolean {
    const hour = new Date().getHours();
    return hour >= LATE_NIGHT_START || hour < LATE_NIGHT_END;
}

function checkGuiltLanguage(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return GUILT_LANGUAGE_PATTERNS.some(pattern => lowerMessage.includes(pattern));
}

// ============================================
// DISENGAGEMENT SIGNAL DETECTION
// ============================================

/**
 * Detect signals that the lead is disengaging
 */
export function detectDisengagementSignals(
    lead: LeadContext,
    history: ConversationMessage[]
): DisengagementSignals {
    const signals = {
        readNoReply: false, // Hard to detect without read receipts
        shorterReplies: detectShorterReplies(history),
        slowerReplies: detectSlowerReplies(history),
        explicitDisengage: detectExplicitDisengage(history),
        multipleNoResponse: lead.consecutiveFollowupsNoResponse >= MAX_NO_RESPONSE_COUNT,
    };

    const activeSignals = Object.values(signals).filter(Boolean).length;
    const confidence = Math.min(100, activeSignals * 25);

    // Should stop if 2+ signals detected with high confidence
    const shouldStop = activeSignals >= 2 || signals.explicitDisengage || signals.multipleNoResponse;

    return { shouldStop, signals, confidence };
}

function detectShorterReplies(history: ConversationMessage[]): boolean {
    const userMessages = history.filter(m => m.role === 'user');
    if (userMessages.length < 3) return false;

    const recentMessages = userMessages.slice(-3);
    const avgRecentLength = recentMessages.reduce((sum, m) => sum + m.content.length, 0) / 3;

    const olderMessages = userMessages.slice(0, -3);
    if (olderMessages.length === 0) return false;

    const avgOlderLength = olderMessages.reduce((sum, m) => sum + m.content.length, 0) / olderMessages.length;

    // If recent replies are 50%+ shorter, that's a signal
    return avgRecentLength < avgOlderLength * 0.5;
}

function detectSlowerReplies(history: ConversationMessage[]): boolean {
    // This would require timestamp analysis which is complex
    // For now, return false - can be enhanced later
    return false;
}

function detectExplicitDisengage(history: ConversationMessage[]): boolean {
    const recentUserMessages = history
        .filter(m => m.role === 'user')
        .slice(-3);

    for (const msg of recentUserMessages) {
        const content = msg.content.toLowerCase();
        if (DISENGAGEMENT_PHRASES.some(phrase => content.includes(phrase))) {
            return true;
        }
    }

    return false;
}

// ============================================
// "WOULD I REGRET NOT SENDING" TEST
// ============================================

/**
 * The regret test: "If I don't send this and the opportunity is lost, 
 * would that feel worse than annoying them?"
 */
export function passesRegretTest(
    lead: LeadContext,
    score: SpamToleranceScore,
    justification: SpamJustification,
    arc: EscalationArc
): boolean {
    // If score is high (60+), always passes
    if (score.total >= 60) return true;

    // If no justification conditions are met, fails
    if (justification.activeCount === 0) return false;

    // If on final try (position 4), bias toward sending
    if (arc.position === 4) return true;

    // For borderline cases (30-60), need at least 2 justification conditions
    if (score.total >= 30 && score.total < 60) {
        return justification.activeCount >= 2;
    }

    // Low score with some justification
    return justification.activeCount >= 3;
}

// ============================================
// MAIN DECISION FUNCTION
// ============================================

export interface SpamLogicDecision {
    shouldFollowUp: boolean;
    score: SpamToleranceScore;
    justification: SpamJustification;
    arc: EscalationArc;
    hardLimits: HardLimitCheck;
    disengagement: DisengagementSignals;
    regretTestPassed: boolean;
    reasoning: string;
    // NEW: Enhanced decision context
    timingRelaxation: TimingRelaxation;
    sessionState: { inLiveSession: boolean; minutesSinceActivity: number; sessionBreakOccurred: boolean };
    internalThought: string; // The human-like reasoning
}

/**
 * Main entry point: Make a follow-up decision using human spam logic
 */
export function makeSpamLogicDecision(
    lead: LeadContext,
    history: ConversationMessage[],
    settings: { aggressiveness: number },
    proposedMessage?: string
): SpamLogicDecision {
    // Compute these once for efficiency
    const score = computeSpamToleranceScore(lead, history, settings);
    const justification = checkJustificationConditions(lead, history, score);
    const arc = getEscalationArc(lead.escalationArcPosition);
    const timingRelaxation = getTimingRelaxation(score.total);
    const sessionState = detectSessionState(lead.lastMessageAt, lead.lastAiFollowupAt);
    const disengagement = detectDisengagementSignals(lead, history);

    // Helper to build a negative decision with all fields
    const buildNegativeDecision = (reasoning: string, internalThought: string): SpamLogicDecision => ({
        shouldFollowUp: false,
        score,
        justification,
        arc,
        hardLimits: checkHardLimits(lead, proposedMessage),
        disengagement,
        regretTestPassed: false,
        reasoning,
        timingRelaxation,
        sessionState,
        internalThought,
    });

    // 1. Check hard limits first - these NEVER get crossed
    const hardLimits = checkHardLimits(lead, proposedMessage);
    if (hardLimits.blocked) {
        return buildNegativeDecision(
            `Blocked by hard limit: ${hardLimits.reason}`,
            `Even if I really want to send this, ${hardLimits.reason}. That's a line I won't cross.`
        );
    }

    // 2. Check disengagement signals
    if (disengagement.shouldStop) {
        return buildNegativeDecision(
            'Lead is disengaging - stopping to prevent relationship damage',
            'They\'re showing signs of disengaging. Pushing more won\'t help — it\'ll just damage the relationship.'
        );
    }

    // 3. Check escalation arc
    if (!arc.canSend) {
        return buildNegativeDecision(
            'Escalation arc complete (position 5) - no more follow-ups',
            'I\'ve already tried 4 times without a response. It\'s time to stop and respect their silence.'
        );
    }

    // 4. Check session state - within live session, be more careful
    if (sessionState.inLiveSession && score.total < 70) {
        // In live session with moderate score - need higher justification
        if (justification.activeCount < 2) {
            return buildNegativeDecision(
                `In live session (${sessionState.minutesSinceActivity}min ago) - waiting for session break`,
                `It's only been ${sessionState.minutesSinceActivity} minutes. I should wait for a natural break before following up.`
            );
        }
    }

    // 5. Low score with no justification = don't send
    if (score.interpretation === 'wait' && justification.activeCount === 0) {
        return buildNegativeDecision(
            `Score too low (${score.total}) with no justifying conditions`,
            `The expected value doesn't justify the annoyance cost right now. Better to wait.`
        );
    }

    // 6. Apply regret test for borderline cases
    const regretTestPassed = passesRegretTest(lead, score, justification, arc);

    if (score.interpretation === 'careful' && !regretTestPassed) {
        return buildNegativeDecision(
            'Borderline score - regret test failed',
            'It\'s borderline. Would I regret not sending this? Probably not. I\'ll wait.'
        );
    }

    // 7. Decision to follow up - build positive reasoning
    const reasoning = buildFollowUpReasoning(score, justification, arc, timingRelaxation);
    const internalThought = buildInternalThought(score, justification, arc, sessionState);

    return {
        shouldFollowUp: true,
        score,
        justification,
        arc,
        hardLimits,
        disengagement,
        regretTestPassed,
        reasoning,
        timingRelaxation,
        sessionState,
        internalThought,
    };
}

/**
 * Build the internal thought pattern that signals INTENT, not anxiety
 * This is what differentiates acceptable spam from bad spam
 */
function buildInternalThought(
    score: SpamToleranceScore,
    justification: SpamJustification,
    arc: EscalationArc,
    sessionState: { inLiveSession: boolean; minutesSinceActivity: number; sessionBreakOccurred: boolean }
): string {
    const parts: string[] = [];

    // Core decision framing
    if (score.total >= 70) {
        parts.push('Yes, this might annoy them.');
        parts.push('But the cost of silence is higher than the cost of interruption.');
    } else if (score.total >= 50) {
        parts.push('This is a judgment call.');
        parts.push('The potential value outweighs the small risk of interruption.');
    } else {
        parts.push('I\'m being careful here.');
        parts.push('But there\'s enough justification to proceed.');
    }

    // Channel context
    parts.push('Messenger tolerates some noise.');

    // Session context
    if (sessionState.sessionBreakOccurred) {
        parts.push(`It's been ${sessionState.minutesSinceActivity} minutes — good time to check in.`);
    }

    // Escalation context
    if (arc.position >= 3) {
        parts.push(`This is attempt ${arc.position} — I'll keep it brief and valuable.`);
    }

    // Justification
    if (justification.activeCount >= 2) {
        parts.push('Multiple factors justify reaching out:');
        parts.push(justification.reasons.slice(0, 2).join('; '));
    }

    // Closing intent
    parts.push('I\'ll send — but I\'ll keep it clean and brief.');

    return parts.join(' ');
}

function buildFollowUpReasoning(
    score: SpamToleranceScore,
    justification: SpamJustification,
    arc: EscalationArc,
    timingRelaxation: TimingRelaxation
): string {
    const parts: string[] = [];

    parts.push(`Score: ${score.total}/100 (${score.interpretation})`);
    parts.push(`Arc: ${arc.position}/5 (${arc.description})`);
    parts.push(`Justifications: ${justification.activeCount}/4`);
    parts.push(`Timing: ${timingRelaxation.description}`);

    if (justification.reasons.length > 0) {
        parts.push(`Why: ${justification.reasons[0]}`);
    }

    return parts.join(' | ');
}

