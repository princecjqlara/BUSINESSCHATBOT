/**
 * Conversation Analysis Service
 * Analyzes chatbot conversations for mistakes and opportunities, similar to chess engine analysis
 */

import { supabase } from './supabase';

// Dynamically import Google AI to avoid build issues
let genAI: any = null;

async function getGenAI() {
    if (!genAI) {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '');
    }
    return genAI;
}

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
async function getBestModel() {
    const ai = await getGenAI();
    try {
        return ai.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    } catch {
        return ai.getGenerativeModel({ model: 'gemini-pro' });
    }
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
        const result = await model.generateContent(analysisPrompt);
        const responseText = result.response.text();

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
