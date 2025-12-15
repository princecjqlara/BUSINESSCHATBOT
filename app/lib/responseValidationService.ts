/**
 * Multi-Model Response Validation Service v2 - PARALLEL & FAULT-TOLERANT
 * 
 * This service implements a multi-tier AI response pipeline with:
 * - PARALLEL execution across all models for speed
 * - Timeouts per model to prevent long waits
 * - Robust fallback chains - original response is ALWAYS returned if all else fails
 * - No blocking - contact receives message fast even if some models fail
 * 
 * Pipeline:
 * - Tier 1: Message Construction (3 models × 2 variations = 6 candidates) [PARALLEL]
 * - Tier 2: Style Refinement (2 models × 2 variations per top candidate) [PARALLEL]
 * - Tier 3: Final Selection (1 model picks best OR fallback to first candidate)
 * 
 * All models use NVIDIA API via OpenAI-compatible interface.
 */

import OpenAI from 'openai';
import { supabase } from './supabase';

// NVIDIA API Client
const nvidiaClient = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

// ============================================================================
// CONFIGURATION
// ============================================================================

// Timeout settings (in milliseconds)
const MODEL_TIMEOUT_MS = 15000; // 15 seconds per model call
const CONSTRUCTION_PHASE_TIMEOUT_MS = 20000; // 20 seconds for all construction models
const STYLE_PHASE_TIMEOUT_MS = 20000; // 20 seconds for all style models
const SELECTOR_TIMEOUT_MS = 12000; // 12 seconds for selector model
const TOTAL_PIPELINE_TIMEOUT_MS = 45000; // 45 seconds max for entire pipeline

// ============================================================================
// INTERFACES
// ============================================================================

export interface ValidationContext {
    rules: string[];
    knowledgeContext: string;
    conversationHistory: { role: string; content: string }[];
    botName: string;
    botTone: string;
    conversationFlow?: string;
}

export interface ResponseCandidate {
    id: string;
    content: string;
    model: string;
    tier: 'construction' | 'style';
    parentId?: string; // For style candidates, references construction candidate
    variationIndex: number;
    generatedAt: number;
}

export interface ValidationResult {
    isValid: boolean;
    issues: string[];
    correctedResponse?: string;
    validationTimeMs: number;
    selectedCandidate?: ResponseCandidate;
    allCandidates?: ResponseCandidate[];
    selectorReasoning?: string;
    modelsUsed?: string[];
    modelsFailed?: string[];
}

// ============================================================================
// MODEL CONFIGURATIONS
// ============================================================================

// Tier 1: Message Construction Models
const CONSTRUCTION_MODELS = [
    { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron-70B' },
    { id: 'nvidia/llama-3.3-nemotron-super-49b-v1', name: 'Nemotron-Super-49B' },
    { id: 'mistralai/mistral-nemo-12b-instruct', name: 'Mistral-Nemo-12B' },
];

// Tier 2: Style Refinement Models
const STYLE_MODELS = [
    { id: 'qwen/qwen3-235b-a22b', name: 'Qwen3-235B' },
    { id: 'deepseek-ai/deepseek-v3.1', name: 'DeepSeek-V3.1' },
];

// Tier 3: Selector Model (GPT OSS 120B - Decision Maker)
const SELECTOR_MODEL = 'openai/gpt-oss-120b';

// Fallback selector models if primary fails
const FALLBACK_SELECTOR_MODELS = [
    'qwen/qwen3-235b-a22b',
    'deepseek-ai/deepseek-v3.1',
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a timeout promise that rejects after specified ms
 */
function createTimeout<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout: ${message} (${ms}ms)`)), ms);
    });
}

/**
 * Call a model with timeout and error handling - NEVER throws, returns null on failure
 */
async function callModelSafe(
    modelId: string,
    systemPrompt: string,
    userPrompt: string,
    temperature: number = 0.7,
    maxTokens: number = 1024,
    timeoutMs: number = MODEL_TIMEOUT_MS
): Promise<{ content: string | null; error?: string }> {
    const startTime = Date.now();
    try {
        const modelCall = async (): Promise<string> => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response: any = await nvidiaClient.chat.completions.create({
                model: modelId,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature,
                max_tokens: maxTokens,
                stream: false,
            });

            const content = response.choices?.[0]?.message?.content || '';
            return content.trim();
        };

        // Race between model call and timeout
        const content = await Promise.race([
            modelCall(),
            createTimeout<string>(timeoutMs, `Model ${modelId}`),
        ]);

        console.log(`[Multi-Model] ${modelId} responded in ${Date.now() - startTime}ms`);
        return { content: content || null };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`[Multi-Model] ${modelId} failed (${Date.now() - startTime}ms): ${errorMessage}`);
        return { content: null, error: errorMessage };
    }
}

/**
 * Generate unique ID for candidates
 */
function generateCandidateId(): string {
    return `cand_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ============================================================================
// TIER 1: MESSAGE CONSTRUCTION (FULLY PARALLEL)
// ============================================================================

/**
 * Generate construction candidates from ALL models in PARALLEL
 * Returns whatever candidates we got before timeout
 */
async function generateConstructionCandidatesParallel(
    originalResponse: string,
    context: ValidationContext
): Promise<{ candidates: ResponseCandidate[]; modelsUsed: string[]; modelsFailed: string[] }> {
    const candidates: ResponseCandidate[] = [];
    const modelsUsed: string[] = [];
    const modelsFailed: string[] = [];
    const systemPrompt = buildConstructionSystemPrompt(context);

    console.log('[Multi-Model Construction] Starting ALL models + variations in PARALLEL...');

    // Create ALL model+variation calls as parallel promises
    const allPromises: Promise<{ model: string; variation: number; content: string | null }>[] = [];

    for (const model of CONSTRUCTION_MODELS) {
        for (let variation = 0; variation < 2; variation++) {
            const userPrompt = buildConstructionUserPrompt(originalResponse, variation, context);
            const temperature = 0.5 + (variation * 0.3);

            const promise = callModelSafe(model.id, systemPrompt, userPrompt, temperature)
                .then(result => ({
                    model: model.name,
                    variation,
                    content: result.content,
                }));

            allPromises.push(promise);
        }
    }

    // Run all in parallel with overall phase timeout
    try {
        const results = await Promise.race([
            Promise.all(allPromises),
            createTimeout<never>(CONSTRUCTION_PHASE_TIMEOUT_MS, 'Construction phase'),
        ]);

        // Process results
        for (const result of results) {
            if (result.content && result.content.length > 0) {
                candidates.push({
                    id: generateCandidateId(),
                    content: result.content,
                    model: result.model,
                    tier: 'construction',
                    variationIndex: result.variation,
                    generatedAt: Date.now(),
                });
                if (!modelsUsed.includes(result.model)) {
                    modelsUsed.push(result.model);
                }
            } else {
                if (!modelsFailed.includes(result.model)) {
                    modelsFailed.push(result.model);
                }
            }
        }
    } catch (error) {
        console.warn('[Multi-Model Construction] Phase timeout - using candidates collected so far');
        // On timeout, we still return whatever candidates were collected
    }

    console.log(`[Multi-Model Construction] Completed: ${candidates.length} candidates from ${modelsUsed.length} models`);
    return { candidates, modelsUsed, modelsFailed };
}

/**
 * Build system prompt for construction models
 */
function buildConstructionSystemPrompt(context: ValidationContext): string {
    let prompt = `You are ${context.botName}, a friendly Filipino salesperson. Your style: ${context.botTone}.

Your task is to REWRITE the given message to better follow the rules and conversation style.

CRITICAL RULES TO FOLLOW:
${context.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

STYLE REQUIREMENTS:
- Use Taglish (mix of Tagalog and English)
- Keep messages short and conversational
- Use 1-2 emojis maximum
- NEVER use em dashes (—) or en dashes (–)
- Be natural and friendly, not robotic

`;

    if (context.conversationFlow) {
        prompt += `CONVERSATION FLOW:
${context.conversationFlow}

Follow this flow structure when crafting responses.

`;
    }

    if (context.knowledgeContext) {
        prompt += `REFERENCE DATA:
${context.knowledgeContext}

Use EXACT information from above. Do NOT make up prices or details.

`;
    }

    prompt += `OUTPUT: Return ONLY the rewritten message. No explanations or meta-commentary.`;

    return prompt;
}

/**
 * Build user prompt for construction models
 */
function buildConstructionUserPrompt(
    originalResponse: string,
    variationIndex: number,
    context: ValidationContext
): string {
    const variationGuide = variationIndex === 0
        ? 'Focus on clarity and rule compliance.'
        : 'Focus on natural conversation flow and engagement.';

    const historyContext = context.conversationHistory.length > 0
        ? `\n\nRecent conversation:\n${context.conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}`
        : '';

    return `Rewrite this message to follow all rules and match the conversation style.

${variationGuide}
${historyContext}

Original message to rewrite:
"${originalResponse}"

Rewritten message:`;
}

// ============================================================================
// TIER 2: STYLE REFINEMENT (FULLY PARALLEL)
// ============================================================================

/**
 * Refine construction candidates with style models - ALL IN PARALLEL
 */
async function refineWithStyleModelsParallel(
    constructionCandidates: ResponseCandidate[],
    context: ValidationContext
): Promise<{ candidates: ResponseCandidate[]; modelsUsed: string[]; modelsFailed: string[] }> {
    const styleCandidates: ResponseCandidate[] = [];
    const modelsUsed: string[] = [];
    const modelsFailed: string[] = [];
    const systemPrompt = buildStyleSystemPrompt(context);

    // Take top 3 construction candidates
    const topCandidates = constructionCandidates.slice(0, 3);

    if (topCandidates.length === 0) {
        console.log('[Multi-Model Style] No construction candidates to refine');
        return { candidates: [], modelsUsed: [], modelsFailed: [] };
    }

    console.log(`[Multi-Model Style] Refining ${topCandidates.length} candidates with ${STYLE_MODELS.length} models IN PARALLEL...`);

    // Create ALL style refinement calls as parallel promises
    const allPromises: Promise<{
        parentId: string;
        model: string;
        variation: number;
        content: string | null
    }>[] = [];

    for (const candidate of topCandidates) {
        for (const styleModel of STYLE_MODELS) {
            for (let variation = 0; variation < 2; variation++) {
                const userPrompt = buildStyleUserPrompt(candidate.content, variation, context);
                const temperature = 0.4 + (variation * 0.2);

                const promise = callModelSafe(styleModel.id, systemPrompt, userPrompt, temperature)
                    .then(result => ({
                        parentId: candidate.id,
                        model: styleModel.name,
                        variation,
                        content: result.content,
                    }));

                allPromises.push(promise);
            }
        }
    }

    // Run all in parallel with overall phase timeout
    try {
        const results = await Promise.race([
            Promise.all(allPromises),
            createTimeout<never>(STYLE_PHASE_TIMEOUT_MS, 'Style refinement phase'),
        ]);

        // Process results
        for (const result of results) {
            if (result.content && result.content.length > 0) {
                styleCandidates.push({
                    id: generateCandidateId(),
                    content: result.content,
                    model: result.model,
                    tier: 'style',
                    parentId: result.parentId,
                    variationIndex: result.variation,
                    generatedAt: Date.now(),
                });
                if (!modelsUsed.includes(result.model)) {
                    modelsUsed.push(result.model);
                }
            } else {
                if (!modelsFailed.includes(result.model)) {
                    modelsFailed.push(result.model);
                }
            }
        }
    } catch (error) {
        console.warn('[Multi-Model Style] Phase timeout - using candidates collected so far');
    }

    console.log(`[Multi-Model Style] Completed: ${styleCandidates.length} style candidates from ${modelsUsed.length} models`);
    return { candidates: styleCandidates, modelsUsed, modelsFailed };
}

/**
 * Build system prompt for style models
 */
function buildStyleSystemPrompt(context: ValidationContext): string {
    return `You are a Filipino communication expert specializing in sales conversations.

Your task is to POLISH the given message for better style while keeping the core meaning.

STYLE REQUIREMENTS:
- Natural Taglish flow (not forced mixing)
- Warm, approachable tone
- Appropriate casualness for sales chat
- 1-2 emojis that feel natural
- Short, punchy sentences
- Easy to read on mobile

RULES TO MAINTAIN:
${context.rules.slice(0, 5).map((r, i) => `${i + 1}. ${r}`).join('\n')}

OUTPUT: Return ONLY the polished message. No explanations.`;
}

/**
 * Build user prompt for style models
 */
function buildStyleUserPrompt(
    content: string,
    variationIndex: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: ValidationContext
): string {
    const styleGuide = variationIndex === 0
        ? 'Make it warm and friendly while staying professional.'
        : 'Make it casual and engaging, like chatting with a friend.';

    return `Polish this message for better conversation style.

${styleGuide}

Message to polish:
"${content}"

Polished message:`;
}

// ============================================================================
// TIER 3: SELECTION (WITH FALLBACKS)
// ============================================================================

/**
 * Pick best response with multiple fallback selectors
 * GUARANTEED to return a candidate (worst case: first in list)
 */
export async function pickBestResponse(
    candidates: ResponseCandidate[],
    context: ValidationContext,
    originalResponse: string
): Promise<{ best: ResponseCandidate; reasoning: string; selectorModel: string }> {

    // Safety check: if no candidates, create one from original
    if (candidates.length === 0) {
        console.warn('[Multi-Model Selector] No candidates provided, using original response');
        return {
            best: {
                id: generateCandidateId(),
                content: originalResponse,
                model: 'Original',
                tier: 'construction',
                variationIndex: 0,
                generatedAt: Date.now(),
            },
            reasoning: 'Fallback: No candidates available, using original response',
            selectorModel: 'None',
        };
    }

    console.log(`[Multi-Model Selector] Selecting best from ${candidates.length} candidates...`);

    // Step 1: Try GPT OSS 120B to generate its own variation AND select
    const gptVariationPrompt = `You are ${context.botName}, a friendly Filipino salesperson. Your style: ${context.botTone}.

CRITICAL RULES TO FOLLOW:
${context.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

${context.conversationFlow ? `CONVERSATION FLOW:\n${context.conversationFlow}\n` : ''}

${context.knowledgeContext ? `REFERENCE DATA:\n${context.knowledgeContext}\n\nUse EXACT information from above.\n` : ''}

STYLE: Use natural Taglish, keep it short, 1-2 emojis max. Be warm and conversational.

OUTPUT: Return ONLY the message. No explanations.`;

    const gptUserPrompt = `Create the BEST possible response for this conversation.

Recent history:
${context.conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

Original response to improve:
"${originalResponse}"

Your best version:`;

    let gptOwnVariation: ResponseCandidate | null = null;

    // Try to get GPT's own variation (non-blocking)
    const gptResult = await callModelSafe(SELECTOR_MODEL, gptVariationPrompt, gptUserPrompt, 0.5, 1024, SELECTOR_TIMEOUT_MS);
    if (gptResult.content) {
        gptOwnVariation = {
            id: generateCandidateId(),
            content: gptResult.content,
            model: 'GPT-OSS-120B',
            tier: 'style',
            variationIndex: 0,
            generatedAt: Date.now(),
        };
        console.log('[Multi-Model Selector] GPT OSS 120B generated its own variation');
    }

    // Add GPT's variation to candidates
    const allCandidatesWithGpt = gptOwnVariation
        ? [...candidates, gptOwnVariation]
        : candidates;

    // Step 2: Try selector models in order until one works
    const selectorModels = [SELECTOR_MODEL, ...FALLBACK_SELECTOR_MODELS];

    for (const selectorModel of selectorModels) {
        const selectionResult = await trySelectBest(allCandidatesWithGpt, context, selectorModel);
        if (selectionResult) {
            return {
                best: selectionResult.best,
                reasoning: selectionResult.reasoning,
                selectorModel,
            };
        }
    }

    // Step 3: All selectors failed - use intelligent fallback
    console.warn('[Multi-Model Selector] All selector models failed, using intelligent fallback');

    // Prefer GPT's own variation if available
    if (gptOwnVariation) {
        return {
            best: gptOwnVariation,
            reasoning: 'Fallback: All selectors failed, using GPT OSS 120B own variation',
            selectorModel: 'Fallback',
        };
    }

    // Otherwise, prefer style candidates over construction candidates
    const styleCandidates = allCandidatesWithGpt.filter(c => c.tier === 'style');
    if (styleCandidates.length > 0) {
        return {
            best: styleCandidates[0],
            reasoning: 'Fallback: All selectors failed, using first style candidate',
            selectorModel: 'Fallback',
        };
    }

    // Last resort: first candidate
    return {
        best: allCandidatesWithGpt[0],
        reasoning: 'Fallback: All selectors failed, using first available candidate',
        selectorModel: 'Fallback',
    };
}

/**
 * Try to use a selector model to pick the best response
 * Returns null if selector fails
 */
async function trySelectBest(
    candidates: ResponseCandidate[],
    context: ValidationContext,
    selectorModelId: string
): Promise<{ best: ResponseCandidate; reasoning: string } | null> {

    const systemPrompt = `You are an expert evaluator for sales chatbot responses.

Your task is to pick the BEST response from multiple candidates based on:
1. Rule Compliance - Does it follow all the given rules?
2. Conversation Flow - Does it match the expected flow style?
3. Natural Language - Is it natural Taglish, not robotic?
4. Engagement - Will it keep the customer interested?
5. Clarity - Is it clear and easy to understand?

RULES TO CHECK:
${context.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

${context.conversationFlow ? `CONVERSATION FLOW:\n${context.conversationFlow}\n` : ''}

Be objective - pick the best response.

OUTPUT FORMAT (JSON only, no other text):
{
  "selectedIndex": <0-based index of best candidate>,
  "score": <0.0 to 1.0>,
  "reasoning": "<brief explanation>"
}`;

    const candidatesList = candidates.map((c, i) =>
        `[${i}] (${c.model}): "${c.content}"`
    ).join('\n\n');

    const userPrompt = `Pick the best response:

${candidatesList}

JSON:`;

    const result = await callModelSafe(selectorModelId, systemPrompt, userPrompt, 0.2, 512, SELECTOR_TIMEOUT_MS);

    if (!result.content) {
        console.warn(`[Multi-Model Selector] ${selectorModelId} failed to respond`);
        return null;
    }

    try {
        // Parse JSON response
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const selectedIndex = Math.min(Math.max(0, parsed.selectedIndex || 0), candidates.length - 1);

            console.log(`[Multi-Model Selector] ${selectorModelId} selected candidate ${selectedIndex} (score: ${parsed.score})`);

            return {
                best: candidates[selectedIndex],
                reasoning: parsed.reasoning || 'Selected as best match',
            };
        }
    } catch (parseError) {
        console.warn(`[Multi-Model Selector] ${selectorModelId} returned invalid JSON`);
    }

    return null;
}

// ============================================================================
// MAIN VALIDATION FUNCTION (FAULT-TOLERANT)
// ============================================================================

/**
 * Main entry point: Validate and potentially improve a response
 * GUARANTEED to return a result - never throws, never leaves contact without message
 */
export async function validateResponse(
    originalResponse: string,
    context: ValidationContext
): Promise<ValidationResult> {
    const startTime = Date.now();
    console.log('[Multi-Model] Starting PARALLEL validation pipeline...');

    // Track all models used and failed
    let allModelsUsed: string[] = [];
    let allModelsFailed: string[] = [];

    try {
        // Wrap entire pipeline in timeout
        const pipelinePromise = async (): Promise<ValidationResult> => {
            // Tier 1: Generate construction candidates (PARALLEL)
            const constructionResult = await generateConstructionCandidatesParallel(originalResponse, context);
            allModelsUsed.push(...constructionResult.modelsUsed);
            allModelsFailed.push(...constructionResult.modelsFailed);

            if (constructionResult.candidates.length === 0) {
                console.log('[Multi-Model] No construction candidates generated, using original');
                return {
                    isValid: true,
                    issues: ['All construction models failed'],
                    validationTimeMs: Date.now() - startTime,
                    modelsUsed: allModelsUsed,
                    modelsFailed: allModelsFailed,
                };
            }

            // Tier 2: Refine with style models (PARALLEL)
            const styleResult = await refineWithStyleModelsParallel(constructionResult.candidates, context);
            allModelsUsed.push(...styleResult.modelsUsed);
            allModelsFailed.push(...styleResult.modelsFailed);

            // Combine all candidates (prefer style, fallback to construction)
            const allCandidates = styleResult.candidates.length > 0
                ? styleResult.candidates
                : constructionResult.candidates;

            // Tier 3: Select best response (WITH FALLBACKS)
            const { best, reasoning, selectorModel } = await pickBestResponse(allCandidates, context, originalResponse);

            if (!allModelsUsed.includes(selectorModel) && selectorModel !== 'None' && selectorModel !== 'Fallback') {
                allModelsUsed.push(selectorModel);
            }

            const validationTimeMs = Date.now() - startTime;
            console.log(`[Multi-Model] Pipeline completed in ${validationTimeMs}ms`);

            // Check if the best response is different from original
            const isImproved = best.content !== originalResponse;

            return {
                isValid: !isImproved,
                issues: isImproved ? ['Response improved by multi-model pipeline'] : [],
                correctedResponse: isImproved ? best.content : undefined,
                validationTimeMs,
                selectedCandidate: best,
                allCandidates,
                selectorReasoning: reasoning,
                modelsUsed: allModelsUsed,
                modelsFailed: allModelsFailed,
            };
        };

        // Race pipeline against total timeout
        return await Promise.race([
            pipelinePromise(),
            createTimeout<ValidationResult>(TOTAL_PIPELINE_TIMEOUT_MS, 'Total pipeline'),
        ]);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Multi-Model] Pipeline error: ${errorMessage}`);

        // GUARANTEED FALLBACK: Return original response
        return {
            isValid: true,
            issues: [`Pipeline error: ${errorMessage}`],
            validationTimeMs: Date.now() - startTime,
            modelsUsed: allModelsUsed,
            modelsFailed: allModelsFailed,
        };
    }
}

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Log validation results for analytics
 */
export async function logValidationResult(
    senderId: string,
    originalResponse: string,
    result: ValidationResult
): Promise<void> {
    try {
        await supabase.from('response_validation_logs').insert({
            sender_id: senderId,
            original_response: originalResponse,
            is_valid: result.isValid,
            issues: result.issues,
            corrected_response: result.correctedResponse,
            validation_time_ms: result.validationTimeMs,
            selected_model: result.selectedCandidate?.model,
            selector_reasoning: result.selectorReasoning,
            candidates_count: result.allCandidates?.length,
            models_used: result.modelsUsed,
            models_failed: result.modelsFailed,
        });
    } catch (error) {
        // Log to console but don't fail - this is analytics
        console.error('[Multi-Model Logging] Error:', error);
    }
}
