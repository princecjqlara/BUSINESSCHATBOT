import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import OpenAI from 'openai';

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

// Get best ML model for analysis
const ML_MODELS = [
    'meta/llama-3.1-405b-instruct',
    'qwen/qwen3-235b-a22b',
    'meta/llama-3.1-70b-instruct',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidUuid = (value?: string | null) => !!value && UUID_REGEX.test(value);

async function getBestMLModel(): Promise<string> {
    // Check if API key is available
    if (!process.env.NVIDIA_API_KEY) {
        console.error('[Message Rating] NVIDIA_API_KEY not found in environment variables');
        // Return a default model even without API key - the actual API call will fail with a better error
        return ML_MODELS[ML_MODELS.length - 1];
    }

    // Try models in order, return first available one
    for (const model of ML_MODELS) {
        try {
            // Quick test to see if model is available
            await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1,
            });
            console.log(`[Message Rating] Using model: ${model}`);
            return model;
        } catch (error) {
            // Model not available, try next
            console.log(`[Message Rating] Model ${model} not available:`, error instanceof Error ? error.message : String(error));
            continue;
        }
    }
    // Final fallback - return the last model even if test failed
    const fallback = ML_MODELS[ML_MODELS.length - 1];
    console.log(`[Message Rating] Using fallback model: ${fallback}`);
    return fallback;
}

export async function POST(req: Request) {
    try {
        console.log('[Message Rating] Starting request processing...');
        let body;
        try {
            body = await req.json();
        } catch (jsonError) {
            console.error('[Message Rating] Failed to parse request body:', jsonError);
            return NextResponse.json(
                { error: 'Invalid JSON in request body', details: jsonError instanceof Error ? jsonError.message : String(jsonError) },
                { status: 400 }
            );
        }

        console.log('[Message Rating] Received request:', {
            sessionId: body.sessionId,
            messageIndex: body.messageIndex,
            rating: body.rating,
            hasUserMessage: !!body.userMessage,
            hasBotMessage: !!body.botMessage,
            conversationContextLength: body.conversationContext?.length || 0
        });

        const { sessionId, messageIndex, userMessage, botMessage, rating, conversationContext } = body;

        if (!sessionId || !botMessage || !rating) {
            console.error('[Message Rating] Missing required fields:', { sessionId: !!sessionId, botMessage: !!botMessage, rating: !!rating });
            return NextResponse.json(
                { error: 'Missing required fields', details: { sessionId: !!sessionId, botMessage: !!botMessage, rating: !!rating } },
                { status: 400 }
            );
        }

        // Store the rating
        console.log('[Message Rating] Attempting to insert rating into database...');
        const { data: ratingData, error: ratingError } = await supabase
            .from('message_ratings')
            .insert({
                session_id: sessionId,
                message_index: messageIndex || 0,
                user_message: userMessage || null,
                bot_message: botMessage,
                rating,
                conversation_context: conversationContext || [],
            })
            .select()
            .single();

        if (ratingError) {
            console.error('[Message Rating] Error storing rating:', ratingError);
            // Check if table exists
            if (ratingError.message?.includes('relation "message_ratings" does not exist')) {
                return NextResponse.json(
                    {
                        error: 'Database table not found. Please run the migration: supabase/migrations/add_message_ratings.sql',
                        details: ratingError.message
                    },
                    { status: 500 }
                );
            }
            return NextResponse.json(
                { error: 'Failed to store rating', details: ratingError.message },
                { status: 500 }
            );
        }

        console.log('[Message Rating] Rating stored successfully:', ratingData?.id);

        // If user liked the message, analyze and auto-improve
        if (rating === 'like' && ratingData) {
            console.log('[Message Rating] User liked message, starting auto-improvement analysis...');
            try {
                console.log('[Message Rating] Calling analyzeAndImprove...');
                const improvements = await analyzeAndImprove(botMessage, userMessage, conversationContext);
                console.log('[Message Rating] analyzeAndImprove returned:', {
                    hasImprovements: !!improvements,
                    applied: improvements?.applied,
                    documentsCount: improvements?.modifiedDocuments?.length || 0,
                    rulesCount: improvements?.modifiedRules?.length || 0
                });

                if (improvements && improvements.applied) {
                    console.log('[Message Rating] Improvements applied:', {
                        documents: improvements.modifiedDocuments?.length || 0,
                        rules: improvements.modifiedRules?.length || 0,
                        instructions: improvements.modifiedInstructions
                    });

                    // Update rating record with improvement info
                    const { error: updateError } = await supabase
                        .from('message_ratings')
                        .update({
                            improvement_applied: true,
                            improvement_applied_at: new Date().toISOString(),
                            modified_documents: improvements.modifiedDocuments || [],
                            modified_rules: improvements.modifiedRules || [],
                            modified_instructions: improvements.modifiedInstructions || false,
                        })
                        .eq('id', ratingData.id);

                    if (updateError) {
                        console.error('[Message Rating] Error updating rating record:', updateError);
                    }

                    return NextResponse.json({
                        success: true,
                        improvementsApplied: true,
                        improvements: {
                            documentsCount: improvements.modifiedDocuments?.length || 0,
                            rulesCount: improvements.modifiedRules?.length || 0,
                            instructionsUpdated: improvements.modifiedInstructions || false,
                            modifiedDocumentIds: improvements.modifiedDocuments || [], // Include document IDs
                        },
                    });
                } else {
                    console.log('[Message Rating] No improvements were applied (analysis returned no changes)');
                    return NextResponse.json({
                        success: true,
                        improvementsApplied: false,
                        message: 'Rating saved. No configuration changes were needed.',
                    });
                }
            } catch (error) {
                console.error('[Message Rating] Error applying improvements:', error);
                // Still return success for the rating, but note improvement failed
                return NextResponse.json({
                    success: true,
                    improvementsApplied: false,
                    error: 'Rating saved but auto-improvement failed',
                    details: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        console.log('[Message Rating] Rating saved (not a like, so no improvements)');
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Message Rating] Unexpected error:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : typeof error
        });
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                details: error instanceof Error ? error.message : 'Unknown error',
                message: 'An unexpected error occurred while processing the rating. Please check the server logs for details.'
            },
            { status: 500 }
        );
    }
}

async function analyzeAndImprove(
    likedMessage: string,
    userMessage: string,
    conversationContext: Array<{ role: string; content: string }>
): Promise<{
    applied: boolean;
    modifiedDocuments?: string[];
    modifiedRules?: string[];
    modifiedInstructions?: boolean;
} | null> {
    try {
        console.log('[Message Rating] analyzeAndImprove called with:', {
            likedMessageLength: likedMessage?.length || 0,
            userMessageLength: userMessage?.length || 0,
            contextLength: conversationContext?.length || 0
        });

        // Fetch current bot configuration
        console.log('[Message Rating] Fetching bot configuration...');
        const [botSettings, botRules, botInstructions, documents] = await Promise.all([
            supabase.from('bot_settings').select('*').limit(1).single(),
            supabase.from('bot_rules').select('*').order('priority', { ascending: false }),
            supabase.from('bot_instructions').select('*').limit(1).single(),
            supabase.from('documents').select('id, content, metadata').limit(20), // Get recent documents
        ]);

        console.log('[Message Rating] Configuration fetched:', {
            hasSettings: !!botSettings.data,
            settingsError: botSettings.error?.message,
            rulesCount: botRules.data?.length || 0,
            rulesError: botRules.error?.message,
            hasInstructions: !!botInstructions.data,
            instructionsError: botInstructions.error?.message,
            documentsCount: documents.data?.length || 0,
            documentsError: documents.error?.message
        });

        const settings = botSettings.data || {};
        const rules = botRules.data || [];
        const instructions = botInstructions.data?.instructions || '';
        const docs = documents.data || [];

        // If no documents/rules/instructions exist, we can't improve much
        if (docs.length === 0 && rules.length === 0 && !instructions) {
            console.log('[Message Rating] No configuration to improve (no documents, rules, or instructions)');
            return {
                applied: false,
                modifiedDocuments: [],
                modifiedRules: [],
                modifiedInstructions: false,
            };
        }

        console.log('[Message Rating] Getting best ML model...');
        const model = await getBestMLModel();
        console.log('[Message Rating] Selected model:', model);

        if (!process.env.NVIDIA_API_KEY) {
            console.error('[Message Rating] NVIDIA_API_KEY is not set in environment variables');
            return {
                applied: false,
                modifiedDocuments: [],
                modifiedRules: [],
                modifiedInstructions: false,
            };
        }

        const analysisPrompt = `You are an expert chatbot configuration analyst. A user has indicated they LIKED a specific bot response. Your task is to analyze why this response was good and automatically update the bot's configuration (documents, rules, instructions) to generate more responses in this same style and vibe.

LIKED BOT RESPONSE:
"${likedMessage}"

USER MESSAGE THAT PROMPTED IT:
"${userMessage || 'N/A'}"

CONVERSATION CONTEXT:
${conversationContext.map((m: any) => `${m.role}: ${m.content}`).join('\n')}

CURRENT BOT CONFIGURATION:

Bot Name: ${settings.bot_name || 'Assistant'}
Bot Tone: ${settings.bot_tone || 'helpful and professional'}

Current Rules:
${rules.length > 0 ? rules.map((r: any, i: number) => `${i + 1}. ${r.rule}`).join('\n') : 'No rules configured.'}

Current Instructions:
${instructions || 'No instructions configured.'}

Available Documents (first 5):
${docs.slice(0, 5).map((d: any, i: number) => `${i + 1}. [ID: ${d.id}] ${d.content.substring(0, 200)}...`).join('\n\n')}

ANALYSIS TASK:
1. Identify the key style elements that made this response good (tone, language, structure, approach, personality)
2. Identify the SITUATION/CONTEXT where this response worked well (what was the user asking? what was the conversation state?)
3. Determine which documents should be updated with SPECIFIC INSTRUCTIONS for the bot to message in this style when similar situations occur
4. Generate specific, actionable instructions that tell the bot WHEN and HOW to message like this

IMPORTANT FOR DOCUMENT EDITS:
- Add clear instructions at the beginning or end of each document explaining WHEN to use this messaging style
- Include specific situations/scenarios where this style should be applied
- Provide examples of how to adapt this style to similar contexts
- Make instructions actionable: "When [situation], message like this: [style/approach]"

RESPOND WITH VALID JSON ONLY (no markdown, no explanation):
{
  "analysis": {
    "styleElements": ["element1", "element2", ...],
    "whyItWorked": "Brief explanation of why this response was effective",
    "recommendedChanges": "What needs to change to get more responses like this"
  },
  "documentEdits": [
    {
      "documentId": "document_id_from_list_above",
      "action": "update",
      "newContent": "Original document content...\n\n[ADD AT THE END] MESSAGING INSTRUCTION FOR SIMILAR SITUATIONS:\nWhen [specific situation/context], message in this style: [describe the style elements from the liked response]. Use this approach: [specific instructions on tone, language, structure]. Example of good response: [reference the liked response style].",
      "reason": "Why this document should be updated and what situations it applies to"
    }
  ],
  "ruleEdits": [
    {
      "ruleId": "rule_id_here or null for new",
      "action": "add|update",
      "rule": "New or updated rule text",
      "priority": 5,
      "reason": "Why this rule helps achieve the desired style"
    }
  ],
  "instructionEdits": {
    "action": "update",
    "newInstructions": "Updated instructions that encourage this style",
    "reason": "Why instructions should be updated"
  }
}

IMPORTANT:
- Only suggest edits that directly help achieve the liked response style
- Be specific and actionable with situation-based instructions
- If no changes are needed, return empty arrays
- For document edits: 
  * Preserve ALL original content
  * ADD specific instructions at the end explaining WHEN (situation/context) and HOW (style/approach) to message like the liked response
  * Format: "MESSAGING INSTRUCTION FOR SIMILAR SITUATIONS: When [situation], message like this: [specific style instructions]"
- For rules, focus on behavioral guidelines that match the liked response for specific situations
- For instructions, update general conversation style to match and include situation-based guidance`;

        console.log('[Message Rating] Calling AI API with model:', model);
        let response;
        let responseText = '';

        try {
            if (!process.env.NVIDIA_API_KEY) {
                console.error('[Message Rating] NVIDIA_API_KEY is not set');
                return {
                    applied: false,
                    modifiedDocuments: [],
                    modifiedRules: [],
                    modifiedInstructions: false,
                };
            }

            response = await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: analysisPrompt }],
                temperature: 0.7,
                max_tokens: 4000,
            });

            responseText = response.choices[0]?.message?.content || '';
            console.log('[Message Rating] AI API response received, length:', responseText.length);

            if (!responseText) {
                console.error('[Message Rating] AI API returned empty response');
                return {
                    applied: false,
                    modifiedDocuments: [],
                    modifiedRules: [],
                    modifiedInstructions: false,
                };
            }
        } catch (apiError) {
            console.error('[Message Rating] AI API call failed:', {
                error: apiError instanceof Error ? apiError.message : String(apiError),
                model: model,
                hasApiKey: !!process.env.NVIDIA_API_KEY,
                stack: apiError instanceof Error ? apiError.stack : undefined
            });
            // Return early if API call fails - don't crash the whole rating
            return {
                applied: false,
                modifiedDocuments: [],
                modifiedRules: [],
                modifiedInstructions: false,
            };
        }

        // Parse JSON response
        let parsedResponse;
        try {
            const cleanedResponse = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();

            const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedResponse = JSON.parse(jsonMatch[0]);
                console.log('[Message Rating] Successfully parsed AI response');
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            console.error('[Message Rating] Failed to parse AI response:', {
                error: parseError instanceof Error ? parseError.message : String(parseError),
                responsePreview: responseText.substring(0, 200)
            });
            return {
                applied: false,
                modifiedDocuments: [],
                modifiedRules: [],
                modifiedInstructions: false,
            };
        }

        // First, save the liked message as a document in uncategorized category
        let savedLikedMessageId: string | null = null;
        try {
            console.log('[Message Rating] Saving liked message as document in uncategorized...');
            const { addDocument } = await import('@/app/lib/rag');

            // Create a document with the liked message and context
            const documentContent = `LIKED BOT RESPONSE EXAMPLE:
"${likedMessage}"

USER MESSAGE THAT PROMPTED IT:
"${userMessage || 'N/A'}"

SITUATION CONTEXT:
${conversationContext.map(m => `${m.role}: ${m.content}`).join('\n')}

INSTRUCTION: Use this as a reference for how to respond in similar situations. Match the tone, style, and approach shown in the liked response above.`;

            const success = await addDocument(documentContent, {
                name: `Liked Response - ${new Date().toLocaleDateString()}`,
                source: 'message_rating',
                likedMessage: true
            });

            if (success) {
                // Get the document ID that was just created
                const { data: newDoc } = await supabase
                    .from('documents')
                    .select('id')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (newDoc) {
                    savedLikedMessageId = String(newDoc.id);
                    console.log('[Message Rating] âœ… Liked message saved as document:', savedLikedMessageId);
                }
            }
        } catch (error) {
            console.error('[Message Rating] Error saving liked message as document:', error);
            // Continue even if saving fails
        }

        // Apply the improvements
        const modifiedDocuments: string[] = [];
        const modifiedRules: string[] = [];
        let modifiedInstructions = false;

        // Apply document edits
        if (parsedResponse.documentEdits && Array.isArray(parsedResponse.documentEdits)) {
            for (const edit of parsedResponse.documentEdits) {
                if (edit.documentId && edit.newContent) {
                    try {
                        // Try to find the document by ID (could be a chunk ID or document ID in metadata)
                        const { data: docChunks } = await supabase
                            .from('documents')
                            .select('id, content, metadata')
                            .or(`id.eq.${edit.documentId},metadata->>document_id.eq.${edit.documentId}`)
                            .limit(100);

                        if (docChunks && docChunks.length > 0) {
                            // Update the first chunk with the new content
                            // In a production system, you'd want to re-chunk the document properly
                            const firstChunk = docChunks[0];
                            const { error: updateError } = await supabase
                                .from('documents')
                                .update({
                                    content: edit.newContent,
                                    edited_by_ai: true, // Use edited_by_ai (ML AI edits are tracked via ml_knowledge_changes)
                                    last_ai_edit_at: new Date().toISOString()
                                })
                                .eq('id', firstChunk.id);

                            if (!updateError) {
                                // Store the actual database document ID (not the AI's suggested ID)
                                modifiedDocuments.push(String(firstChunk.id));

                                // Create entry in ml_knowledge_changes to track this edit
                                const { data: changeRow, error: changeError } = await supabase
                                    .from('ml_knowledge_changes')
                                    .insert({
                                        entity_type: 'document',
                                        entity_id: String(firstChunk.id),
                                        change_type: 'update',
                                        old_value: { content: firstChunk.content },
                                        new_value: { content: edit.newContent },
                                        reason: edit.reason || 'Auto-improvement based on liked message',
                                        confidence_score: 0.8,
                                        approved: true,
                                        applied: true,
                                        created_by: 'message_rating',
                                        model_used: 'auto-improvement',
                                    })
                                    .select('id')
                                    .single();

                                if (changeError) {
                                    console.error(`[Message Rating] Error creating ml_knowledge_changes entry:`, changeError);
                                } else {
                                    if (changeRow?.id) {
                                        await supabase
                                            .from('documents')
                                            .update({ ai_edit_change_id: changeRow.id })
                                            .eq('id', firstChunk.id);
                                    }
                                    console.log(`[Message Rating] Document updated with ML AI flag: ${firstChunk.id} (AI suggested ID: ${edit.documentId})`);
                                }
                            } else {
                                console.error(`[Message Rating] Error updating document ${firstChunk.id}:`, updateError);
                            }
                        } else {
                            // Document not found by ID, try to find by content similarity
                            // For now, we'll create a new document entry
                            console.log(`[Message Rating] Document ${edit.documentId} not found, skipping update`);
                        }
                    } catch (error) {
                        console.error(`[Message Rating] Error updating document ${edit.documentId}:`, error);
                    }
                }
            }
        }

        // Apply rule edits
        if (parsedResponse.ruleEdits && Array.isArray(parsedResponse.ruleEdits) && parsedResponse.ruleEdits.length > 0) {
            console.log('[Message Rating] Processing rule edits...');
            for (const edit of parsedResponse.ruleEdits) {
                try {
                    if (edit.action === 'add') {
                        console.log('[Message Rating] Adding new rule:', edit.rule?.substring(0, 50));
                        const { data: newRule, error: ruleError } = await supabase
                            .from('bot_rules')
                            .insert({
                                rule: edit.rule,
                                priority: edit.priority || 5,
                            })
                            .select()
                            .single();
                        if (!ruleError && newRule) {
                            modifiedRules.push(newRule.id);
                            console.log(`[Message Rating] Rule added: ${newRule.id}`);
                        } else {
                            console.error('[Message Rating] Error adding rule:', ruleError);
                        }
                    } else if (edit.action === 'update' && edit.ruleId) {
                        if (!isValidUuid(edit.ruleId)) {
                            console.warn(`[Message Rating] Skipping rule update because ruleId is not a UUID: ${edit.ruleId}`);
                            continue;
                        }
                        console.log(`[Message Rating] Updating rule: ${edit.ruleId}`);
                        const { error: updateError } = await supabase
                            .from('bot_rules')
                            .update({ rule: edit.rule, priority: edit.priority || 5 })
                            .eq('id', edit.ruleId);

                        if (!updateError) {
                            modifiedRules.push(edit.ruleId);
                            console.log(`[Message Rating] Rule updated: ${edit.ruleId}`);
                        } else {
                            console.error(`[Message Rating] Error updating rule ${edit.ruleId}:`, updateError);
                        }
                    }
                } catch (error) {
                    console.error(`[Message Rating] Error processing rule edit:`, error);
                }
            }
        }

        // Apply instruction edits
        if (parsedResponse.instructionEdits && parsedResponse.instructionEdits.newInstructions) {
            console.log('[Message Rating] Processing instruction edits...');
            try {
                const { data: existing, error: findError } = await supabase
                    .from('bot_instructions')
                    .select('id')
                    .limit(1)
                    .single();

                if (findError && findError.code !== 'PGRST116') {
                    console.error('[Message Rating] Error finding instructions:', findError);
                }

                if (existing) {
                    console.log('[Message Rating] Updating existing instructions');
                    const { error: updateError } = await supabase
                        .from('bot_instructions')
                        .update({ instructions: parsedResponse.instructionEdits.newInstructions })
                        .eq('id', existing.id);

                    if (!updateError) {
                        modifiedInstructions = true;
                        console.log('[Message Rating] âœ… Instructions updated');
                    } else {
                        console.error('[Message Rating] Error updating instructions:', updateError);
                    }
                } else {
                    console.log('[Message Rating] Creating new instructions');
                    const { error: insertError } = await supabase
                        .from('bot_instructions')
                        .insert({ instructions: parsedResponse.instructionEdits.newInstructions });

                    if (!insertError) {
                        modifiedInstructions = true;
                        console.log('[Message Rating] âœ… Instructions created');
                    } else {
                        console.error('[Message Rating] Error creating instructions:', insertError);
                    }
                }
            } catch (error) {
                console.error('[Message Rating] Error updating instructions:', error);
            }
        }

        const result = {
            applied: modifiedDocuments.length > 0 || modifiedRules.length > 0 || modifiedInstructions || savedLikedMessageId !== null,
            modifiedDocuments: savedLikedMessageId ? [...modifiedDocuments, savedLikedMessageId] : modifiedDocuments,
            modifiedRules,
            modifiedInstructions,
        };

        console.log('[Message Rating] Improvement summary:', result);
        return result;
    } catch (error) {
        console.error('[Message Rating] Error in analyzeAndImprove:', error);
        return null;
    }
}
