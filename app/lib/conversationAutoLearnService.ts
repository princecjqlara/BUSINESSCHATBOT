/**
 * Conversation Auto-Learn Service
 * Extracts rules from conversation analysis and updates ML Sandbox
 */

import { supabase } from './supabase';
import OpenAI from 'openai';

// OpenAI client with NVIDIA API
const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

const LEARNING_MODELS = [
    'meta/llama-3.1-70b-instruct',
    'deepseek-ai/deepseek-v3.1',
    'meta/llama-3.1-8b-instruct',
];

// Types
interface MistakeAnalysis {
    originalMessage: string;
    betterResponse: string;
    issues: string[];
    missedOpportunities: string[];
    rating: string;
    score: number;
}

interface LearnedRule {
    rule: string;
    category: string;
    priority: number;
    source: 'auto_learn';
    conversationContext?: string;
}

/**
 * Get best available model
 */
async function getBestModel(): Promise<string> {
    for (const model of LEARNING_MODELS) {
        try {
            await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1,
            });
            return model;
        } catch {
            continue;
        }
    }
    return LEARNING_MODELS[LEARNING_MODELS.length - 1];
}

/**
 * Extract general rules from conversation mistakes
 */
export async function extractRulesFromMistakes(
    mistakes: MistakeAnalysis[]
): Promise<LearnedRule[]> {
    if (mistakes.length === 0) {
        console.log('[AutoLearn] No mistakes to learn from');
        return [];
    }

    const mistakesText = mistakes.map((m, idx) => `
Mistake ${idx + 1}:
- Original Response: "${m.originalMessage}"
- Better Response: "${m.betterResponse || 'Not specified'}"
- Issues: ${m.issues.join(', ') || 'None specified'}
- Missed Opportunities: ${m.missedOpportunities.join(', ') || 'None'}
- Rating: ${m.rating} (Score: ${m.score})
`).join('\n');

    const prompt = `You are an AI learning specialist. Based on the following conversation mistakes, extract GENERAL RULES that will help the chatbot avoid these mistakes in the future.

MISTAKES ANALYZED:
${mistakesText}

IMPORTANT: Generate GENERAL MECHANICS/RULES, not specific conditions.
- ❌ BAD: "If user says 'magkano', respond with pricing"
- ✅ GOOD: "Always provide clear pricing information when cost is discussed"

For each mistake, create 1-2 general rules that address the underlying issue.

Respond with VALID JSON only:
{
    "rules": [
        {
            "rule": "General rule text that prevents this type of mistake",
            "category": "communication|sales|engagement|closing|followup",
            "priority": 1-10,
            "reason": "Why this rule helps"
        }
    ]
}

Generate only high-quality, actionable rules. Maximum 5 rules total.`;

    try {
        const model = await getBestModel();
        const completion = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: 'You are an AI learning specialist. Respond with valid JSON only.' },
                { role: 'user', content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 2000,
        });

        const responseText = completion.choices[0]?.message?.content || '';

        // Parse JSON
        let jsonContent = responseText;
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonContent = jsonMatch[1].trim();
        } else {
            const objectMatch = responseText.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                jsonContent = objectMatch[0];
            }
        }

        const parsed = JSON.parse(jsonContent);
        const rules: LearnedRule[] = (parsed.rules || []).map((r: any) => ({
            rule: r.rule,
            category: r.category || 'general',
            priority: r.priority || 5,
            source: 'auto_learn' as const,
        }));

        console.log(`[AutoLearn] Extracted ${rules.length} rules from ${mistakes.length} mistakes`);
        return rules;
    } catch (error) {
        console.error('[AutoLearn] Error extracting rules:', error);
        return [];
    }
}

/**
 * Check if a similar rule already exists in sandbox
 */
async function ruleExists(rule: string): Promise<boolean> {
    const { data: existingRules } = await supabase
        .from('ml_sandbox_bot_rules')
        .select('rule')
        .limit(100);

    if (!existingRules || existingRules.length === 0) return false;

    // Simple similarity check - if rule contains key phrases from existing rules
    const ruleWords = rule.toLowerCase().split(/\s+/).filter(w => w.length > 4);

    for (const existing of existingRules) {
        const existingWords = existing.rule.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
        const commonWords = ruleWords.filter(w => existingWords.includes(w));
        const similarity = commonWords.length / Math.max(ruleWords.length, 1);

        if (similarity > 0.5) {
            console.log(`[AutoLearn] Similar rule already exists: "${existing.rule.slice(0, 50)}..."`);
            return true;
        }
    }

    return false;
}

/**
 * Add learned rules to ML Sandbox
 */
export async function addRulesToSandbox(rules: LearnedRule[]): Promise<number> {
    let addedCount = 0;

    for (const rule of rules) {
        // Skip if similar rule exists
        if (await ruleExists(rule.rule)) {
            continue;
        }

        const { error } = await supabase
            .from('ml_sandbox_bot_rules')
            .insert({
                rule: rule.rule,
                category: rule.category,
                priority: rule.priority,
                enabled: true,
                edited_by_ai: true,
                last_ai_edit_at: new Date().toISOString(),
                synced_from_production_at: null, // Indicates this is a new sandbox-only rule
            });

        if (!error) {
            addedCount++;
            console.log(`[AutoLearn] Added rule: "${rule.rule.slice(0, 50)}..."`);
        } else {
            console.error('[AutoLearn] Error adding rule:', error);
        }
    }

    return addedCount;
}

/**
 * Full auto-learn pipeline: Analyze conversation, extract rules, update sandbox
 */
export async function processConversationLearning(
    analysis: {
        messages: Array<{
            role: string;
            content: string;
            analysis?: {
                rating: string;
                score: number;
                issues: string[];
                betterResponse?: string;
                missedOpportunities?: string[];
            };
        }>;
    }
): Promise<{ rulesExtracted: number; rulesAdded: number; rules: LearnedRule[] }> {
    // Extract mistakes from analysis
    const mistakes: MistakeAnalysis[] = analysis.messages
        .filter(m => m.role === 'assistant' && m.analysis &&
            ['mistake', 'blunder', 'questionable'].includes(m.analysis.rating))
        .map(m => ({
            originalMessage: m.content,
            betterResponse: m.analysis!.betterResponse || '',
            issues: m.analysis!.issues || [],
            missedOpportunities: m.analysis!.missedOpportunities || [],
            rating: m.analysis!.rating,
            score: m.analysis!.score,
        }));

    if (mistakes.length === 0) {
        console.log('[AutoLearn] No mistakes found in analysis');
        return { rulesExtracted: 0, rulesAdded: 0, rules: [] };
    }

    console.log(`[AutoLearn] Found ${mistakes.length} mistakes to learn from`);

    // Extract rules from mistakes
    const rules = await extractRulesFromMistakes(mistakes);

    // Add rules to sandbox
    const rulesAdded = await addRulesToSandbox(rules);

    console.log(`[AutoLearn] Complete: ${rules.length} extracted, ${rulesAdded} added to sandbox`);

    return {
        rulesExtracted: rules.length,
        rulesAdded,
        rules,
    };
}

/**
 * Get all conversations for auto-learning (only from real leads in pipeline)
 */
export async function getConversationsForLearning(limit: number = 50) {
    // First, get all leads that are in the pipeline
    const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id, sender_id, name, phone, pipeline_stage')
        .not('sender_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit * 2); // Get more leads to filter

    if (leadsError || !leads || leads.length === 0) {
        console.error('[AutoLearn] Error fetching leads or no leads found:', leadsError);
        return [];
    }

    // Filter out test sender IDs
    const validLeads = leads.filter((lead: any) => {
        const senderId = lead.sender_id?.toLowerCase() || '';
        return !senderId.startsWith('web_test') &&
            !senderId.startsWith('test_') &&
            !senderId.startsWith('test');
    });

    if (validLeads.length === 0) {
        console.log('[AutoLearn] No valid leads found after filtering test accounts');
        return [];
    }

    // Get conversation counts for these leads
    const senderIds = validLeads.map((l: any) => l.sender_id);
    const { data: conversationStats } = await supabase
        .from('conversations')
        .select('sender_id, created_at')
        .in('sender_id', senderIds)
        .order('created_at', { ascending: false });

    // Group conversations by sender_id
    const senderMap = new Map<string, { count: number; lastMessageAt: string }>();
    for (const conv of conversationStats || []) {
        if (!senderMap.has(conv.sender_id)) {
            senderMap.set(conv.sender_id, { count: 1, lastMessageAt: conv.created_at });
        } else {
            const existing = senderMap.get(conv.sender_id)!;
            existing.count++;
        }
    }

    // Build result - only include leads with conversations
    const results: Array<{
        senderId: string;
        leadId: string | null;
        leadName: string | null;
        pipelineStage: string | null;
        messageCount: number;
        lastMessageAt: string;
    }> = [];

    for (const lead of validLeads) {
        if (results.length >= limit) break;

        const convStats = senderMap.get(lead.sender_id);
        if (!convStats || convStats.count === 0) continue; // Skip leads without conversations

        results.push({
            senderId: lead.sender_id,
            leadId: lead.id,
            leadName: lead.name,
            pipelineStage: lead.pipeline_stage,
            messageCount: convStats.count,
            lastMessageAt: convStats.lastMessageAt,
        });
    }

    console.log(`[AutoLearn] Found ${results.length} valid conversations from pipeline leads`);
    return results;
}

