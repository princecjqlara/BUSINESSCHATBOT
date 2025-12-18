import { supabase } from './supabase';
import OpenAI from 'openai';

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

interface BotGoal {
    id: string;
    goal_name: string;
    goal_description: string | null;
    priority_order: number | null;
    is_active: boolean;
    is_optional: boolean;
    stop_on_completion: boolean;
}

interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Fetch active bot goals ordered by priority
 */
export async function getActiveBotGoals(): Promise<BotGoal[]> {
    try {
        const { data, error } = await supabase
            .from('bot_goals')
            .select('*')
            .eq('is_active', true)
            .order('priority_order', { ascending: true }); // NULL values will appear last (default PostgreSQL behavior)

        if (error) {
            console.error('Error fetching bot goals:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error fetching bot goals:', error);
        return [];
    }
}

/**
 * Check which goals have been completed for a lead
 */
export async function getCompletedGoals(leadId?: string, senderId?: string): Promise<string[]> {
    try {
        let query = supabase
            .from('lead_goal_completions')
            .select('goal_id');

        if (leadId) {
            query = query.eq('lead_id', leadId);
        } else if (senderId) {
            query = query.eq('sender_id', senderId);
        } else {
            return [];
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching completed goals:', error);
            return [];
        }

        return (data || []).map((c: { goal_id: string }) => c.goal_id);
    } catch (error) {
        console.error('Error fetching completed goals:', error);
        return [];
    }
}

/**
 * Record a goal completion
 */
export async function recordGoalCompletion(
    goalId: string,
    leadId?: string,
    senderId?: string,
    completionContext?: string
): Promise<boolean> {
    try {
        // If only senderId is provided, try to find the lead
        let finalLeadId = leadId;
        if (!finalLeadId && senderId) {
            const { data: lead } = await supabase
                .from('leads')
                .select('id')
                .eq('sender_id', senderId)
                .single();

            if (lead) {
                finalLeadId = lead.id;
            }
        }

        const insertData: Record<string, any> = {
            goal_id: goalId,
            completion_context: completionContext?.trim() || null,
        };

        if (finalLeadId) {
            insertData.lead_id = finalLeadId;
        }
        if (senderId) {
            insertData.sender_id = senderId;
        }

        const { error } = await supabase
            .from('lead_goal_completions')
            .insert(insertData);

        if (error) {
            // If it's a unique constraint violation, the goal was already completed
            if (error.code === '23505') {
                console.log(`Goal ${goalId} already completed for this lead`);
                return false;
            }
            console.error('Error recording goal completion:', error);
            return false;
        }

        console.log(`Goal ${goalId} completion recorded successfully`);
        return true;
    } catch (error) {
        console.error('Error recording goal completion:', error);
        return false;
    }
}

/**
 * Analyze conversation to detect goal completions using AI
 */
export async function analyzeGoalCompletions(
    goals: BotGoal[],
    completedGoalIds: string[],
    conversationHistory: ConversationMessage[],
    latestUserMessage: string,
    latestBotResponse: string
): Promise<Array<{ goalId: string; context: string }>> {
    if (goals.length === 0) {
        return [];
    }

    // Filter out already completed goals
    const pendingGoals = goals.filter(g => !completedGoalIds.includes(g.id));

    if (pendingGoals.length === 0) {
        return [];
    }

    try {
        // Build conversation context
        const conversationText = conversationHistory
            .map(msg => `${msg.role === 'user' ? 'User' : 'Bot'}: ${msg.content}`)
            .join('\n');

        const goalsDescription = pendingGoals
            .map((g, idx) => `${idx + 1}. ${g.goal_name}${g.goal_description ? ` - ${g.goal_description}` : ''}`)
            .join('\n');

        const systemPrompt = `You are analyzing a conversation between a chatbot and a lead to determine if any goals have been achieved.

GOALS TO CHECK:
${goalsDescription}

CONVERSATION HISTORY:
${conversationText}

LATEST EXCHANGE:
User: ${latestUserMessage}
Bot: ${latestBotResponse}

INSTRUCTIONS:
- Analyze the conversation to determine which goals (if any) have been successfully achieved
- A goal is achieved when the conversation shows clear evidence that the goal's objective has been met
- For example: If a goal is "Collect Email Address", it's achieved when the user provides their email address
- Only mark goals as achieved if there is CLEAR evidence in the conversation
- Be conservative - don't mark goals as achieved unless you're confident

RESPOND WITH A JSON ARRAY of completed goals in this exact format:
[
  {
    "goalId": "uuid-of-goal",
    "goalName": "Name of the goal",
    "context": "Brief explanation of how/why this goal was achieved"
  }
]

If NO goals were achieved, respond with an empty array: []

IMPORTANT: Only include goals that are clearly achieved. Do not guess or assume.`;

        const messages = [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: 'Analyze the conversation and identify which goals have been achieved.' }
        ];

        const response = await client.chat.completions.create({
            model: "qwen/qwen3-235b-a22b",
            messages,
            temperature: 0.2,
            max_tokens: 1024,
        });

        const content = response.choices[0]?.message?.content || '[]';

        // Try to parse JSON response
        let parsed: Array<{ goalId: string; goalName: string; context: string }>;
        try {
            // Extract JSON from markdown code blocks if present
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            const jsonText = jsonMatch ? jsonMatch[0] : content;
            parsed = JSON.parse(jsonText);
        } catch (parseError) {
            console.error('Error parsing goal completion analysis:', parseError);
            console.log('Raw response:', content);
            return [];
        }

        // Map goal names to goal IDs and return
        const completions: Array<{ goalId: string; context: string }> = [];

        for (const item of parsed) {
            const goal = pendingGoals.find(g => g.goal_name === item.goalName || g.id === item.goalId);
            if (goal) {
                completions.push({
                    goalId: goal.id,
                    context: item.context || `Goal "${goal.goal_name}" was achieved during the conversation`,
                });
            }
        }

        return completions;
    } catch (error) {
        console.error('Error analyzing goal completions:', error);
        return [];
    }
}

/**
 * Check and record goal completions for a conversation
 * This should be called after a bot response is generated
 */
export async function checkAndRecordGoalCompletions(
    senderId: string,
    userMessage: string,
    botResponse: string,
    leadId?: string
): Promise<void> {
    try {
        // Fetch active goals and completed goals
        const [activeGoals, completedGoalIds] = await Promise.all([
            getActiveBotGoals(),
            getCompletedGoals(leadId, senderId),
        ]);

        if (activeGoals.length === 0) {
            return; // No goals to check
        }

        // Fetch recent conversation history
        const { data: messages } = await supabase
            .from('conversations')
            .select('role, content')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: true })
            .limit(20);

        const conversationHistory: ConversationMessage[] = (messages || []).map((msg: any) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        }));

        // Analyze for goal completions
        const completions = await analyzeGoalCompletions(
            activeGoals,
            completedGoalIds,
            conversationHistory,
            userMessage,
            botResponse
        );

        // Record each completion
        for (const completion of completions) {
            await recordGoalCompletion(
                completion.goalId,
                leadId,
                senderId,
                completion.context
            );
        }

        if (completions.length > 0) {
            console.log(`[Goal Tracking] Recorded ${completions.length} goal completion(s) for sender ${senderId}`);
        }
    } catch (error) {
        console.error('Error in checkAndRecordGoalCompletions:', error);
        // Don't throw - goal tracking should not break the conversation flow
    }
}



