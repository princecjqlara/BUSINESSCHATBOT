/**
 * AI Bot Configuration Analyzer API
 * Analyzes conversation flow, bot goals, bot rules, conversation style instructions, and tone & personality
 * Identifies conflicts, suggests improvements, and recommends optimal ordering
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/app/lib/supabase';

// Use best available large models for comprehensive analysis
const CONFIG_AI_MODELS = [
    'meta/llama-3.1-405b-instruct',  // Best for complex analysis
    'qwen/qwen3-235b-a22b',          // Excellent for reasoning
    'meta/llama-3.1-70b-instruct',   // Fallback
];

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

/**
 * Get the best available model for configuration analysis
 */
async function getBestModel(): Promise<string> {
    for (const model of CONFIG_AI_MODELS) {
        try {
            await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1,
            });
            console.log(`[Config Analyzer] Using model: ${model}`);
            return model;
        } catch (error) {
            continue;
        }
    }
    console.log(`[Config Analyzer] Using fallback model: ${CONFIG_AI_MODELS[CONFIG_AI_MODELS.length - 1]}`);
    return CONFIG_AI_MODELS[CONFIG_AI_MODELS.length - 1];
}

/**
 * Fetch bot settings
 */
async function getBotSettings() {
    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('bot_name, bot_tone, conversation_flow')
            .limit(1)
            .single();

        if (error) {
            console.error('[Config Analyzer] Error fetching bot settings:', error);
            return { bot_name: 'Assistant', bot_tone: 'helpful and professional', conversation_flow: '' };
        }

        return data || { bot_name: 'Assistant', bot_tone: 'helpful and professional', conversation_flow: '' };
    } catch (error) {
        console.error('[Config Analyzer] Error fetching bot settings:', error);
        return { bot_name: 'Assistant', bot_tone: 'helpful and professional', conversation_flow: '' };
    }
}

/**
 * Fetch bot rules
 */
async function getBotRules(): Promise<Array<{ id: string; rule: string; priority: number; enabled: boolean }>> {
    try {
        const { data: rules, error } = await supabase
            .from('bot_rules')
            .select('id, rule, priority, enabled')
            .order('priority', { ascending: true });

        if (error) {
            console.error('[Config Analyzer] Error fetching bot rules:', error);
            return [];
        }

        return rules || [];
    } catch (error) {
        console.error('[Config Analyzer] Error fetching bot rules:', error);
        return [];
    }
}

/**
 * Fetch bot goals
 */
async function getBotGoals(): Promise<Array<{ id: string; goal_name: string; goal_description: string | null; priority_order: number | null; is_active: boolean }>> {
    try {
        const { data, error } = await supabase
            .from('bot_goals')
            .select('id, goal_name, goal_description, priority_order, is_active')
            .order('priority_order', { ascending: true });

        if (error) {
            console.error('[Config Analyzer] Error fetching bot goals:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('[Config Analyzer] Error fetching bot goals:', error);
        return [];
    }
}

/**
 * Fetch bot instructions
 */
async function getBotInstructions(): Promise<string> {
    try {
        const { data, error } = await supabase
            .from('bot_instructions')
            .select('instructions')
            .order('id', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            console.error('[Config Analyzer] Error fetching bot instructions:', error);
            return '';
        }

        return data?.instructions || '';
    } catch (error) {
        console.error('[Config Analyzer] Error fetching bot instructions:', error);
        return '';
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { analysisType = 'full' } = body; // 'full', 'conflicts', 'prompts', 'goal-order'

        const model = await getBestModel();

        // Fetch all configuration data in parallel
        const [botSettings, botRules, botGoals, botInstructions] = await Promise.all([
            getBotSettings(),
            getBotRules(),
            getBotGoals(),
            getBotInstructions(),
        ]);

        console.log('[Config Analyzer] Context loaded:', {
            botName: botSettings.bot_name,
            botTone: botSettings.bot_tone,
            rulesCount: botRules.length,
            goalsCount: botGoals.length,
            hasInstructions: !!botInstructions,
            hasConversationFlow: !!botSettings.conversation_flow,
        });

        // Build comprehensive system prompt
        const systemPrompt = `You are an expert chatbot configuration analyst. Your task is to analyze all aspects of a chatbot's configuration to identify conflicts, inconsistencies, and opportunities for improvement.

You will analyze:
1. **Conversation Flow** - The step-by-step structure and progression of conversations
2. **Bot Goals** - Specific objectives the bot should achieve during conversations
3. **Bot Settings** - Specific behavioral rules checked before every response
4. **Conversation Style Instructions** - How the bot should converse (tone, language, style)
5. **Tone & Personality** - The overall personality and tone of the bot

YOUR ANALYSIS TASKS:

1. **CONFLICT DETECTION**: Identify specific conflicts and clashes between:
   - Conversation flow and bot goals (e.g., flow says "do X first" but goals prioritize "Y first")
   - Bot rules and conversation style (e.g., rule says "be formal" but style says "be casual")
   - Bot goals and rules (e.g., goal requires asking questions but rule says "never ask questions")
   - Tone & personality and any other component
   - Any other inconsistencies

2. **IMPROVEMENT SUGGESTIONS**: For each conflict or issue, suggest:
   - **Edit**: Specific edits to resolve conflicts
   - **Remove**: Parts that should be removed
   - **Add**: New content that should be added
   - **Reason**: Why this change improves the chatbot

3. **PROMPT IMPROVEMENTS**: Analyze and suggest improvements to:
   - Conversation flow prompt (make it clearer, more actionable)
   - Bot goal prompts (make them more specific, measurable)
   - Conversation style instructions (make them more effective)
   - Overall clarity and effectiveness

4. **GOAL ORDERING**: Suggest the optimal order for bot goals based on:
   - Logical progression (what should come first)
   - Dependencies between goals
   - Conversation flow alignment
   - Best practices for goal sequencing

OUTPUT FORMAT:
You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanation outside the JSON object.

The JSON structure must be exactly:
{
  "conflicts": [
    {
      "type": "flow_vs_goals" | "rules_vs_style" | "goals_vs_rules" | "tone_vs_component" | "other",
      "component1": "conversation_flow" | "bot_goals" | "bot_rules" | "conversation_style" | "tone_personality",
      "component2": "conversation_flow" | "bot_goals" | "bot_rules" | "conversation_style" | "tone_personality",
      "description": "Detailed description of the conflict",
      "specificParts": {
        "component1": "Exact text from component1 that conflicts",
        "component2": "Exact text from component2 that conflicts"
      },
      "suggestions": [
        {
          "action": "edit" | "remove" | "add",
          "target": "conversation_flow" | "bot_goals" | "bot_rules" | "conversation_style" | "tone_personality",
          "targetId": "ID of specific goal/rule if applicable, or null",
          "currentValue": "Current value to edit/remove, or null if adding",
          "newValue": "New value to add/edit, or null if removing",
          "reason": "Why this change resolves the conflict"
        }
      ]
    }
  ],
  "promptImprovements": [
    {
      "target": "conversation_flow" | "bot_goals" | "conversation_style",
      "targetId": "ID if applicable (for goals), or null",
      "currentPrompt": "Current prompt text",
      "improvedPrompt": "Improved prompt text",
      "reason": "Why this improvement helps"
    }
  ],
  "goalOrdering": {
    "currentOrder": [
      { "id": "goal_id", "name": "goal_name", "priority": 1 }
    ],
    "suggestedOrder": [
      { "id": "goal_id", "name": "goal_name", "newPriority": 1, "reason": "Why this order is better" }
    ],
    "explanation": "Overall explanation of the suggested ordering"
  },
  "summary": "Overall summary of analysis and key recommendations"
}

CRITICAL REQUIREMENTS:
- Return ONLY the JSON object, nothing else
- Do NOT wrap it in markdown code blocks
- Ensure all JSON is valid and properly escaped
- Be specific about which parts conflict (quote exact text)
- Provide actionable suggestions with exact edits
- For goal ordering, include all active goals in suggested order`;

        // Build user prompt with all configuration data
        const userPrompt = `Analyze the following chatbot configuration:

BOT IDENTITY:
- Bot Name: ${botSettings.bot_name}
- Tone & Personality: ${botSettings.bot_tone}

CONVERSATION FLOW:
${botSettings.conversation_flow || '(Not set)'}

BOT GOALS (Current Order):
${botGoals.filter(g => g.is_active).map((g, i) => `${i + 1}. [ID: ${g.id}] ${g.goal_name}${g.goal_description ? ` - ${g.goal_description}` : ''} (Priority: ${g.priority_order ?? 'null'})`).join('\n') || '(No active goals)'}

BOT RULES (Priority Order):
${botRules.filter(r => r.enabled).map((r, i) => `${i + 1}. [ID: ${r.id}] ${r.rule} (Priority: ${r.priority})`).join('\n') || '(No active rules)'}

CONVERSATION STYLE INSTRUCTIONS:
${botInstructions || '(Not set)'}

Please analyze this configuration and provide:
1. All conflicts and clashes between components
2. Specific suggestions to resolve conflicts (edit/remove/add)
3. Improvements to prompts for better clarity and effectiveness
4. Optimal ordering for bot goals based on logical progression and flow alignment

${analysisType === 'conflicts' ? 'Focus primarily on conflict detection.' : ''}
${analysisType === 'prompts' ? 'Focus primarily on prompt improvements.' : ''}
${analysisType === 'goal-order' ? 'Focus primarily on goal ordering optimization.' : ''}`;

        console.log('[Config Analyzer] Sending analysis request to model...');

        const response = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3, // Lower temperature for more consistent analysis
            max_tokens: 4000,
        });

        const content = response.choices[0]?.message?.content || '';
        console.log('[Config Analyzer] Received response, length:', content.length);

        // Parse JSON response
        let analysisResult;
        try {
            // Remove any markdown code blocks if present
            const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            analysisResult = JSON.parse(cleanedContent);
        } catch (parseError) {
            console.error('[Config Analyzer] Failed to parse JSON response:', parseError);
            console.error('[Config Analyzer] Raw content:', content.substring(0, 500));
            return NextResponse.json({
                success: false,
                error: 'Failed to parse AI response. The AI may have returned invalid JSON.',
                rawContent: content.substring(0, 1000),
            }, { status: 500 });
        }

        // Validate and structure the response
        const result = {
            success: true,
            conflicts: analysisResult.conflicts || [],
            promptImprovements: analysisResult.promptImprovements || [],
            goalOrdering: analysisResult.goalOrdering || null,
            summary: analysisResult.summary || 'Analysis completed.',
        };

        console.log('[Config Analyzer] Analysis complete:', {
            conflictsCount: result.conflicts.length,
            improvementsCount: result.promptImprovements.length,
            hasGoalOrdering: !!result.goalOrdering,
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[Config Analyzer] Error:', error);
        return NextResponse.json({
            success: false,
            error: error?.message || 'Failed to analyze configuration',
        }, { status: 500 });
    }
}



