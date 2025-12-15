/**
 * Response Validation Service
 * Uses GPT OSS 120B (via NVIDIA NIM) to validate bot responses for:
 * - Rule compliance: Does response follow all enabled bot rules?
 * - Hallucination detection: Is information grounded in knowledge base?
 * - Consistency: Is response consistent with previous messages?
 */

import OpenAI from 'openai';
import { supabase } from './supabase';

// GPT OSS 120B and Nemotron models via NVIDIA NIM
// Try the best models first for highest quality validation
// Models are tried in order with timeout - if too slow, skip to next
const VALIDATION_MODELS = [
    'nvidia/llama-3.1-nemotron-ultra-253b-v1', // Nemotron Ultra 253B (best)
    'nvidia/llama-3.1-nemotron-70b-instruct',  // Nemotron 70B (fast fallback)
    'meta/llama-3.1-405b-instruct',            // Llama 405B
    'qwen/qwen3-235b-a22b',                    // Qwen 235B
    'meta/llama-3.1-70b-instruct',             // Llama 70B (fast fallback)
];

// Timeout for model availability check (ms)
const MODEL_CHECK_TIMEOUT_MS = 3000;

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
 * Helper to add timeout to a promise
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
    ]);
}

/**
 * Get the best available validation model with timeout logic
 * If a model takes too long, skip to the next one
 */
async function getBestValidationModel(): Promise<string> {
    for (const model of VALIDATION_MODELS) {
        try {
            // Test model with timeout - if it takes too long, skip to next
            await withTimeout(
                client.chat.completions.create({
                    model,
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 1,
                }),
                MODEL_CHECK_TIMEOUT_MS
            );
            console.log(`[Response Validation] Using model: ${model}`);
            return model;
        } catch (error: any) {
            const reason = error.message?.includes('Timeout') ? 'timeout' : 'not available';
            console.log(`[Response Validation] Model ${model} ${reason}, trying next...`);
            continue;
        }
    }
    // Fallback to fastest model
    const fallbackModel = VALIDATION_MODELS[VALIDATION_MODELS.length - 1];
    console.log(`[Response Validation] Using fallback model: ${fallbackModel}`);
    return fallbackModel;
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
5. REPETITION CHECK (CRITICAL): Does the response ask a question that was already asked before in the conversation? Look at the recent conversation - if the bot already asked about budget/price/timeline/business type, it MUST NOT ask again. This is a MAJOR issue if detected.

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

/**
 * Pick the best response from multiple candidate responses
 * Uses GPT OSS 120B (Nemotron) to score and select the best one
 */
export async function pickBestResponse(
    responses: { model: string; content: string }[],
    context: ValidationContext
): Promise<{ bestResponse: string; bestModel: string; scores: { model: string; score: number; reason: string }[] }> {
    const startTime = Date.now();

    // If only one response, return it directly
    if (responses.length === 1) {
        console.log('[Response Picker] Only one response, returning directly');
        return {
            bestResponse: responses[0].content,
            bestModel: responses[0].model,
            scores: [{ model: responses[0].model, score: 100, reason: 'Only candidate' }],
        };
    }

    // Filter out empty responses
    const validResponses = responses.filter(r => r.content && r.content.trim() !== '');
    if (validResponses.length === 0) {
        throw new Error('No valid responses to pick from');
    }
    if (validResponses.length === 1) {
        return {
            bestResponse: validResponses[0].content,
            bestModel: validResponses[0].model,
            scores: [{ model: validResponses[0].model, score: 100, reason: 'Only valid candidate' }],
        };
    }

    const model = await getBestValidationModel();
    console.log(`[Response Picker] Using ${model} to pick best from ${validResponses.length} responses`);

    try {
        const rulesSection = context.rules.length > 0
            ? `BOT RULES:\n${context.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
            : 'No specific rules.';

        const historySection = context.conversationHistory && context.conversationHistory.length > 0
            ? `RECENT CONVERSATION:\n${context.conversationHistory.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}`
            : '';

        const responsesSection = validResponses.map((r, i) =>
            `RESPONSE ${i + 1} (from ${r.model}):\n"${r.content}"`
        ).join('\n\n');

        const systemPrompt = `You are a response quality scorer. Your job is to pick the BEST response from multiple candidates.

${rulesSection}

${historySection}

SCORING CRITERIA:
1. RULE COMPLIANCE (40%): Does it follow the bot rules?
2. NO REPETITION (30%): Does it avoid repeating previous questions? This is CRITICAL.
3. NATURAL FLOW (20%): Does it move the conversation forward naturally?
4. TONE & STYLE (10%): Is it friendly, uses Taglish, appropriate emojis?

CANDIDATE RESPONSES:
${responsesSection}

YOUR TASK:
Return a JSON object with:
- bestIndex: number (0-indexed, which response is best)
- scores: array of { index: number, score: number (0-100), reason: string }

IMPORTANT:
- Return ONLY valid JSON, no markdown
- The response that AVOIDS repeating questions scores MUCH higher
- If a response asks something already asked in conversation history, severely penalize it`;

        const completion = await withTimeout(
            client.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: 'Pick the best response.' },
                ],
                temperature: 0.1,
                max_tokens: 512,
            }),
            10000 // 10 second timeout for scoring
        );

        const resultText = completion.choices[0]?.message?.content || '';

        try {
            let jsonContent = resultText.trim();
            const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch) jsonContent = jsonMatch[1].trim();
            const jsonStart = jsonContent.indexOf('{');
            const jsonEnd = jsonContent.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1) {
                jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
            }

            const parsed = JSON.parse(jsonContent);
            const bestIndex = typeof parsed.bestIndex === 'number' ? parsed.bestIndex : 0;
            const bestIdx = Math.min(Math.max(0, bestIndex), validResponses.length - 1);

            console.log(`[Response Picker] Selected response ${bestIdx + 1} from ${validResponses[bestIdx].model} (${Date.now() - startTime}ms)`);

            return {
                bestResponse: validResponses[bestIdx].content,
                bestModel: validResponses[bestIdx].model,
                scores: (parsed.scores || []).map((s: any, i: number) => ({
                    model: validResponses[i]?.model || `Response ${i + 1}`,
                    score: s.score || 0,
                    reason: s.reason || 'No reason provided',
                })),
            };
        } catch (parseError) {
            console.error('[Response Picker] Failed to parse JSON, returning first response:', parseError);
            return {
                bestResponse: validResponses[0].content,
                bestModel: validResponses[0].model,
                scores: [],
            };
        }
    } catch (error) {
        console.error('[Response Picker] Error:', error);
        // Fallback to first response
        return {
            bestResponse: validResponses[0].content,
            bestModel: validResponses[0].model,
            scores: [],
        };
    }
}
