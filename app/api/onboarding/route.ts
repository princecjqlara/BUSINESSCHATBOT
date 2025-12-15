import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/app/lib/supabase';

type NormalizedAnswers = {
    userName?: string;
    userEmail?: string;
    companyName?: string;
    chatbotName: string;
    goalSelections: string[];
    knowledgeSources: string[];
    conversationFlowChoice: string;
    conversationFlowDetail?: string;
    tonePreferences: string[];
    stylePreferences: string[];
    botRules: string[];
    additionalRequests?: string;
};

type AiPlan = {
    instructions: string;
    conversationFlow: string;
    rules: string[];
    goals: string[];
};

const apiKey = process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY;
const useNvidia = Boolean(process.env.NVIDIA_API_KEY);
const client = apiKey
    ? new OpenAI({
        apiKey,
        baseURL: useNvidia ? 'https://integrate.api.nvidia.com/v1' : undefined,
    })
    : null;

const DEFAULT_RULES = [
    'Do not ask for sensitive personal information (passwords, credit card numbers, or private IDs).',
    'Always provide accurate and verified information based on the provided knowledge sources.',
    'Never provide medical, legal, or financial advice.',
    'Offer the option to speak with a human agent when questions are out of scope or user requests it.',
    'Ensure compliance with data privacy regulations and avoid storing unnecessary personal data.',
    'Keep the conversation respectful, concise, and professional at all times.',
    'Do not spam users with repetitive responses; acknowledge when information is not available.',
];

const GOAL_DESCRIPTIONS: Record<string, string> = {
    'answer customer questions': 'Respond quickly and accurately to common customer questions.',
    'provide product recommendations': 'Suggest relevant products based on user preferences and intent.',
    'help with bookings or orders': 'Guide users through booking or ordering, collecting key details.',
    'guide through product or service usage': 'Walk users through how to use products or services step-by-step.',
    'offer technical support': 'Troubleshoot and resolve basic technical issues or route to human support.',
    'collect customer feedback/surveys': 'Ask short, targeted questions to gather customer feedback.',
    'manage appointments': 'Schedule, reschedule, or cancel appointments while confirming details.',
    'provide shipping or order status updates': 'Retrieve and share shipping or order status updates when available.',
    'help with returns and refunds': 'Guide users through the returns/refunds process and set expectations.',
};

function arrayify(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map((v) => String(v).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);
    }
    return [];
}

function normalizeAnswers(raw: any): NormalizedAnswers {
    return {
        userName: raw?.userName?.trim() || undefined,
        userEmail: raw?.userEmail?.trim() || undefined,
        companyName: raw?.companyName?.trim() || undefined,
        chatbotName: raw?.chatbotName?.trim() || 'Assistant',
        goalSelections: arrayify(raw?.goalSelections),
        knowledgeSources: arrayify(raw?.knowledgeSources),
        conversationFlowChoice: raw?.conversationFlowChoice?.trim() || 'guided',
        conversationFlowDetail: raw?.conversationFlowDetail?.trim() || undefined,
        tonePreferences: arrayify(raw?.tonePreferences),
        stylePreferences: arrayify(raw?.stylePreferences),
        botRules: arrayify(raw?.botRules),
        additionalRequests: raw?.additionalRequests?.trim() || undefined,
    };
}

function buildFlowSummary(conversationFlowChoice: string, detail?: string): string {
    const trimmedDetail = detail?.trim();
    switch ((conversationFlowChoice || '').toLowerCase()) {
        case 'linear':
            return 'Linear flow: one clear question at a time, no branching. Keep answers brief before moving on.' + (trimmedDetail ? ` Notes: ${trimmedDetail}` : '');
        case 'guided':
            return 'Guided flow: step-by-step with clear options at each turn. Confirm understanding before the next step.' + (trimmedDetail ? ` Notes: ${trimmedDetail}` : '');
        case 'dynamic':
            return 'Dynamic flow: open-ended, adapt based on user responses, propose the next best step proactively.' + (trimmedDetail ? ` Notes: ${trimmedDetail}` : '');
        case 'branching':
            return 'Branching flow: present choices and follow different paths per choice. Summarize path changes as you go.' + (trimmedDetail ? ` Notes: ${trimmedDetail}` : '');
        default:
            return (trimmedDetail?.length ? trimmedDetail : 'Default guided flow: clarify, respond, and propose the next helpful action.');
    }
}

function buildFallbackPlan(answers: NormalizedAnswers): AiPlan {
    const flow = buildFlowSummary(answers.conversationFlowChoice, answers.conversationFlowDetail);
    const selectedGoals = answers.goalSelections.length ? answers.goalSelections : ['Answer customer questions'];
    const tone = answers.tonePreferences.length ? answers.tonePreferences.join(', ') : 'helpful and professional';
    const style = answers.stylePreferences.length ? answers.stylePreferences.join(', ') : 'concise and clear';
    const knowledge = answers.knowledgeSources.length ? answers.knowledgeSources.join(', ') : 'FAQs and product/service details';

    const instructions = [
        `You are ${answers.chatbotName || 'Assistant'}, representing ${answers.companyName || 'our brand'}.`,
        `Primary goals: ${selectedGoals.join('; ')}.`,
        `Tone: ${tone}. Style: ${style}.`,
        `Knowledge to rely on: ${knowledge}.`,
        `Conversation flow: ${flow}`,
        answers.additionalRequests ? `Additional requests: ${answers.additionalRequests}` : '',
    ]
        .filter(Boolean)
        .join(' ');

    const rules = Array.from(
        new Set([
            ...DEFAULT_RULES,
            ...answers.botRules,
        ]),
    );

    return {
        instructions,
        conversationFlow: flow,
        rules,
        goals: selectedGoals,
    };
}

async function generateAiPlan(answers: NormalizedAnswers): Promise<AiPlan> {
    const fallback = buildFallbackPlan(answers);
    if (!client) return fallback;

    const model = useNvidia ? 'meta/llama-3.1-70b-instruct' : 'gpt-4o-mini';
    const userContext = `
Company/Brand: ${answers.companyName || 'Not provided'}
Bot name: ${answers.chatbotName}
Requested tone: ${answers.tonePreferences.join(', ') || 'helpful and professional'}
Conversation style: ${answers.stylePreferences.join(', ') || 'concise and clear'}
Goals: ${answers.goalSelections.join('; ') || 'Answer customer questions'}
Knowledge sources: ${answers.knowledgeSources.join(', ') || 'FAQs and product/service details'}
Preferred flow: ${buildFlowSummary(answers.conversationFlowChoice, answers.conversationFlowDetail)}
Extra instructions: ${answers.additionalRequests || 'None'}
Custom rules: ${answers.botRules.join('; ') || 'None'}
`;

    try {
        const completion = await client.chat.completions.create({
            model,
            messages: [
                {
                    role: 'system',
                    content: `You are configuring a customer-facing chatbot. Given onboarding answers, output compact JSON only:
{
  "instructions": "actionable system prompt for the bot",
  "conversation_flow": "short summary of the flow",
  "rules": ["list of concise, enforceable rules (max 8)"],
  "goals": ["ordered list of goals in priority order (max 8)"]
}
No markdown. Keep instructions under 1200 characters and focus on immediately usable guidance.`,
                },
                {
                    role: 'user',
                    content: userContext,
                },
            ],
            max_tokens: 600,
            temperature: 0.5,
        });

        const content = completion?.choices?.[0]?.message?.content || '';
        const parsed = JSON.parse(content.trim());

        const instructions = typeof parsed.instructions === 'string' && parsed.instructions.trim().length > 0
            ? parsed.instructions.trim()
            : fallback.instructions;

        const conversationFlow = typeof parsed.conversation_flow === 'string' && parsed.conversation_flow.trim().length > 0
            ? parsed.conversation_flow.trim()
            : fallback.conversationFlow;

        const rules = Array.isArray(parsed.rules) && parsed.rules.length > 0
            ? parsed.rules.map((r: any) => String(r).trim()).filter(Boolean)
            : fallback.rules;

        const goals = Array.isArray(parsed.goals) && parsed.goals.length > 0
            ? parsed.goals.map((g: any) => String(g).trim()).filter(Boolean)
            : fallback.goals;

        return {
            instructions,
            conversationFlow,
            rules,
            goals,
        };
    } catch (error) {
        console.error('[Onboarding AI] Falling back due to error:', error);
        return fallback;
    }
}

async function saveOnboardingSnapshot(answers: NormalizedAnswers, rawAnswers: any) {
    try {
        const payload: Record<string, any> = {
            user_name: answers.userName || null,
            user_email: answers.userEmail || null,
            company_name: answers.companyName || null,
            chatbot_name: answers.chatbotName,
            goal_selections: answers.goalSelections,
            knowledge_sources: answers.knowledgeSources,
            conversation_flow_choice: answers.conversationFlowChoice,
            conversation_flow_detail: answers.conversationFlowDetail || null,
            tone_preferences: answers.tonePreferences,
            style_preferences: answers.stylePreferences,
            bot_rules: answers.botRules,
            additional_requests: answers.additionalRequests || null,
            raw_answers: rawAnswers || null,
        };

        const { data: existing } = await supabase
            .from('onboarding_responses')
            .select('id')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existing?.id) {
            const { error } = await supabase.from('onboarding_responses').update(payload).eq('id', existing.id);
            if (error) {
                console.warn('[Onboarding] Failed to update onboarding_responses:', error);
            }
        } else {
            const { error } = await supabase.from('onboarding_responses').insert(payload);
            if (error) {
                console.warn('[Onboarding] Failed to insert onboarding_responses:', error);
            }
        }
    } catch (error) {
        console.warn('[Onboarding] Could not persist onboarding_responses snapshot:', error);
    }
}

async function upsertBotSettings(plan: AiPlan, answers: NormalizedAnswers) {
    const toneSummary = answers.tonePreferences.length
        ? answers.tonePreferences.join(', ')
        : 'helpful and professional';

    const updates = {
        bot_name: answers.chatbotName,
        bot_tone: toneSummary,
        conversation_flow: plan.conversationFlow,
    };

    const { data: existing } = await supabase
        .from('bot_settings')
        .select('id')
        .limit(1)
        .maybeSingle();

    if (existing?.id) {
        const { error } = await supabase
            .from('bot_settings')
            .update(updates)
            .eq('id', existing.id);
        if (error) {
            console.error('[Onboarding] Failed to update bot_settings:', error);
        }
    } else {
        const { error } = await supabase
            .from('bot_settings')
            .insert(updates);
        if (error) {
            console.error('[Onboarding] Failed to insert bot_settings:', error);
        }
    }
}

async function saveInstructions(instructions: string) {
    const content = instructions.trim();
    if (!content.length) return;

    const now = new Date().toISOString();

    const { data: existing } = await supabase
        .from('bot_instructions')
        .select('id')
        .limit(1)
        .maybeSingle();

    const payload: Record<string, any> = {
        instructions: content,
        edited_by_ai: true,
        last_ai_edit_at: now,
    };

    if (existing?.id) {
        const { error } = await supabase
            .from('bot_instructions')
            .update(payload)
            .eq('id', existing.id);
        if (error) {
            console.error('[Onboarding] Failed to update bot_instructions:', error);
        }
    } else {
        const { error } = await supabase
            .from('bot_instructions')
            .insert(payload);
        if (error) {
            console.error('[Onboarding] Failed to insert bot_instructions:', error);
        }
    }
}

async function replaceAutoRules(rules: string[]) {
    if (!rules.length) return [];

    const now = new Date().toISOString();
    await supabase.from('bot_rules').delete().eq('category', 'auto_setup');

    const insertPayload = rules.map((rule, index) => ({
        rule,
        category: 'auto_setup',
        priority: index,
        enabled: true,
        edited_by_ai: true,
        last_ai_edit_at: now,
    }));

    const { data, error } = await supabase
        .from('bot_rules')
        .insert(insertPayload)
        .select('rule');

    if (error) {
        console.error('[Onboarding] Failed to save rules:', error);
        return [];
    }

    return data?.map((row: any) => row.rule) || [];
}

async function upsertGoals(goals: string[]) {
    if (!goals.length) return [];

    const payload = goals.map((goal, index) => {
        const key = goal.toLowerCase();
        return {
            goal_name: goal,
            goal_description: GOAL_DESCRIPTIONS[key] || null,
            priority_order: index,
            is_active: true,
            is_optional: false,
        };
    });

    const { data, error } = await supabase
        .from('bot_goals')
        .upsert(payload, { onConflict: 'goal_name' })
        .select('goal_name');

    if (error) {
        console.error('[Onboarding] Failed to upsert bot goals:', error);
        return [];
    }

    return data?.map((row: any) => row.goal_name) || [];
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        if (!body || !body.answers) {
            return NextResponse.json({ error: 'answers payload is required' }, { status: 400 });
        }

        const answers = normalizeAnswers(body.answers);
        const stage = body.stage || 'progressive';

        // Persist raw answers for auditing and incremental runs
        await saveOnboardingSnapshot(answers, body.answers);

        // Generate AI plan and apply to Supabase
        const aiPlan = await generateAiPlan(answers);

        await Promise.all([
            upsertBotSettings(aiPlan, answers),
            saveInstructions(aiPlan.instructions),
            upsertGoals(aiPlan.goals),
            replaceAutoRules(aiPlan.rules),
        ]);

        return NextResponse.json({
            success: true,
            stage,
            applied: {
                botName: answers.chatbotName,
                botTone: answers.tonePreferences.length ? answers.tonePreferences.join(', ') : 'helpful and professional',
                conversationFlow: aiPlan.conversationFlow,
                goals: aiPlan.goals,
                rules: aiPlan.rules,
            },
            instructionsPreview: aiPlan.instructions,
        });
    } catch (error: any) {
        console.error('[Onboarding] Unexpected error:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to auto-setup bot',
            details: error?.message || String(error),
        }, { status: 500 });
    }
}
