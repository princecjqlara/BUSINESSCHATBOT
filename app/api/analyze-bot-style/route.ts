/**
 * Analyze Bot Style API
 * Analyzes a desired bot message and generates suggestions for rules, instructions, etc.
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/app/lib/supabase';

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

// Use best available model for analysis
const ML_MODELS = [
    'meta/llama-3.1-405b-instruct',
    'qwen/qwen3-235b-a22b',
    'meta/llama-3.1-70b-instruct',
];

async function getBestMLModel(): Promise<string> {
    for (const model of ML_MODELS) {
        try {
            await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1,
            });
            return model;
        } catch (error) {
            continue;
        }
    }
    return ML_MODELS[ML_MODELS.length - 1];
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { desiredMessage, desiredMessages, messageCount, messageType = 'messaging' } = body;

        // Support both single message (backward compatibility) and multiple messages
        const messages = desiredMessages && Array.isArray(desiredMessages)
            ? desiredMessages.filter((msg: string) => msg && msg.trim().length > 0)
            : desiredMessage && desiredMessage.trim()
                ? [desiredMessage]
                : [];

        if (messages.length === 0) {
            return NextResponse.json(
                { error: 'At least one desired message is required' },
                { status: 400 }
            );
        }

        const isFollowUp = messageType === 'followup';

        // Get current bot settings for context
        const { data: settings } = await supabase
            .from('bot_settings')
            .select('bot_name, bot_tone, bot_instructions')
            .limit(1)
            .single();

        const botName = settings?.bot_name || 'Assistant';
        const botTone = settings?.bot_tone || 'helpful and professional';

        // Get current rules for context
        const { data: rules } = await supabase
            .from('bot_rules')
            .select('rule')
            .eq('enabled', true)
            .order('priority', { ascending: true });

        const currentRules = rules?.map((r: any) => r.rule) || [];

        // Build messages list for analysis
        const messagesList = messages.map((msg: string, idx: number) => `Sample ${idx + 1}: "${msg}"`).join('\n\n');

        // Analyze the desired messages and generate suggestions
        const messageTypeContext = isFollowUp
            ? `These are FOLLOW-UP MESSAGES - messages sent to re-engage customers, follow up on previous conversations, or reach out after a period of inactivity. Follow-up messages should be:
- Re-engagement focused
- Non-intrusive and respectful of customer's time
- Context-aware (referencing previous interactions when possible)
- Value-driven (offering something helpful, not just selling)
- Appropriate timing considerations`
            : `These are REGULAR MESSAGING - messages during active conversations. Regular messages should be:
- Conversational and natural
- Responsive to customer queries
- Engaging and helpful
- Part of an ongoing dialogue`;

        const analysisPrompt = `You are an expert chatbot configuration analyst. Analyze the following desired bot messages (${messages.length} sample${messages.length > 1 ? 's' : ''}) and create suggestions for how to configure the bot to respond in this style.

MESSAGE TYPE: ${isFollowUp ? 'FOLLOW-UP MESSAGES' : 'REGULAR MESSAGING'}
${messageTypeContext}

Current Bot Configuration:
- Bot Name: ${botName}
- Bot Tone: ${botTone}
${currentRules.length > 0 ? `- Current Rules:\n${currentRules.map((r: any, i: number) => `${i + 1}. ${r}`).join('\n')}` : ''}

Desired Bot Messages:
${messagesList}

Analyze these messages and identify COMMON PATTERNS across all samples:
1. **Style characteristics** (tone, language, emoji usage, length, formality)
2. **Content patterns** (questions asked, information provided, call-to-action)
3. **Personality traits** (friendly, professional, casual, etc.)
4. **Response structure** (greeting, question, information, closing)
5. **Consistent elements** that appear across multiple samples
${isFollowUp ? '6. **Follow-up specific patterns** (re-engagement techniques, timing references, value propositions)' : ''}

${messages.length > 1 ? 'Since you have multiple samples, focus on identifying the COMMON patterns and style elements that appear consistently across all messages. This will help create more accurate and comprehensive suggestions.' : ''}
${isFollowUp ? 'Since these are follow-up messages, pay special attention to re-engagement strategies, non-intrusive approaches, and value-driven content.' : ''}

Based on this analysis, generate detailed suggestions with variations in JSON format:
{
  "suggestions": [
    {
      "type": "rule|instruction|knowledge|personality",
      "title": "Short descriptive title",
      "content": "The actual rule/instruction/knowledge content to add",
      "reason": "Why this suggestion helps achieve the desired style",
      "priority": 1-10 (only for rules, higher = more important),
      "details": "Detailed explanation of what this suggestion does and how it affects bot behavior",
      "variations": [
        "Alternative version 1 of the suggestion",
        "Alternative version 2 (if applicable)",
        "Alternative version 3 (if applicable)"
      ],
      "examples": [
        "Example scenario 1 where this applies",
        "Example scenario 2 where this applies"
      ],
      "impact": "Expected impact on bot behavior and user experience"
    }
  ]
}

Guidelines:
- **Rules**: Specific behavioral rules with variations (e.g., ${isFollowUp ? '"In follow-up messages, always acknowledge the time gap and offer value first"' : '"Always use emojis sparingly, max 2 per message"'})
- **Instructions**: General conversation style instructions with detailed explanations (e.g., ${isFollowUp ? '"Keep follow-up messages brief, value-focused, and non-intrusive"' : '"Keep messages casual and conversational"'})
- **Knowledge**: Information the bot should know with context (e.g., "We offer discounts for first-time customers")
- **Personality**: Bot personality adjustments with examples (e.g., ${isFollowUp ? '"Be more respectful and value-driven in follow-up scenarios"' : '"Be more friendly and enthusiastic"'})

IMPORTANT REQUIREMENTS:
1. Generate 5-8 detailed suggestions (more is better for comprehensive coverage)
2. For EACH suggestion, provide:
   - A detailed explanation in "details" field (2-3 sentences explaining what it does and how it affects behavior)
   - 2-4 variations in "variations" array (alternative ways to express the same concept - different phrasings, levels of specificity, or approaches)
   - 2-4 examples in "examples" array (specific scenarios, use cases, or situations where this applies)
   - Expected impact description in "impact" field (how this will change bot behavior and user experience)
3. Make suggestions comprehensive, actionable, and specific
4. Include a mix of:
   - General style suggestions (tone, language, structure)
   - Specific behavioral rules (emoji usage, message length, question patterns)
   - Content guidelines (what to include, what to avoid)
   - Personality adjustments (how to adapt the bot's character)
5. ${messages.length > 1 ? 'Since multiple samples were provided, identify COMMON patterns across all samples and create suggestions that capture the overall style comprehensively. Look for recurring elements.' : 'Analyze the single sample deeply to extract all style characteristics.'}
6. ${isFollowUp ? 'Focus heavily on follow-up specific strategies: re-engagement techniques, timing considerations, value propositions, non-intrusive approaches, acknowledgment of time gaps, and respect for customer boundaries.' : 'Focus on conversational flow, engagement techniques, response quality, natural dialogue patterns, and maintaining user interest.'}
7. Variations should offer different approaches:
   - Different levels of formality
   - Alternative phrasings
   - More or less specific versions
   - Different emphasis or focus

Prioritize the most impactful suggestions first, but ensure comprehensive coverage of ALL style aspects identified in the analysis.

Respond with ONLY valid JSON, no markdown, no explanation.`;

        const bestModel = await getBestMLModel();

        const response = await client.chat.completions.create({
            model: bestModel,
            messages: [{ role: 'user', content: analysisPrompt }],
            temperature: 0.3,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            return NextResponse.json(
                { error: 'Failed to generate suggestions' },
                { status: 500 }
            );
        }

        const parsed = JSON.parse(content);
        const suggestions = parsed.suggestions || [];

        // Validate and format suggestions with all details
        const formattedSuggestions = suggestions
            .filter((s: any) => s.type && s.title && s.content && s.reason)
            .map((s: any) => ({
                type: s.type,
                title: s.title,
                content: s.content,
                reason: s.reason,
                priority: s.type === 'rule' ? (s.priority || 5) : undefined,
                details: s.details || '',
                variations: Array.isArray(s.variations) ? s.variations.filter((v: any) => v && v.trim()) : [],
                examples: Array.isArray(s.examples) ? s.examples.filter((e: any) => e && e.trim()) : [],
                impact: s.impact || '',
            }));

        return NextResponse.json({
            success: true,
            suggestions: formattedSuggestions,
            modelUsed: bestModel,
        });
    } catch (error) {
        console.error('[Analyze Bot Style] Error:', error);
        return NextResponse.json(
            { error: 'Failed to analyze bot style' },
            { status: 500 }
        );
    }
}

