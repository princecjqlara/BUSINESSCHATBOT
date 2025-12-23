/**
 * AI Autonomous Follow-up Service
 * 
 * This service enables the AI to autonomously decide when and how to follow up
 * with leads based on conversation history, best contact times, and AI intuition.
 */

import { supabase } from './supabase';
import { getBestContactTimes, BestContactTimesData } from './bestContactTimesService';
import { getNextBestContactTimeWindow, isWithinBestContactTime } from './bestContactTimeChecker';
import { sendMessengerMessage } from './messengerService';
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
 * AI will decide based on context whether to follow up, not fixed time thresholds
 */
export async function getLeadsNeedingFollowup(limit: number = 20): Promise<LeadForFollowup[]> {
    const settings = await getFollowupSettings();

    if (!settings.enable_ai_autonomous_followup) {
        console.log('[AI Followup] Feature disabled');
        return [];
    }

    // Minimal anti-spam cooldown (1 hour) - just to prevent rapid-fire messages
    const minCooldownMs = 60 * 60 * 1000; // 1 hour
    const now = new Date();
    const minCooldownThreshold = new Date(now.getTime() - minCooldownMs);

    // Only look at leads with activity in the last 7 days (active leads)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get active leads - let AI decide if they need follow-up
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
            pipeline_stages(name)
        `)
        .eq('bot_disabled', false)
        .gt('last_message_at', sevenDaysAgo.toISOString()) // Only active leads (last 7 days)
        .or(`last_ai_followup_at.is.null,last_ai_followup_at.lt.${minCooldownThreshold.toISOString()}`) // Anti-spam only
        .gt('message_count', 0) // Any conversation history
        .order('last_message_at', { ascending: false }) // Most recent first
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
            };
        })
    );

    return leadsWithCounts.filter((lead): lead is LeadForFollowup => lead !== null);
}

/**
 * Use AI to decide if a follow-up is appropriate for this lead
 */
export async function shouldAiFollowup(
    lead: LeadForFollowup,
    conversationHistory: { role: string; content: string }[]
): Promise<FollowupDecision> {
    const settings = await getFollowupSettings();

    // Calculate time since last message
    const lastMessageAt = lead.last_message_at ? new Date(lead.last_message_at) : null;
    const hoursSinceLastMessage = lastMessageAt
        ? Math.round((Date.now() - lastMessageAt.getTime()) / (1000 * 60 * 60))
        : null;

    const conversationSummary = conversationHistory
        .slice(-10)
        .map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content}`)
        .join('\n');

    // Get aggressiveness config
    const aggressivenessConfig = getAggressivenessConfig(settings.ai_followup_aggressiveness);
    const aggressivenessLevel = settings.ai_followup_aggressiveness;

    const prompt = `You are an AI SALES assistant whose PRIMARY GOAL is CLOSING DEALS through follow-ups.

AGGRESSIVENESS LEVEL: ${aggressivenessLevel}/10 (${aggressivenessConfig.description})
${aggressivenessLevel >= 7 ? '→ Be VERY proactive, follow up quickly and frequently' :
            aggressivenessLevel >= 4 ? '→ Balance follow-up frequency with not being pushy' :
                '→ Be conservative, only follow up when clearly needed'}

CUSTOMER CONTEXT:
- Name: ${lead.name || 'Unknown'}
- Pipeline Stage: ${lead.pipeline_stage_name || 'New Lead'}
- Total Messages Exchanged: ${lead.message_count}
- Hours Since Last Message: ${hoursSinceLastMessage || 'Unknown'}
- Last AI Follow-up: ${lead.last_ai_followup_at ? new Date(lead.last_ai_followup_at).toLocaleDateString() : 'Never'}
- Follow-ups Already Sent: ${lead.ai_followup_count || 0}

RECENT CONVERSATION:
${conversationSummary || '(No recent conversation)'}

FOLLOW-UP GUIDELINES (based on aggressiveness ${aggressivenessLevel}/10):
${aggressivenessLevel >= 7 ? `
1. Follow up IMMEDIATELY if silent for >30 minutes
2. Be persistent but friendly
3. Multiple follow-ups are OK (up to ${aggressivenessConfig.maxPerLead} per lead)
4. Don't wait - every hour is a lost opportunity
` : aggressivenessLevel >= 4 ? `
1. Follow up if silent for 2-6 hours
2. Space out follow-ups reasonably
3. Up to ${aggressivenessConfig.maxPerLead} follow-ups per lead
4. Balance persistence with respect
` : `
1. Only follow up if clearly interested but went quiet
2. Wait at least 12+ hours before following up
3. Maximum ${aggressivenessConfig.maxPerLead} follow-ups per lead
4. Prioritize quality over quantity
`}

RESPOND IN JSON FORMAT ONLY:
{
    "shouldFollowup": true/false,
    "reasoning": "Brief explanation of your decision",
    "followupType": "stale_conversation" | "re_engagement" | "nurture",
    "urgency": "low" | "medium" | "high",
    "suggestedApproach": "Brief description of what the follow-up should focus on",
    "waitHours": 0 // Number of hours to wait before sending (0 = send now, or specify future time)
}`;

    try {
        const response = await client.chat.completions.create({
            model: settings.bot_name ? 'deepseek-ai/deepseek-r1' : 'deepseek-ai/deepseek-v3.1',
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
                shouldFollowup: parsed.shouldFollowup ?? false,
                reasoning: parsed.reasoning || 'No reasoning provided',
                followupType: parsed.followupType || 'stale_conversation',
                urgency: parsed.urgency || 'low',
                suggestedApproach: parsed.suggestedApproach || 'General check-in',
            };
        }
    } catch (error) {
        console.error('[AI Followup] Error in decision:', error);
    }

    return {
        shouldFollowup: false,
        reasoning: 'Unable to determine - defaulting to no follow-up',
        followupType: 'stale_conversation',
        urgency: 'low',
        suggestedApproach: '',
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
 */
export async function scheduleAiFollowup(
    lead: LeadForFollowup,
    followup: GeneratedFollowup,
    decision: FollowupDecision
): Promise<{ success: boolean; followupId?: string; error?: string }> {
    try {
        // Create the follow-up record
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
        }

        console.log(`[AI Followup] Scheduled for lead ${lead.id}: "${followup.message.substring(0, 50)}..."`);
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
