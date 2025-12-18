/**
 * Conversation Analysis Service
 * Analyzes chatbot conversations for mistakes and opportunities, similar to chess engine analysis
 */

import { supabase } from './supabase';
import OpenAI from 'openai';

// Use OpenAI SDK with NVIDIA API (same pattern as other files)
const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

// AI models for conversation analysis
const ANALYSIS_MODELS = [
    'meta/llama-3.1-70b-instruct',
    'deepseek-ai/deepseek-v3.1',
    'meta/llama-3.1-8b-instruct',
];

// Stage names that trigger automatic conversation analysis
const ANALYSIS_TRIGGER_STAGES = [
    'lost', 'won', 'closed',
    'deal lost', 'deal won', 'deal closed',
    'converted', 'completed', 'finished',
    'cancelled', 'rejected'
];

// Types
export interface MessageAnalysis {
    rating: 'excellent' | 'good' | 'questionable' | 'mistake' | 'blunder';
    score: number; // 0-100
    issues: string[];
    betterResponse?: string;
    explanation: string;
    missedOpportunities?: string[];
}

export interface AnalyzedMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    analysis?: MessageAnalysis;
}

export interface ConversationAnalysis {
    messages: AnalyzedMessage[];
    summary: {
        overallScore: number;
        mistakeCount: number;
        blunderCount: number;
        excellentCount: number;
        goodCount: number;
        questionableCount: number;
        keyInsights: string[];
        improvementAreas: string[];
    };
    leadInfo?: {
        id: string;
        name: string | null;
        phone: string | null;
    };
}

export interface RecentConversation {
    senderId: string;
    leadId: string | null;
    leadName: string | null;
    messageCount: number;
    lastMessageAt: string;
}

/**
 * Get recent conversations with leads for the selector
 */
export async function getRecentConversationsWithLeads(limit: number = 20): Promise<RecentConversation[]> {
    try {
        // Get distinct sender_ids with their message counts and last message time
        const { data: conversationStats, error } = await supabase
            .from('conversations')
            .select('sender_id, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[ConversationAnalysis] Error fetching conversations:', error);
            return [];
        }

        // Group by sender_id
        const senderMap = new Map<string, { count: number; lastMessageAt: string }>();
        for (const conv of conversationStats || []) {
            if (!senderMap.has(conv.sender_id)) {
                senderMap.set(conv.sender_id, { count: 1, lastMessageAt: conv.created_at });
            } else {
                const existing = senderMap.get(conv.sender_id)!;
                existing.count++;
            }
        }

        // Get lead info for these senders
        const senderIds = Array.from(senderMap.keys()).slice(0, limit);
        const { data: leads } = await supabase
            .from('leads')
            .select('id, sender_id, name, phone')
            .in('sender_id', senderIds);

        const leadMap = new Map<string, { id: string; name: string | null; phone: string | null }>();
        for (const lead of leads || []) {
            leadMap.set(lead.sender_id, { id: lead.id, name: lead.name, phone: lead.phone });
        }

        // Build result
        const results: RecentConversation[] = [];
        for (const [senderId, stats] of senderMap) {
            if (results.length >= limit) break;
            const lead = leadMap.get(senderId);
            results.push({
                senderId,
                leadId: lead?.id || null,
                leadName: lead?.name || null,
                messageCount: stats.count,
                lastMessageAt: stats.lastMessageAt,
            });
        }

        return results;
    } catch (error) {
        console.error('[ConversationAnalysis] Error:', error);
        return [];
    }
}

/**
 * Fetch conversation history for a sender
 */
async function fetchConversationHistory(senderId: string, limit: number = 50): Promise<AnalyzedMessage[]> {
    const { data: messages, error } = await supabase
        .from('conversations')
        .select('id, role, content, created_at')
        .eq('sender_id', senderId)
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) {
        console.error('[ConversationAnalysis] Error fetching history:', error);
        return [];
    }

    interface MessageRow {
        id: string;
        role: string;
        content: string;
        created_at: string;
    }

    return (messages || []).map((msg: MessageRow) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.created_at,
    }));
}

/**
 * Get the best available AI model
 */
async function getBestModel(): Promise<string> {
    for (const model of ANALYSIS_MODELS) {
        try {
            await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1,
            });
            console.log(`[ConversationAnalysis] Using model: ${model}`);
            return model;
        } catch {
            continue;
        }
    }
    console.log(`[ConversationAnalysis] Using fallback model: ${ANALYSIS_MODELS[ANALYSIS_MODELS.length - 1]}`);
    return ANALYSIS_MODELS[ANALYSIS_MODELS.length - 1];
}

/**
 * Analyze a full conversation and rate each bot response
 */
export async function analyzeConversation(
    senderId: string,
    limit: number = 50
): Promise<ConversationAnalysis> {
    // Fetch conversation history
    const messages = await fetchConversationHistory(senderId, limit);

    if (messages.length === 0) {
        return {
            messages: [],
            summary: {
                overallScore: 0,
                mistakeCount: 0,
                blunderCount: 0,
                excellentCount: 0,
                goodCount: 0,
                questionableCount: 0,
                keyInsights: ['No conversation history found'],
                improvementAreas: [],
            },
        };
    }

    // Get lead info
    const { data: lead } = await supabase
        .from('leads')
        .select('id, name, phone')
        .eq('sender_id', senderId)
        .single();

    // Fetch bot configuration for context
    const { data: botSettings } = await supabase
        .from('bot_settings')
        .select('bot_name, bot_tone, bot_personality')
        .single();

    const { data: botGoals } = await supabase
        .from('bot_goals')
        .select('goal_name, goal_description')
        .eq('is_active', true)
        .order('priority_order', { ascending: true });

    // Build conversation text for analysis
    const conversationText = messages
        .map((msg, idx) => `[${idx + 1}] ${msg.role.toUpperCase()}: ${msg.content}`)
        .join('\n\n');

    // Create analysis prompt
    const analysisPrompt = `You are an expert conversation analyst evaluating a chatbot's performance. Analyze this conversation like a chess engine analyzes moves - identify mistakes, missed opportunities, and rate each bot response.

BOT CONTEXT:
- Name: ${botSettings?.bot_name || 'Assistant'}
- Tone: ${botSettings?.bot_tone || 'professional'}
- Goals: ${botGoals?.map((g: { goal_name: string }) => g.goal_name).join(', ') || 'Not specified'}

CONVERSATION:
${conversationText}

Analyze EACH assistant/bot message and rate it. Use these ratings:
- "excellent" (♔): Perfect response, achieved goals, great engagement
- "good" (✓): Solid response, minor improvements possible
- "questionable" (?!): Could be better, missed minor opportunities
- "mistake" (?): Poor response, missed important opportunities
- "blunder" (??): Very bad response, may have lost the customer

For each assistant message, provide:
1. rating: One of the ratings above
2. score: 0-100 numerical score
3. issues: Array of specific issues with the response
4. betterResponse: What the bot SHOULD have said (for questionable/mistake/blunder only)
5. explanation: Brief explanation of the rating
6. missedOpportunities: Array of missed opportunities (optional)

Also provide a summary with:
- overallScore: Average score (0-100)
- keyInsights: Top 3-5 insights about the conversation
- improvementAreas: Top areas where the bot can improve

RESPOND WITH VALID JSON ONLY:
{
  "analyses": [
    {
      "messageIndex": 2,
      "rating": "good",
      "score": 75,
      "issues": ["Could have asked a follow-up question"],
      "betterResponse": null,
      "explanation": "Solid greeting but missed opportunity to engage",
      "missedOpportunities": ["Did not ask about customer needs"]
    }
  ],
  "summary": {
    "overallScore": 72,
    "keyInsights": ["Bot handles greetings well", "Needs improvement in closing"],
    "improvementAreas": ["Follow-up questions", "Handling objections"]
  }
}

IMPORTANT:
- messageIndex should refer to the message number (1-indexed) from the conversation
- Only analyze assistant messages, skip user messages
- Be constructive but honest - identify real areas for improvement
- Consider cultural context (Filipino/Tagalog phrases are common)`;

    try {
        const model = await getBestModel();
        const completion = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: 'You are an expert conversation analyst. Respond with valid JSON only.' },
                { role: 'user', content: analysisPrompt },
            ],
            temperature: 0.7,
            max_tokens: 4000,
        });
        const responseText = completion.choices[0]?.message?.content || '';

        // Parse JSON from response
        let jsonContent = responseText;

        // Try to extract JSON from markdown code blocks
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonContent = jsonMatch[1].trim();
        } else {
            // Try to find JSON object
            const objectMatch = responseText.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                jsonContent = objectMatch[0];
            }
        }

        const parsed = JSON.parse(jsonContent);
        const analyses = parsed.analyses || [];
        const summary = parsed.summary || {};

        // Apply analyses to messages
        const analyzedMessages: AnalyzedMessage[] = messages.map((msg, idx) => {
            const messageNum = idx + 1;
            const analysis = analyses.find((a: { messageIndex: number }) => a.messageIndex === messageNum);

            if (msg.role === 'assistant' && analysis) {
                return {
                    ...msg,
                    analysis: {
                        rating: analysis.rating || 'good',
                        score: analysis.score || 50,
                        issues: analysis.issues || [],
                        betterResponse: analysis.betterResponse || undefined,
                        explanation: analysis.explanation || '',
                        missedOpportunities: analysis.missedOpportunities || undefined,
                    },
                };
            }
            return msg;
        });

        // Count ratings
        let mistakeCount = 0;
        let blunderCount = 0;
        let excellentCount = 0;
        let goodCount = 0;
        let questionableCount = 0;

        for (const msg of analyzedMessages) {
            if (msg.analysis) {
                switch (msg.analysis.rating) {
                    case 'excellent': excellentCount++; break;
                    case 'good': goodCount++; break;
                    case 'questionable': questionableCount++; break;
                    case 'mistake': mistakeCount++; break;
                    case 'blunder': blunderCount++; break;
                }
            }
        }

        return {
            messages: analyzedMessages,
            summary: {
                overallScore: summary.overallScore || 50,
                mistakeCount,
                blunderCount,
                excellentCount,
                goodCount,
                questionableCount,
                keyInsights: summary.keyInsights || [],
                improvementAreas: summary.improvementAreas || [],
            },
            leadInfo: lead ? {
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
            } : undefined,
        };
    } catch (error) {
        console.error('[ConversationAnalysis] AI analysis error:', error);

        // Return messages without analysis on error
        return {
            messages,
            summary: {
                overallScore: 0,
                mistakeCount: 0,
                blunderCount: 0,
                excellentCount: 0,
                goodCount: 0,
                questionableCount: 0,
                keyInsights: ['Analysis failed - please try again'],
                improvementAreas: [],
            },
            leadInfo: lead ? {
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
            } : undefined,
        };
    }
}

/**
 * Check if a stage name should trigger automatic conversation analysis
 */
export function isAnalysisTriggerStage(stageName: string): boolean {
    const normalized = stageName.toLowerCase().trim();
    return ANALYSIS_TRIGGER_STAGES.some(trigger =>
        normalized.includes(trigger) || trigger.includes(normalized)
    );
}

/**
 * Store conversation analysis results in the database
 */
async function storeConversationAnalysis(
    leadId: string,
    analysis: ConversationAnalysis,
    stageName: string
): Promise<boolean> {
    try {
        // First, check if we have a lead_conversation_analysis table
        // If not, store on the lead record directly
        const { error: insertError } = await supabase
            .from('leads')
            .update({
                conversation_analysis: {
                    overallScore: analysis.summary.overallScore,
                    excellentCount: analysis.summary.excellentCount,
                    goodCount: analysis.summary.goodCount,
                    questionableCount: analysis.summary.questionableCount,
                    mistakeCount: analysis.summary.mistakeCount,
                    blunderCount: analysis.summary.blunderCount,
                    keyInsights: analysis.summary.keyInsights,
                    improvementAreas: analysis.summary.improvementAreas,
                    analyzedAt: new Date().toISOString(),
                    triggerStage: stageName,
                    messageCount: analysis.messages.length,
                },
            })
            .eq('id', leadId);

        if (insertError) {
            console.error('[AutoAnalysis] Error storing analysis:', insertError);
            return false;
        }

        console.log(`[AutoAnalysis] Stored analysis for lead ${leadId} - Score: ${analysis.summary.overallScore}`);
        return true;
    } catch (error) {
        console.error('[AutoAnalysis] Error storing analysis:', error);
        return false;
    }
}

/**
 * Trigger automatic conversation analysis when a lead moves to a final stage
 * Call this in background (fire-and-forget) when stage changes
 */
export async function triggerAnalysisOnStageChange(
    leadId: string,
    senderId: string,
    stageName: string
): Promise<void> {
    try {
        // Check if this stage should trigger analysis
        if (!isAnalysisTriggerStage(stageName)) {
            console.log(`[AutoAnalysis] Stage "${stageName}" does not trigger analysis`);
            return;
        }

        console.log(`[AutoAnalysis] Triggered for lead ${leadId} - Stage: "${stageName}"`);

        // Run the analysis
        const analysis = await analyzeConversation(senderId, 50);

        if (analysis.messages.length === 0) {
            console.log(`[AutoAnalysis] No messages to analyze for lead ${leadId}`);
            return;
        }

        // Store the results
        await storeConversationAnalysis(leadId, analysis, stageName);

        console.log(`[AutoAnalysis] Completed for lead ${leadId}:`, {
            score: analysis.summary.overallScore,
            excellent: analysis.summary.excellentCount,
            mistakes: analysis.summary.mistakeCount,
            blunders: analysis.summary.blunderCount,
        });
    } catch (error) {
        console.error('[AutoAnalysis] Error:', error);
    }
}
