/**
 * Response Validation Service
 * Uses GPT OSS 120B (via NVIDIA NIM) to validate bot responses for:
 * - Rule compliance: Does response follow all enabled bot rules?
 * - Hallucination detection: Is information grounded in knowledge base?
 * - Consistency: Is response consistent with previous messages?
 */

import OpenAI from 'openai';
import { supabase } from './supabase';

// GPT OSS 120B equivalent models via NVIDIA NIM
// Try the best models first for highest quality validation
const VALIDATION_MODELS = [
    'nvidia/gpt-43b-002',           // GPT OSS 120B equivalent
    'meta/llama-3.1-405b-instruct', // Fallback: Best Llama
    'qwen/qwen3-235b-a22b',         // Fallback: Qwen
    'meta/llama-3.1-70b-instruct',  // Fallback: Smaller Llama
];

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

export interface ValidationResult {
    isValid: boolean;
    issues: string[];
    suggestions: string[];
    correctedResponse?: string;
    validationTimeMs: number;
    modelUsed: string;
}

interface ValidationContext {
    rules: string[];
    knowledgeContext: string;
    conversationHistory?: { role: string; content: string }[];
    botName?: string;
    botTone?: string;
}

/**
 * Get the best available validation model
 */
async function getBestValidationModel(): Promise<string> {
    for (const model of VALIDATION_MODELS) {
        try {
            await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1,
            });
            console.log(`[Response Validation] Using model: ${model}`);
            return model;
        } catch (error) {
            console.log(`[Response Validation] Model ${model} not available, trying next...`);
            continue;
        }
    }
    // Fallback to last model
    console.log(`[Response Validation] Using fallback model: ${VALIDATION_MODELS[VALIDATION_MODELS.length - 1]}`);
    return VALIDATION_MODELS[VALIDATION_MODELS.length - 1];
}

/**
 * Validate a bot response against rules and knowledge base
 */
export async function validateResponse(
    response: string,
    context: ValidationContext
): Promise<ValidationResult> {
    const startTime = Date.now();
    const model = await getBestValidationModel();

    try {
        // Build validation prompt
        const rulesSection = context.rules.length > 0
            ? `BOT RULES (response MUST follow these):\n${context.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
            : 'No specific rules configured.';

        const knowledgeSection = context.knowledgeContext
            ? `KNOWLEDGE BASE (response should be grounded in this):\n${context.knowledgeContext}`
            : 'No knowledge base context available.';

        const historySection = context.conversationHistory && context.conversationHistory.length > 0
            ? `RECENT CONVERSATION:\n${context.conversationHistory.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}`
            : '';

        const systemPrompt = `You are a response validation AI. Your job is to check if a chatbot response follows its rules and is grounded in factual information.

${rulesSection}

${knowledgeSection}

${historySection}

VALIDATION CRITERIA:
1. RULE COMPLIANCE: Does the response follow ALL the bot rules listed above?
2. HALLUCINATION CHECK: Is the information in the response grounded in the knowledge base? Does it make up prices, features, or details not in the knowledge base?
3. CONSISTENCY: Is the response consistent with the conversation context?
4. TONE CHECK: ${context.botTone ? `Does it match the expected tone: ${context.botTone}?` : 'Is the tone appropriate?'}

YOUR TASK:
Analyze the bot response below and return a JSON object with:
- isValid: boolean (true if response passes all checks)
- issues: string[] (list of specific issues found, empty if valid)
- suggestions: string[] (suggestions for improvement)
- correctedResponse: string | null (a corrected version if issues were found, null if valid)

IMPORTANT:
- Return ONLY valid JSON, no markdown, no explanation
- Be strict about rule compliance
- Flag any information not grounded in the knowledge base
- If the response says "I'll check with the team" for unknown info, that's GOOD (not a hallucination)`;

        const userMessage = `BOT RESPONSE TO VALIDATE:\n"${response}"`;

        const completion = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.1, // Low temperature for consistent validation
            max_tokens: 1024,
        });

        const resultText = completion.choices[0]?.message?.content || '';
        const validationTimeMs = Date.now() - startTime;

        // Parse JSON response
        try {
            // Try to extract JSON from response (handle potential markdown wrapping)
            let jsonContent = resultText.trim();

            // Remove markdown code blocks if present
            const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                jsonContent = jsonMatch[1].trim();
            }

            // Try to find JSON object
            const jsonStart = jsonContent.indexOf('{');
            const jsonEnd = jsonContent.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1) {
                jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
            }

            const parsed = JSON.parse(jsonContent);

            const result: ValidationResult = {
                isValid: parsed.isValid ?? true,
                issues: Array.isArray(parsed.issues) ? parsed.issues : [],
                suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
                correctedResponse: parsed.correctedResponse || undefined,
                validationTimeMs,
                modelUsed: model,
            };

            console.log(`[Response Validation] Result: isValid=${result.isValid}, issues=${result.issues.length}, time=${validationTimeMs}ms`);

            return result;

        } catch (parseError) {
            console.error('[Response Validation] Failed to parse JSON response:', parseError);
            console.log('[Response Validation] Raw response:', resultText);

            // Return valid by default if parsing fails
            return {
                isValid: true,
                issues: [],
                suggestions: ['Validation response could not be parsed'],
                validationTimeMs,
                modelUsed: model,
            };
        }

    } catch (error) {
        console.error('[Response Validation] Error:', error);
        const validationTimeMs = Date.now() - startTime;

        // Return valid by default on error (fail open)
        return {
            isValid: true,
            issues: [],
            suggestions: ['Validation could not be completed due to an error'],
            validationTimeMs,
            modelUsed: model,
        };
    }
}

/**
 * Log validation result to database for analytics
 */
export async function logValidationResult(
    senderId: string,
    originalResponse: string,
    result: ValidationResult
): Promise<void> {
    try {
        const { error } = await supabase
            .from('response_validation_logs')
            .insert({
                sender_id: senderId,
                original_response: originalResponse,
                validated_response: result.correctedResponse || null,
                is_valid: result.isValid,
                issues: result.issues,
                suggestions: result.suggestions,
                validation_model: result.modelUsed,
                validation_time_ms: result.validationTimeMs,
            });

        if (error) {
            console.error('[Response Validation] Error logging result:', error);
        }
    } catch (error) {
        console.error('[Response Validation] Error logging result:', error);
    }
}

/**
 * Check if response validation is enabled
 */
export async function isResponseValidationEnabled(): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('enable_response_validation')
            .limit(1)
            .single();

        if (error) {
            console.log('[Response Validation] Could not check setting, defaulting to disabled');
            return false;
        }

        return data?.enable_response_validation === true;
    } catch (error) {
        console.error('[Response Validation] Error checking setting:', error);
        return false;
    }
}
