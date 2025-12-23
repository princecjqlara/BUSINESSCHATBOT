/**
 * AI Autonomous Follow-up Service
 * 
 * This service enables the AI to autonomously decide when and how to follow up
 * with leads based on conversation history, best contact times, and AI intuition.
 * 
 * NOW WITH HUMAN SPAM LOGIC: Makes decisions like a human salesperson would.
 * Core principle: "Is the expected value > the annoyance cost?"
 */

import { supabase } from './supabase';
import { getBestContactTimes, BestContactTimesData } from './bestContactTimesService';
import { getNextBestContactTimeWindow, isWithinBestContactTime } from './bestContactTimeChecker';
import { sendMessengerMessage } from './messengerService';
import {
    makeSpamLogicDecision,
    LeadContext,
    ConversationMessage as SpamLogicMessage,
    SpamLogicDecision,
    advanceEscalationArc,
    resetEscalationArc,
    classifySpamSignal,
    getTimingRelaxation,
    detectSessionState,
    SpamSignalAnalysis,
} from './humanSpamLogic';
import OpenAI from 'openai';

// Initialize NVIDIA client for AI decisions
const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY || '',
});

export interface LeadForFollowup {
    id: string;
    sender_id: string;
    name: string | null;
    pipeline_stage_name: string | null;
    last_message_at: string | null;
    last_ai_followup_at: string | null;
    message_count: number;
    best_contact_times: BestContactTimesData | null;
    ai_followup_count: number;
    // Human Spam Logic fields
    escalation_arc_position: number;
    consecutive_followups_no_response: number;
    disengagement_signals: Record<string, unknown>;
}

export interface FollowupDecision {
    shouldFollowup: boolean;
    reasoning: string;
    followupType: 'stale_conversation' | 're_engagement' | 'nurture' | 'custom';
    urgency: 'low' | 'medium' | 'high';
    suggestedApproach: string;
}

export interface GeneratedFollowup {
    message: string;
    reasoning: string;
    scheduledFor: Date | null;
    bestTimeWindow: { dayOfWeek: string; timeRange: string } | null;
}

interface BotSettings {
    enable_ai_autonomous_followup: boolean;
    enable_best_time_contact: boolean;
    ai_followup_cooldown_hours: number;
    ai_followup_stale_threshold_hours: number;
    ai_followup_max_per_lead: number;
    ai_followup_aggressiveness: number; // 1-10 scale: 1=conservative, 10=very aggressive
    bot_name: string;
    bot_tone: string;
    bot_instructions: string | null;
}

/**
 * Aggressiveness level descriptions and parameters
 * Level 1-3: Conservative (1-2 follow-ups/week, longer waits)
 * Level 4-6: Moderate (3-5 follow-ups/week, balanced)
 * Level 7-10: Aggressive (5-10+ follow-ups/week, quick engagement)
 */
function getAggressivenessConfig(level: number) {
    // Clamp to 1-10
    const safeLevel = Math.max(1, Math.min(10, level));

    // Calculate parameters based on level
    // Min cooldown: 0.5h (level 10) to 12h (level 1)
    const minCooldownHours = Math.max(0.5, 12 - (safeLevel * 1.15));

    // Max follow-ups per lead: 2 (level 1) to 15 (level 10)
    const maxPerLead = Math.round(2 + (safeLevel * 1.3));

    return {
        minCooldownHours,
        maxPerLead,
        description: safeLevel <= 3 ? 'Conservative' : safeLevel <= 6 ? 'Moderate' : 'Aggressive',
        estimatedMessagesPerWeek: {
            min: Math.round(safeLevel * 0.5),
            max: Math.round(safeLevel * 2),
        }
    };
}

/**
 * Get bot settings for autonomous follow-up
 */
async function getFollowupSettings(): Promise<BotSettings> {
    const { data, error } = await supabase
        .from('bot_settings')
        .select('*')
        .limit(1)
        .single();

    if (error || !data) {
        return {
            enable_ai_autonomous_followup: false,
            enable_best_time_contact: false,
            ai_followup_cooldown_hours: 4,
            ai_followup_stale_threshold_hours: 1,
            ai_followup_max_per_lead: 5,
            ai_followup_aggressiveness: 5, // Default: moderate
            bot_name: 'Assistant',
            bot_tone: 'friendly and professional',
            bot_instructions: null,
        };
    }

    return {
        enable_ai_autonomous_followup: data.enable_ai_autonomous_followup ?? false,
        enable_best_time_contact: data.enable_best_time_contact ?? false,
        ai_followup_cooldown_hours: data.ai_followup_cooldown_hours ?? 4,
        ai_followup_stale_threshold_hours: data.ai_followup_stale_threshold_hours ?? 1,
        ai_followup_max_per_lead: data.ai_followup_max_per_lead ?? 5,
        ai_followup_aggressiveness: data.ai_followup_aggressiveness ?? 5,
        bot_name: data.bot_name ?? 'Assistant',
        bot_tone: data.bot_tone ?? 'friendly and professional',
        bot_instructions: data.bot_instructions ?? null,
    };
}

/**
 * Get leads that may need an AI-initiated follow-up
 * Now uses Human Spam Logic: position 5 leads are excluded (escalation complete)
 */
export async function getLeadsNeedingFollowup(limit: number = 20): Promise<LeadForFollowup[]> {
    const settings = await getFollowupSettings();

    if (!settings.enable_ai_autonomous_followup) {
        console.log('[AI Followup] Feature disabled');
        return [];
    }

    // Minimal anti-spam cooldown (30min) - just to prevent rapid-fire messages
    const minCooldownMs = 30 * 60 * 1000; // 30 minutes
    const now = new Date();
    const minCooldownThreshold = new Date(now.getTime() - minCooldownMs);

    // Look at leads with activity in the last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get active leads - exclude those at escalation position 5 (stopped)
    const { data: leads, error } = await supabase
        .from('leads')
        .select(`
            id,
            sender_id,
            name,
            last_message_at,
            last_ai_followup_at,
            message_count,
            best_contact_times,
            bot_disabled,
            escalation_arc_position,
            consecutive_followups_no_response,
            disengagement_signals,
            pipeline_stages(name)
        `)
        .eq('bot_disabled', false)
        .gt('last_message_at', thirtyDaysAgo.toISOString())
        .or(`last_ai_followup_at.is.null,last_ai_followup_at.lt.${minCooldownThreshold.toISOString()}`)
        .or('escalation_arc_position.is.null,escalation_arc_position.lt.5') // Exclude position 5 (stopped)
        .gte('message_count', 0)
        .order('last_ai_followup_at', { ascending: true, nullsFirst: true })
        .limit(limit);

    if (error) {
        console.error('[AI Followup] Error fetching leads:', error);
        return [];
    }

    if (!leads || leads.length === 0) {
        return [];
    }

    // Check follow-up count per lead
    interface LeadFromDB {
        id: string;
        sender_id: string;
        name: string | null;
        last_message_at: string | null;
        last_ai_followup_at: string | null;
        message_count: number | null;
        best_contact_times: unknown;
        bot_disabled: boolean;
        escalation_arc_position: number | null;
        consecutive_followups_no_response: number | null;
        disengagement_signals: Record<string, unknown> | null;
        pipeline_stages: { name: string } | null;
    }

    const leadsWithCounts = await Promise.all(
        (leads as LeadFromDB[]).map(async (lead: LeadFromDB) => {
            const { count } = await supabase
                .from('ai_followups')
                .select('*', { count: 'exact', head: true })
                .eq('lead_id', lead.id)
                .in('status', ['sent', 'scheduled']);

            const followupCount = count || 0;

            // Skip if already at max follow-ups
            if (followupCount >= settings.ai_followup_max_per_lead) {
                return null;
            }

            return {
                id: lead.id,
                sender_id: lead.sender_id,
                name: lead.name,
                pipeline_stage_name: (lead.pipeline_stages as { name: string } | null)?.name || null,
                last_message_at: lead.last_message_at,
                last_ai_followup_at: lead.last_ai_followup_at,
                message_count: lead.message_count || 0,
                best_contact_times: lead.best_contact_times as BestContactTimesData | null,
                ai_followup_count: followupCount,
                // Human Spam Logic fields
                escalation_arc_position: lead.escalation_arc_position || 1,
                consecutive_followups_no_response: lead.consecutive_followups_no_response || 0,
                disengagement_signals: lead.disengagement_signals || {},
            };
        })
    );

    return leadsWithCounts.filter((lead): lead is LeadForFollowup => lead !== null);
}


/**
 * Use AI to decide if a follow-up is appropriate for this lead
 * NOW WITH HUMAN SPAM LOGIC: Uses spam tolerance framework before AI decision
 */
export async function shouldAiFollowup(
    lead: LeadForFollowup,
    conversationHistory: { role: string; content: string }[]
): Promise<FollowupDecision & { spamLogicDecision?: SpamLogicDecision }> {
    const settings = await getFollowupSettings();

    // Convert lead to LeadContext for Human Spam Logic
    const leadContext: LeadContext = {
        id: lead.id,
        senderId: lead.sender_id,
        name: lead.name,
        pipelineStage: lead.pipeline_stage_name,
        messageCount: lead.message_count,
        lastMessageAt: lead.last_message_at ? new Date(lead.last_message_at) : null,
        lastAiFollowupAt: lead.last_ai_followup_at ? new Date(lead.last_ai_followup_at) : null,
        escalationArcPosition: lead.escalation_arc_position || 1,
        consecutiveFollowupsNoResponse: lead.consecutive_followups_no_response || 0,
        disengagementSignals: lead.disengagement_signals || {},
    };

    // Convert conversation history for spam logic
    const spamLogicHistory: SpamLogicMessage[] = conversationHistory.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
    }));

    // ========================================
    // STEP 1: Apply Human Spam Logic Framework
    // ========================================
    const spamDecision = makeSpamLogicDecision(
        leadContext,
        spamLogicHistory,
        { aggressiveness: settings.ai_followup_aggressiveness }
    );

    console.log(`[AI Followup] Human Spam Logic for ${lead.name || lead.id}:`, {
        score: spamDecision.score.total,
        interpretation: spamDecision.score.interpretation,
        escalationPosition: spamDecision.arc.position,
        shouldFollowUp: spamDecision.shouldFollowUp,
        reasoning: spamDecision.reasoning,
        timing: spamDecision.timingRelaxation?.description,
        sessionBreak: spamDecision.sessionState?.sessionBreakOccurred,
        internalThought: spamDecision.internalThought?.substring(0, 100),
    });

    // If Human Spam Logic says NO, respect it immediately
    if (!spamDecision.shouldFollowUp) {
        return {
            shouldFollowup: false,
            reasoning: `Human Spam Logic: ${spamDecision.reasoning}`,
            followupType: 'stale_conversation',
            urgency: 'low',
            suggestedApproach: '',
            spamLogicDecision: spamDecision,
        };
    }

    // ========================================
    // STEP 2: AI Decision with Spam Context
    // ========================================
    const lastMessageAt = lead.last_message_at ? new Date(lead.last_message_at) : null;
    const hoursSinceLastMessage = lastMessageAt
        ? Math.round((Date.now() - lastMessageAt.getTime()) / (1000 * 60 * 60))
        : null;

    const conversationSummary = conversationHistory
        .slice(-10)
        .map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content}`)
        .join('\n');

    // Build Human Spam Logic context for AI
    const score = spamDecision.score;
    const justification = spamDecision.justification;
    const arc = spamDecision.arc;
    const timingRelaxation = spamDecision.timingRelaxation;
    const sessionState = spamDecision.sessionState;
    const internalThought = spamDecision.internalThought;

    const prompt = `You are an AI SALES assistant making follow-up decisions using HUMAN LOGIC.

CORE PRINCIPLE: Don't ask "Am I being spammy?" - Ask "Is the expected value > the annoyance cost?"

============== INTERNAL THOUGHT (AI'S REASONING) ==============
"${internalThought}"

============== SPAM TOLERANCE ANALYSIS ==============
SCORE: ${score.total}/100 (${score.interpretation.toUpperCase()})
Breakdown:
- Stakes: ${score.breakdown.stakes}/25 (${score.breakdown.stakes >= 15 ? '⬆️ High' : score.breakdown.stakes >= 8 ? '➡️ Medium' : '⬇️ Low'})
- Warmth: ${score.breakdown.warmth}/20 (${score.breakdown.warmth >= 12 ? '⬆️ Warm' : score.breakdown.warmth >= 7 ? '➡️ Lukewarm' : '⬇️ Cold'})
- Channel: ${score.breakdown.channelNorms}/15 (Messenger = tolerant)
- Urgency: ${score.breakdown.timePressure}/15
- Engagement: ${score.breakdown.engagement}/15
- Ambiguity: ${score.breakdown.silenceAmbiguity}/10

TIMING: ${timingRelaxation.description}
- Min interval: ${timingRelaxation.minIntervalMinutes} minutes
- Session break: ${sessionState.sessionBreakOccurred ? 'Yes ✓' : `No (${sessionState.minutesSinceActivity}min ago)`}

ESCALATION ARC: Position ${arc.position}/5 (${arc.description})
${arc.position === 1 ? '→ First follow-up - normal spacing' :
            arc.position === 2 ? '→ Second attempt - shorter timing OK' :
                arc.position === 3 ? '→ Urgent nudge - be direct but friendly' :
                    arc.position === 4 ? '→ FINAL attempt - make it count!' :
                        '→ STOPPED - no more follow-ups'}

JUSTIFICATION CONDITIONS (${justification.activeCount}/4 active):
${justification.conditions.highStakes ? '✓' : '○'} A. Stakes are high
${justification.conditions.ambiguousSilence ? '✓' : '○'} B. Silence is ambiguous (no clear "no")
${justification.conditions.tolerantChannel ? '✓' : '○'} C. Channel tolerates noise
${justification.conditions.asymmetricValue ? '✓' : '○'} D. Value to them > interruption cost

============== CUSTOMER CONTEXT ==============
- Name: ${lead.name || 'Unknown'}
- Pipeline Stage: ${lead.pipeline_stage_name || 'New Lead'}
- Total Messages: ${lead.message_count}
- Hours Since Last Message: ${hoursSinceLastMessage || 'Unknown'}
- Follow-ups Without Response: ${lead.consecutive_followups_no_response || 0}

============== RECENT CONVERSATION ==============
${conversationSummary || '(No recent conversation)'}

============== SPAM SIGNAL GUIDANCE ==============
Your message should signal ACCEPTABLE qualities:
✅ URGENCY: "This is time-sensitive" - shows importance, not desperation
✅ CARE: "I'm thinking about you" - shows genuine interest
✅ RESPONSIBILITY: "I'm doing my job well" - shows professionalism

Your message must AVOID signaling BAD qualities:
❌ ANXIETY: "I'm nervous you haven't replied" - sounds needy
❌ AUTOMATION: "This message feels robotic" - sounds impersonal  
❌ DESPERATION: "Please please respond" - sounds pushy

============== YOUR TASK ==============
The Human Spam Logic framework already approved this follow-up (score ${score.total}).
Now decide the APPROACH and TYPE of follow-up.

Consider:
1. At escalation position ${arc.position}, what tone is appropriate?
2. What value can we provide in this follow-up?
3. How can we re-engage without being pushy?

RESPOND IN JSON FORMAT ONLY:
{
    "shouldFollowup": true,
    "reasoning": "Brief explanation using human logic",
    "followupType": "stale_conversation" | "re_engagement" | "nurture",
    "urgency": "${arc.position >= 3 ? 'high' : arc.position >= 2 ? 'medium' : 'low'}",
    "suggestedApproach": "What the follow-up should focus on",
    "tone": "friendly" | "curious" | "helpful" | "direct",
    "signalType": "urgency" | "care" | "responsibility"
}`;

    try {
        const response = await client.chat.completions.create({
            model: 'deepseek-ai/deepseek-v3.1',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 500,
        });

        const content = response.choices[0]?.message?.content || '';

        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                shouldFollowup: true, // We already passed spam logic check
                reasoning: `${parsed.reasoning} [Score: ${score.total}/100, Arc: ${arc.position}/5]`,
                followupType: parsed.followupType || 'stale_conversation',
                urgency: parsed.urgency || (arc.position >= 3 ? 'high' : 'medium'),
                suggestedApproach: parsed.suggestedApproach || 'Friendly check-in',
                spamLogicDecision: spamDecision,
            };
        }
    } catch (error) {
        console.error('[AI Followup] Error in decision:', error);
    }

    // Default: proceed with follow-up since spam logic approved
    return {
        shouldFollowup: true,
        reasoning: `Spam Logic approved (${score.total}/100) - defaulting to follow-up`,
        followupType: 'stale_conversation',
        urgency: arc.position >= 3 ? 'high' : 'medium',
        suggestedApproach: 'General check-in with value',
        spamLogicDecision: spamDecision,
    };
}


/**
 * Generate a personalized follow-up message using AI
 */
export async function generateAiFollowupMessage(
    lead: LeadForFollowup,
    decision: FollowupDecision,
    conversationHistory: { role: string; content: string }[]
): Promise<GeneratedFollowup> {
    const settings = await getFollowupSettings();

    const conversationSummary = conversationHistory
        .slice(-10)
        .map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content}`)
        .join('\n');

    const prompt = `You are ${settings.bot_name}, a ${settings.bot_tone} Filipino sales assistant.

TASK: Generate a natural, non-pushy follow-up message for this customer.

CUSTOMER CONTEXT:
- Name: ${lead.name || 'the customer'}
- Pipeline Stage: ${lead.pipeline_stage_name || 'New Lead'}
- Follow-up Type: ${decision.followupType}
- Suggested Approach: ${decision.suggestedApproach}

RECENT CONVERSATION:
${conversationSummary || '(No recent conversation)'}

${settings.bot_instructions ? `BOT INSTRUCTIONS:\n${settings.bot_instructions}\n` : ''}

REQUIREMENTS:
1. Use Taglish (mix of Tagalog and English) if appropriate
2. Keep the message SHORT (1-2 sentences max)
3. Be warm and genuine, NOT pushy or salesy
4. Reference something specific from the conversation if possible
5. Include a gentle call-to-action or question
6. Use 1-2 emojis max

DO NOT:
- Use high-pressure tactics
- Create fake urgency
- Sound robotic or templated
- Repeat information already discussed

RESPOND WITH ONLY THE MESSAGE TEXT, nothing else.`;

    try {
        const response = await client.chat.completions.create({
            model: 'deepseek-ai/deepseek-v3.1',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 200,
        });

        const message = response.choices[0]?.message?.content?.trim() || '';

        // Calculate scheduling based on best contact times
        let scheduledFor: Date | null = null;
        let bestTimeWindow: { dayOfWeek: string; timeRange: string } | null = null;

        if (settings.enable_best_time_contact && lead.best_contact_times) {
            if (isWithinBestContactTime(lead.best_contact_times)) {
                // We're already in a good window - schedule for now
                scheduledFor = new Date();
            } else {
                // Find next best time
                const nextWindow = getNextBestContactTimeWindow(lead.best_contact_times);
                if (nextWindow) {
                    scheduledFor = nextWindow.date;
                    bestTimeWindow = {
                        dayOfWeek: nextWindow.window.dayOfWeek,
                        timeRange: nextWindow.window.timeRange,
                    };
                }
            }
        }

        // Default to now if no best time available
        if (!scheduledFor) {
            scheduledFor = new Date();
        }

        return {
            message,
            reasoning: decision.reasoning,
            scheduledFor,
            bestTimeWindow,
        };
    } catch (error) {
        console.error('[AI Followup] Error generating message:', error);
        throw error;
    }
}

/**
 * Schedule and track an AI-initiated follow-up
 * Now includes Human Spam Logic tracking and escalation arc advancement
 */
export async function scheduleAiFollowup(
    lead: LeadForFollowup,
    followup: GeneratedFollowup,
    decision: FollowupDecision & { spamLogicDecision?: SpamLogicDecision }
): Promise<{ success: boolean; followupId?: string; error?: string }> {
    try {
        // Extract spam logic data if available
        const spamLogic = decision.spamLogicDecision;

        // Create the follow-up record with spam logic tracking
        const { data: followupRecord, error: insertError } = await supabase
            .from('ai_followups')
            .insert({
                lead_id: lead.id,
                sender_id: lead.sender_id,
                message_text: followup.message,
                ai_reasoning: followup.reasoning,
                followup_type: decision.followupType,
                status: followup.scheduledFor && followup.scheduledFor > new Date() ? 'scheduled' : 'pending',
                scheduled_for: followup.scheduledFor?.toISOString() || new Date().toISOString(),
                best_contact_time_used: followup.bestTimeWindow,
                conversation_context: {
                    urgency: decision.urgency,
                    suggestedApproach: decision.suggestedApproach,
                    leadName: lead.name,
                    pipelineStage: lead.pipeline_stage_name,
                },
                // Human Spam Logic tracking fields
                spam_tolerance_score: spamLogic?.score.total ?? null,
                justification_conditions: spamLogic ? [
                    spamLogic.justification.conditions.highStakes ? 'highStakes' : null,
                    spamLogic.justification.conditions.ambiguousSilence ? 'ambiguousSilence' : null,
                    spamLogic.justification.conditions.tolerantChannel ? 'tolerantChannel' : null,
                    spamLogic.justification.conditions.asymmetricValue ? 'asymmetricValue' : null,
                ].filter(Boolean) : [],
                regret_test_passed: spamLogic?.regretTestPassed ?? null,
                escalation_position: spamLogic?.arc.position ?? lead.escalation_arc_position,
                score_breakdown: spamLogic?.score.breakdown ?? null,
            })
            .select()
            .single();

        if (insertError) {
            console.error('[AI Followup] Error creating record:', insertError);
            return { success: false, error: insertError.message };
        }

        // If scheduled for now or past, send immediately
        if (!followup.scheduledFor || followup.scheduledFor <= new Date()) {
            await sendFollowupMessage(followupRecord.id, lead.sender_id, followup.message);

            // Advance escalation arc after sending
            const newPosition = Math.min(5, (lead.escalation_arc_position || 1) + 1);
            await supabase
                .from('leads')
                .update({
                    escalation_arc_position: newPosition,
                    consecutive_followups_no_response: (lead.consecutive_followups_no_response || 0) + 1,
                    follow_up_sequence_started_at: lead.escalation_arc_position === 1
                        ? new Date().toISOString()
                        : undefined, // Only set on first follow-up in sequence
                })
                .eq('id', lead.id);

            console.log(`[AI Followup] Advanced escalation arc for lead ${lead.id}: ${lead.escalation_arc_position || 1} -> ${newPosition}`);
        }

        console.log(`[AI Followup] Scheduled for lead ${lead.id}: "${followup.message.substring(0, 50)}..." [Score: ${spamLogic?.score.total ?? 'N/A'}, Arc: ${spamLogic?.arc.position ?? 'N/A'}]`);
        return { success: true, followupId: followupRecord.id };
    } catch (error) {
        console.error('[AI Followup] Error scheduling:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}


/**
 * Send a follow-up message and update its status
 */
async function sendFollowupMessage(
    followupId: string,
    senderId: string,
    message: string
): Promise<boolean> {
    try {
        await sendMessengerMessage(senderId, message, {
            messagingType: 'MESSAGE_TAG',
            tag: 'ACCOUNT_UPDATE',
        });

        // Update record to sent
        await supabase
            .from('ai_followups')
            .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
            })
            .eq('id', followupId);

        // Update lead's last AI follow-up timestamp
        await supabase
            .from('leads')
            .update({ last_ai_followup_at: new Date().toISOString() })
            .eq('sender_id', senderId);

        return true;
    } catch (error) {
        console.error('[AI Followup] Error sending:', error);

        await supabase
            .from('ai_followups')
            .update({
                status: 'failed',
                error_message: error instanceof Error ? error.message : 'Unknown error',
            })
            .eq('id', followupId);

        return false;
    }
}

/**
 * Process scheduled follow-ups that are due
 */
export async function processScheduledFollowups(): Promise<{ processed: number; sent: number; failed: number }> {
    const now = new Date();

    const { data: pendingFollowups, error } = await supabase
        .from('ai_followups')
        .select('*')
        .eq('status', 'scheduled')
        .lte('scheduled_for', now.toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(20);

    if (error || !pendingFollowups || pendingFollowups.length === 0) {
        return { processed: 0, sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const followup of pendingFollowups) {
        const success = await sendFollowupMessage(
            followup.id,
            followup.sender_id,
            followup.message_text
        );

        if (success) {
            sent++;
        } else {
            failed++;
        }
    }

    return { processed: pendingFollowups.length, sent, failed };
}

/**
 * Get conversation history for a lead
 */
async function getConversationHistory(senderId: string): Promise<{ role: string; content: string }[]> {
    const { data: messages, error } = await supabase
        .from('conversations')
        .select('role, content')
        .eq('sender_id', senderId)
        .order('created_at', { ascending: true })
        .limit(20);

    if (error || !messages) {
        return [];
    }

    return messages;
}

/**
 * Main function to run the AI autonomous follow-up process
 */
export async function runAiAutonomousFollowups(): Promise<{
    leadsChecked: number;
    followupsScheduled: number;
    followupsSent: number;
    errors: string[];
}> {
    const errors: string[] = [];
    let followupsScheduled = 0;
    let followupsSent = 0;

    console.log('[AI Followup] Starting autonomous follow-up run...');

    // First, process any scheduled follow-ups that are due
    const processed = await processScheduledFollowups();
    followupsSent += processed.sent;
    console.log(`[AI Followup] Processed ${processed.processed} scheduled follow-ups (${processed.sent} sent, ${processed.failed} failed)`);

    // Get leads that might need follow-up
    const leads = await getLeadsNeedingFollowup();
    console.log(`[AI Followup] Found ${leads.length} leads to evaluate`);

    for (const lead of leads) {
        try {
            // Get conversation history
            const history = await getConversationHistory(lead.sender_id);

            // Ask AI if we should follow up
            const decision = await shouldAiFollowup(lead, history);

            if (!decision.shouldFollowup) {
                console.log(`[AI Followup] Skipping lead ${lead.id}: ${decision.reasoning}`);
                continue;
            }

            // Generate and schedule the follow-up
            const followup = await generateAiFollowupMessage(lead, decision, history);
            const result = await scheduleAiFollowup(lead, followup, decision);

            if (result.success) {
                followupsScheduled++;
                if (!followup.scheduledFor || followup.scheduledFor <= new Date()) {
                    followupsSent++;
                }
            } else if (result.error) {
                errors.push(`Lead ${lead.id}: ${result.error}`);
            }
        } catch (error) {
            const errorMsg = `Lead ${lead.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(`[AI Followup] Error:`, error);
        }
    }

    console.log(`[AI Followup] Run complete: ${followupsScheduled} scheduled, ${followupsSent} sent, ${errors.length} errors`);

    return {
        leadsChecked: leads.length,
        followupsScheduled,
        followupsSent,
        errors,
    };
}

/**
 * Cancel pending/scheduled follow-ups for a lead when they reply
 * This is called when a user sends a message to stop any scheduled follow-ups
 * NOW ALSO RESETS HUMAN SPAM LOGIC ESCALATION ARC
 */
export async function cancelPendingFollowupsForLead(leadId: string): Promise<{ cancelled: number; error?: string }> {
    try {
        console.log(`[AI Followup] Cancelling pending follow-ups for lead ${leadId} (user replied)`);

        // Update all pending/scheduled follow-ups to 'cancelled'
        const { data, error } = await supabase
            .from('ai_followups')
            .update({
                status: 'cancelled'
            })
            .eq('lead_id', leadId)
            .in('status', ['pending', 'scheduled'])
            .select('id');

        if (error) {
            console.error(`[AI Followup] Error cancelling follow-ups:`, error);
            return { cancelled: 0, error: error.message };
        }

        const cancelledCount = data?.length || 0;

        // HUMAN SPAM LOGIC: Reset escalation arc when lead responds
        // This is the key behavior - when they reply, we start fresh
        const { error: resetError } = await supabase
            .from('leads')
            .update({
                escalation_arc_position: 1,            // Back to normal spacing
                consecutive_followups_no_response: 0,  // They responded!
                follow_up_sequence_started_at: null,   // Clear sequence
                disengagement_signals: {},             // Fresh start
            })
            .eq('id', leadId);

        if (resetError) {
            console.error(`[AI Followup] Error resetting escalation arc:`, resetError);
        } else {
            console.log(`[AI Followup] Reset escalation arc for lead ${leadId} (user replied)`);
        }

        if (cancelledCount > 0) {
            console.log(`[AI Followup] Cancelled ${cancelledCount} pending follow-up(s) for lead ${leadId}`);
        }

        return { cancelled: cancelledCount };
    } catch (error) {
        console.error(`[AI Followup] Error in cancelPendingFollowupsForLead:`, error);
        return { cancelled: 0, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// Re-export resetEscalationArc for external use
export { resetEscalationArc };
