/**
 * Multi-Model Response Validation Service
 * 
 * This service implements a multi-tier AI response pipeline:
 * - Tier 1: Message Construction (3 models × 2 variations = 6 candidates)
 * - Tier 2: Style Refinement (2 models × 2 variations per candidate)
 * - Tier 3: Final Selection (1 model picks the best response)
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
}

// ============================================================================
// MODEL CONFIGURATIONS
// ============================================================================

// Tier 1: Message Construction Models
const CONSTRUCTION_MODELS = [
    { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron-70B' },
    { id: 'nvidia/llama-3.3-nemotron-super-49b-v1', name: 'Nemotron-Super-49B' },
    { id: 'mistralai/mistral-nemo-12b-instruct', name: 'Mistral-Nemo-12B' }, // Fallback for Nemotron Nano
];

// Tier 2: Style Refinement Models
const STYLE_MODELS = [
    { id: 'qwen/qwen3-235b-a22b', name: 'Qwen3-235B' },
    { id: 'deepseek-ai/deepseek-v3.1', name: 'DeepSeek-V3.1' },
];

// Tier 3: Selector Model (GPT OSS 120B - Decision Maker)
const SELECTOR_MODEL = 'openai/gpt-oss-120b';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Call a model with timeout and error handling
 */
async function callModel(
    modelId: string,
    systemPrompt: string,
    userPrompt: string,
    temperature: number = 0.7,
    maxTokens: number = 1024
): Promise<string> {
    const startTime = Date.now();
    try {
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
        console.log(`[Multi-Model] ${modelId} responded in ${Date.now() - startTime}ms`);
        return content.trim();
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Multi-Model] Error calling ${modelId}:`, errorMessage);
        throw error;
    }
}

/**
 * Generate unique ID for candidates
 */
function generateCandidateId(): string {
    return `cand_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ============================================================================
// TIER 1: MESSAGE CONSTRUCTION
// ============================================================================

/**
 * Generate construction candidates from multiple models
 * Each model generates 2 variations = 6 total candidates
 */
async function generateConstructionCandidates(
    originalResponse: string,
    context: ValidationContext
): Promise<ResponseCandidate[]> {
    const candidates: ResponseCandidate[] = [];
    const systemPrompt = buildConstructionSystemPrompt(context);

    console.log('[Multi-Model Construction] Starting with 3 models, 2 variations each...');

    // Run all models in parallel
    const modelPromises = CONSTRUCTION_MODELS.map(async (model) => {
        const modelCandidates: ResponseCandidate[] = [];

        for (let variation = 0; variation < 2; variation++) {
            try {
                const userPrompt = buildConstructionUserPrompt(originalResponse, variation, context);
                const temperature = 0.5 + (variation * 0.3); // Vary temperature for diversity

                const content = await callModel(model.id, systemPrompt, userPrompt, temperature);

                if (content && content.length > 0) {
                    modelCandidates.push({
                        id: generateCandidateId(),
                        content,
                        model: model.name,
                        tier: 'construction',
                        variationIndex: variation,
                        generatedAt: Date.now(),
                    });
                }
            } catch (error) {
                console.error(`[Multi-Model Construction] ${model.name} variation ${variation + 1} failed`);
            }
        }

        console.log(`[Multi-Model Construction] ${model.name} generated ${modelCandidates.length} candidates`);
        return modelCandidates;
    });

    const results = await Promise.allSettled(modelPromises);

    for (const result of results) {
        if (result.status === 'fulfilled') {
            candidates.push(...result.value);
        }
    }

    console.log(`[Multi-Model Construction] Total candidates: ${candidates.length}`);
    return candidates;
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
// TIER 2: STYLE REFINEMENT
// ============================================================================

/**
 * Refine construction candidates with style models
 * Each style model generates 2 variations per construction candidate
 */
async function refineWithStyleModels(
    constructionCandidates: ResponseCandidate[],
    context: ValidationContext
): Promise<ResponseCandidate[]> {
    const styleCandidates: ResponseCandidate[] = [];
    const systemPrompt = buildStyleSystemPrompt(context);

    console.log(`[Multi-Model Style] Refining ${constructionCandidates.length} candidates with 2 style models...`);

    // Take top 3 construction candidates to avoid explosion
    const topCandidates = constructionCandidates.slice(0, 3);

    for (const candidate of topCandidates) {
        for (const styleModel of STYLE_MODELS) {
            for (let variation = 0; variation < 2; variation++) {
                try {
                    const userPrompt = buildStyleUserPrompt(candidate.content, variation, context);
                    const temperature = 0.4 + (variation * 0.2);

                    const content = await callModel(styleModel.id, systemPrompt, userPrompt, temperature);

                    if (content && content.length > 0) {
                        styleCandidates.push({
                            id: generateCandidateId(),
                            content,
                            model: styleModel.name,
                            tier: 'style',
                            parentId: candidate.id,
                            variationIndex: variation,
                            generatedAt: Date.now(),
                        });
                    }
                } catch (error) {
                    console.error(`[Multi-Model Style] ${styleModel.name} failed for candidate ${candidate.id}`);
                }
            }
        }
    }

    console.log(`[Multi-Model Style] Total style candidates: ${styleCandidates.length}`);
    return styleCandidates;
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

/**
 * Use GPT OSS 120B to:
 * 1. Generate its own variation
 * 2. Pick the best response from all candidates (including its own)
 */
export async function pickBestResponse(
    candidates: ResponseCandidate[],
    context: ValidationContext,
    originalResponse: string
): Promise<{ best: ResponseCandidate; reasoning: string }> {
    console.log(`[Multi-Model Selector] GPT OSS 120B generating its own variation...`);

    // Step 1: GPT OSS 120B generates its own variation
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
    try {
        const gptContent = await callModel(SELECTOR_MODEL, gptVariationPrompt, gptUserPrompt, 0.5);
        if (gptContent && gptContent.length > 0) {
            gptOwnVariation = {
                id: generateCandidateId(),
                content: gptContent,
                model: 'GPT-OSS-120B',
                tier: 'style',
                variationIndex: 0,
                generatedAt: Date.now(),
            };
            console.log(`[Multi-Model Selector] GPT OSS 120B generated its own variation`);
        }
    } catch (error) {
        console.error('[Multi-Model Selector] GPT OSS 120B variation generation failed:', error);
    }

    // Add GPT's variation to candidates
    const allCandidatesWithGpt = gptOwnVariation
        ? [...candidates, gptOwnVariation]
        : candidates;

    console.log(`[Multi-Model Selector] Evaluating ${allCandidatesWithGpt.length} total candidates (including GPT's own)...`);

    // Step 2: GPT OSS 120B picks the best from all candidates
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

Be objective - pick the best response even if it's not your own.

OUTPUT FORMAT (JSON):
{
  "selectedIndex": <0-based index of best candidate>,
  "score": <0.0 to 1.0>,
  "reasoning": "<brief explanation of why this is the best choice>"
}`;

    const candidatesList = allCandidatesWithGpt.map((c, i) =>
        `[${i}] (${c.model}): "${c.content}"`
    ).join('\n\n');

    const userPrompt = `Evaluate these response candidates and pick the best one:

${candidatesList}

Return your selection as JSON:`;

    try {
        const response = await callModel(SELECTOR_MODEL, systemPrompt, userPrompt, 0.2, 512);

        // Parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const selectedIndex = Math.min(Math.max(0, parsed.selectedIndex || 0), allCandidatesWithGpt.length - 1);

            console.log(`[Multi-Model Selector] Selected candidate ${selectedIndex} (score: ${parsed.score})`);
            console.log(`[Multi-Model Selector] Reasoning: ${parsed.reasoning}`);

            return {
                best: allCandidatesWithGpt[selectedIndex],
                reasoning: parsed.reasoning || 'Selected as best match',
            };
        }
    } catch (error) {
        console.error('[Multi-Model Selector] Error parsing selection:', error);
    }

    // Fallback: prefer GPT's own variation if available
    if (gptOwnVariation) {
        console.log('[Multi-Model Selector] Fallback: using GPT OSS 120B own variation');
        return {
            best: gptOwnVariation,
            reasoning: 'Fallback: GPT OSS 120B own variation',
        };
    }

    console.log('[Multi-Model Selector] Fallback: using first candidate');
    return {
        best: candidates[0],
        reasoning: 'Fallback selection (parsing failed)',
    };
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Main entry point: Validate and potentially improve a response
 */
export async function validateResponse(
    originalResponse: string,
    context: ValidationContext
): Promise<ValidationResult> {
    const startTime = Date.now();
    console.log('[Multi-Model] Starting validation pipeline...');

    try {
        // Tier 1: Generate construction candidates
        const constructionCandidates = await generateConstructionCandidates(originalResponse, context);

        if (constructionCandidates.length === 0) {
            console.log('[Multi-Model] No construction candidates generated, using original');
            return {
                isValid: true,
                issues: [],
                validationTimeMs: Date.now() - startTime,
            };
        }

        // Tier 2: Refine with style models
        const styleCandidates = await refineWithStyleModels(constructionCandidates, context);

        // Combine all candidates (style candidates are preferred, but include construction as fallback)
        const allCandidates = styleCandidates.length > 0
            ? styleCandidates
            : constructionCandidates;

        // Tier 3: Select best response (GPT OSS 120B generates its own variation and picks best)
        const { best, reasoning } = await pickBestResponse(allCandidates, context, originalResponse);

        const validationTimeMs = Date.now() - startTime;
        console.log(`[Multi-Model] Pipeline completed in ${validationTimeMs}ms`);

        // Check if the best response is different from original
        const isImproved = best.content !== originalResponse;

        return {
            isValid: !isImproved, // If we improved it, original wasn't fully valid
            issues: isImproved ? ['Response improved by multi-model pipeline'] : [],
            correctedResponse: isImproved ? best.content : undefined,
            validationTimeMs,
            selectedCandidate: best,
            allCandidates,
            selectorReasoning: reasoning,
        };
    } catch (error) {
        console.error('[Multi-Model] Pipeline error:', error);
        return {
            isValid: true, // On error, pass through original
            issues: ['Validation pipeline error'],
            validationTimeMs: Date.now() - startTime,
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
        });
    } catch (error) {
        // Log to console but don't fail - this is analytics
        console.error('[Multi-Model Logging] Error:', error);
    }
}
