/**
 * AI Knowledge Base Management Service
 * Allows the AI to automatically add, remove, and edit its own knowledge base
 */

import { supabase } from './supabase';
import OpenAI from 'openai';

// Use best available NVIDIA model for ML/analysis tasks
// Try largest models first for best analysis quality
const ML_MODELS = [
    'meta/llama-3.1-405b-instruct',  // Best for analysis (if available)
    'qwen/qwen3-235b-a22b',          // Excellent for reasoning
    'meta/llama-3.1-70b-instruct',   // Fallback
];

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

/**
 * Get the best available model for ML tasks
 */
export async function getBestMLModel(): Promise<string> {
    for (const model of ML_MODELS) {
        try {
            // Test if model is available
            await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1,
            });
            console.log(`[ML Knowledge] Using model: ${model}`);
            return model;
        } catch (error) {
            // Model not available, try next
            continue;
        }
    }
    // Fallback to default
    console.log(`[ML Knowledge] Using fallback model: ${ML_MODELS[ML_MODELS.length - 1]}`);
    return ML_MODELS[ML_MODELS.length - 1];
}

export interface KnowledgeChange {
    changeType: 'add' | 'update' | 'delete' | 'merge'; // Added 'merge' for combining documents
    entityType: 'document' | 'rule' | 'instruction' | 'personality' | 'goal' | 'conversationFlow' | 'category';
    entityId?: string;
    mergeSourceIds?: string[]; // For merge operations - IDs of documents to merge
    oldValue?: any;
    newValue?: any;
    reason: string;
    confidenceScore: number;
}

/**
 * Analyze conversation patterns to identify knowledge gaps or improvements
 */
export async function analyzeKnowledgeGaps(
    conversationHistory: Array<{ role: string; content: string }>,
    failedQueries: string[] = []
): Promise<KnowledgeChange[]> {
    try {
        const analysisPrompt = `You are an AI assistant analyzing conversation patterns to improve the knowledge base and bot configuration.

Conversation History:
${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Failed Queries (questions that couldn't be answered well):
${failedQueries.join('\n')}

Based on this analysis, suggest improvements in these areas:

1. DOCUMENTS - Knowledge base content:
   - Missing information that should be added
   - Documents with similar content that should be merged
   - Outdated content that should be updated or deleted
   - Documents that need proper categorization

2. CATEGORIES - Document organization:
   - New categories needed to organize documents
   - Categories that are empty and should be deleted

3. RULES - Bot behavior rules:
   - New rules based on conversation patterns
   - Rules that need updating
   - Rules that are no longer relevant

4. GOALS - Bot conversation goals:
   - New goals based on what customers are trying to achieve
   - Goals that need priority adjustment

5. CONVERSATION FLOW - Response structure:
   - Improvements to conversation flow steps

6. PERSONALITY - Bot tone and style:
   - Tone adjustments based on customer interactions

Respond in JSON format with an array of suggested changes:
[
  {
    "changeType": "add|update|delete|merge",
    "entityType": "document|rule|instruction|personality|goal|conversationFlow|category",
    "entityId": "id-if-updating-existing",
    "mergeSourceIds": ["id1", "id2"] // only for merge operations
    "newValue": { ... },
    "reason": "why this change helps",
    "confidenceScore": 0.0-1.0
  }
]

Only suggest high-confidence changes (confidenceScore > 0.7).`;

        // Use best available model for ML analysis
        const bestModel = await getBestMLModel();

        const response = await client.chat.completions.create({
            model: bestModel,
            messages: [{ role: 'user', content: analysisPrompt }],
            temperature: 0.2, // Lower temperature for more focused analysis
            top_p: 0.9,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) return [];

        // Try to extract JSON from response - AI might return prose with embedded JSON
        let jsonContent = content.trim();

        // Remove markdown code blocks if present
        jsonContent = jsonContent
            .replace(/```json\n?/gi, '')
            .replace(/```\n?/gi, '')
            .trim();

        // Try to find JSON array or object in response
        const arrayMatch = jsonContent.match(/\[[\s\S]*\]/);
        const objectMatch = jsonContent.match(/\{[\s\S]*\}/);

        if (arrayMatch) {
            jsonContent = arrayMatch[0];
        } else if (objectMatch) {
            jsonContent = objectMatch[0];
        } else {
            // No valid JSON found
            console.log('[ML Knowledge] Response was not JSON, skipping:', jsonContent.substring(0, 50));
            return [];
        }

        try {
            const parsed = JSON.parse(jsonContent);
            const suggestions = Array.isArray(parsed) ? parsed : (parsed.suggestions || parsed.changes || []);

            // Filter by confidence
            return suggestions.filter((s: KnowledgeChange) => s.confidenceScore > 0.7);
        } catch (parseError) {
            console.error('[ML Knowledge] JSON parse error:', parseError);
            return [];
        }
    } catch (error) {
        console.error('[ML Knowledge] Error analyzing knowledge gaps:', error);
        return [];
    }
}

/**
 * Apply knowledge changes (with safety checks)
 */
export async function applyKnowledgeChange(change: KnowledgeChange, autoApprove: boolean = false): Promise<boolean> {
    try {
        // Get best model for tracking
        const bestModel = await getBestMLModel();

        // Store change in audit log
        const { data: changeRecord, error: logError } = await supabase
            .from('ml_knowledge_changes')
            .insert({
                change_type: change.changeType,
                entity_type: change.entityType,
                entity_id: change.entityId || null,
                old_value: change.oldValue || null,
                new_value: change.newValue || null,
                reason: change.reason,
                confidence_score: change.confidenceScore,
                approved: autoApprove,
                applied: autoApprove,
                model_used: bestModel,
            })
            .select()
            .single();

        if (logError) {
            console.error('[ML Knowledge] Error logging change:', logError);
            return false;
        }

        // If not auto-approved, wait for manual approval
        if (!autoApprove) {
            console.log('[ML Knowledge] Change logged, waiting for approval:', changeRecord.id);
            return false;
        }

        // Apply the change based on entity type
        switch (change.entityType) {
            case 'document':
                // Handle merge operation for documents
                if (change.changeType === 'merge') {
                    return await applyDocumentMerge(change);
                }
                return await applyDocumentChange(change);
            case 'rule':
                return await applyRuleChange(change);
            case 'instruction':
                return await applyInstructionChange(change);
            case 'personality':
                return await applyPersonalityChange(change);
            case 'goal':
                return await applyGoalChange(change);
            case 'conversationFlow':
                return await applyConversationFlowChange(change);
            case 'category':
                return await applyCategoryChange(change);
            default:
                console.error('[ML Knowledge] Unknown entity type:', change.entityType);
                return false;
        }
    } catch (error) {
        console.error('[ML Knowledge] Error applying change:', error);
        return false;
    }
}

/**
 * Apply document change
 */
async function applyDocumentChange(change: KnowledgeChange): Promise<boolean> {
    try {
        // Get current value before change for undo capability
        let oldValueSnapshot: any = null;
        if (change.entityId) {
            const { data: current } = await supabase
                .from('documents')
                .select('*')
                .eq('id', change.entityId)
                .single();
            if (current) {
                oldValueSnapshot = {
                    content: current.content,
                    metadata: current.metadata,
                    categoryId: current.category_id,
                };
            }
        }

        if (change.changeType === 'add' && change.newValue) {
            const { data: inserted, error } = await supabase
                .from('documents')
                .insert({
                    content: change.newValue.content || change.newValue,
                    metadata: change.newValue.metadata || {},
                    category_id: change.newValue.categoryId || null,
                    edited_by_ai: true,
                    last_ai_edit_at: new Date().toISOString(),
                })
                .select()
                .single();

            // Update change record with entity ID
            if (inserted && change.entityId === undefined) {
                await supabase
                    .from('ml_knowledge_changes')
                    .update({ entity_id: inserted.id })
                    .eq('id', change.entityId);
            }
            return !error;
        } else if (change.changeType === 'update' && change.entityId && change.newValue) {
            // Ensure old_value is stored
            if (!change.oldValue && oldValueSnapshot) {
                await supabase
                    .from('ml_knowledge_changes')
                    .update({ old_value: oldValueSnapshot })
                    .eq('id', change.entityId);
            }

            const { error } = await supabase
                .from('documents')
                .update({
                    content: change.newValue.content || change.newValue,
                    metadata: change.newValue.metadata || {},
                    edited_by_ai: true,
                    last_ai_edit_at: new Date().toISOString(),
                })
                .eq('id', change.entityId);
            return !error;
        } else if (change.changeType === 'delete' && change.entityId) {
            const { error } = await supabase
                .from('documents')
                .delete()
                .eq('id', change.entityId);
            return !error;
        }
        return false;
    } catch (error) {
        console.error('[ML Knowledge] Error applying document change:', error);
        return false;
    }
}

/**
 * Apply rule change
 */
async function applyRuleChange(change: KnowledgeChange): Promise<boolean> {
    try {
        // Get current value before change for undo capability
        let oldValueSnapshot: any = null;
        if (change.entityId) {
            const { data: current } = await supabase
                .from('bot_rules')
                .select('*')
                .eq('id', change.entityId)
                .single();
            if (current) {
                oldValueSnapshot = {
                    rule: current.rule,
                    category: current.category,
                    priority: current.priority,
                    enabled: current.enabled,
                };
            }
        }

        if (change.changeType === 'add' && change.newValue) {
            const { data: inserted, error } = await supabase
                .from('bot_rules')
                .insert({
                    rule: change.newValue.rule || change.newValue,
                    category: change.newValue.category || 'general',
                    priority: change.newValue.priority || 5,
                    enabled: true,
                    edited_by_ai: true,
                    last_ai_edit_at: new Date().toISOString(),
                })
                .select()
                .single();

            // Update change record with entity ID
            if (inserted && change.entityId === undefined) {
                await supabase
                    .from('ml_knowledge_changes')
                    .update({ entity_id: inserted.id })
                    .eq('id', change.entityId);
            }
            return !error;
        } else if (change.changeType === 'update' && change.entityId && change.newValue) {
            // Ensure old_value is stored
            if (!change.oldValue && oldValueSnapshot) {
                await supabase
                    .from('ml_knowledge_changes')
                    .update({ old_value: oldValueSnapshot })
                    .eq('id', change.entityId);
            }

            const { error } = await supabase
                .from('bot_rules')
                .update({
                    rule: change.newValue.rule || change.newValue,
                    category: change.newValue.category,
                    priority: change.newValue.priority,
                    edited_by_ai: true,
                    last_ai_edit_at: new Date().toISOString(),
                })
                .eq('id', change.entityId);
            return !error;
        } else if (change.changeType === 'delete' && change.entityId) {
            const { error } = await supabase
                .from('bot_rules')
                .delete()
                .eq('id', change.entityId);
            return !error;
        }
        return false;
    } catch (error) {
        console.error('[ML Knowledge] Error applying rule change:', error);
        return false;
    }
}

/**
 * Apply instruction change
 */
async function applyInstructionChange(change: KnowledgeChange): Promise<boolean> {
    try {
        // Get current instructions
        const { data: current } = await supabase
            .from('bot_settings')
            .select('bot_instructions')
            .limit(1)
            .single();

        let newInstructions = '';
        if (change.changeType === 'add' || change.changeType === 'update') {
            const currentText = current?.bot_instructions || '';
            newInstructions = change.changeType === 'add'
                ? `${currentText}\n\n${change.newValue}`
                : change.newValue;
        } else if (change.changeType === 'delete' && change.oldValue) {
            const currentText = current?.bot_instructions || '';
            newInstructions = currentText.replace(change.oldValue, '').trim();
        }

        const { error } = await supabase
            .from('bot_settings')
            .update({ bot_instructions: newInstructions })
            .limit(1);

        return !error;
    } catch (error) {
        console.error('[ML Knowledge] Error applying instruction change:', error);
        return false;
    }
}

/**
 * Apply personality change (bot tone/name)
 */
async function applyPersonalityChange(change: KnowledgeChange): Promise<boolean> {
    try {
        const updates: Record<string, any> = {};

        if (change.newValue?.botTone) {
            updates.bot_tone = change.newValue.botTone;
        }
        if (change.newValue?.botName) {
            updates.bot_name = change.newValue.botName;
        }

        if (Object.keys(updates).length === 0) return false;

        const { error } = await supabase
            .from('bot_settings')
            .update(updates)
            .limit(1);

        return !error;
    } catch (error) {
        console.error('[ML Knowledge] Error applying personality change:', error);
        return false;
    }
}

/**
 * Apply goal change (bot goals CRUD)
 */
async function applyGoalChange(change: KnowledgeChange): Promise<boolean> {
    try {
        if (change.changeType === 'add' && change.newValue) {
            const { error } = await supabase
                .from('bot_goals')
                .insert({
                    goal_name: change.newValue.goalName || change.newValue.name || change.newValue,
                    goal_description: change.newValue.goalDescription || change.newValue.description || '',
                    priority_order: change.newValue.priorityOrder || null,
                    is_active: true,
                    is_optional: change.newValue.isOptional || false,
                    stop_on_completion: change.newValue.stopOnCompletion || false,
                });
            console.log('[ML Knowledge] Created new bot goal:', change.newValue.goalName || change.newValue);
            return !error;
        } else if (change.changeType === 'update' && change.entityId && change.newValue) {
            const updates: Record<string, any> = {};
            if (change.newValue.goalName) updates.goal_name = change.newValue.goalName;
            if (change.newValue.goalDescription !== undefined) updates.goal_description = change.newValue.goalDescription;
            if (change.newValue.priorityOrder !== undefined) updates.priority_order = change.newValue.priorityOrder;
            if (change.newValue.isActive !== undefined) updates.is_active = change.newValue.isActive;
            if (change.newValue.isOptional !== undefined) updates.is_optional = change.newValue.isOptional;
            if (change.newValue.stopOnCompletion !== undefined) updates.stop_on_completion = change.newValue.stopOnCompletion;

            const { error } = await supabase
                .from('bot_goals')
                .update(updates)
                .eq('id', change.entityId);
            console.log('[ML Knowledge] Updated bot goal:', change.entityId);
            return !error;
        } else if (change.changeType === 'delete' && change.entityId) {
            const { error } = await supabase
                .from('bot_goals')
                .delete()
                .eq('id', change.entityId);
            console.log('[ML Knowledge] Deleted bot goal:', change.entityId);
            return !error;
        }
        return false;
    } catch (error) {
        console.error('[ML Knowledge] Error applying goal change:', error);
        return false;
    }
}

/**
 * Apply conversation flow change (updates bot_settings.conversation_flow)
 */
async function applyConversationFlowChange(change: KnowledgeChange): Promise<boolean> {
    try {
        if (change.changeType === 'update' && change.newValue) {
            const { error } = await supabase
                .from('bot_settings')
                .update({
                    conversation_flow: change.newValue.flow || change.newValue
                })
                .limit(1);
            console.log('[ML Knowledge] Updated conversation flow');
            return !error;
        }
        return false;
    } catch (error) {
        console.error('[ML Knowledge] Error applying conversation flow change:', error);
        return false;
    }
}

/**
 * Apply category change (knowledge categories CRUD)
 */
async function applyCategoryChange(change: KnowledgeChange): Promise<boolean> {
    try {
        if (change.changeType === 'add' && change.newValue) {
            const { data, error } = await supabase
                .from('knowledge_categories')
                .insert({
                    name: change.newValue.name || change.newValue,
                    type: change.newValue.type || 'general',
                    color: change.newValue.color || 'gray',
                })
                .select()
                .single();
            console.log('[ML Knowledge] Created new category:', data?.name);
            return !error;
        } else if (change.changeType === 'delete' && change.entityId) {
            // First, move documents in this category to uncategorized (null)
            await supabase
                .from('documents')
                .update({ category_id: null })
                .eq('category_id', change.entityId);

            const { error } = await supabase
                .from('knowledge_categories')
                .delete()
                .eq('id', change.entityId);
            console.log('[ML Knowledge] Deleted category:', change.entityId);
            return !error;
        }
        return false;
    } catch (error) {
        console.error('[ML Knowledge] Error applying category change:', error);
        return false;
    }
}

/**
 * Apply document merge (combine multiple documents into one)
 */
async function applyDocumentMerge(change: KnowledgeChange): Promise<boolean> {
    try {
        if (!change.mergeSourceIds || change.mergeSourceIds.length < 2) {
            console.error('[ML Knowledge] Merge requires at least 2 source document IDs');
            return false;
        }

        // Fetch all source documents
        const { data: sourceDocuments, error: fetchError } = await supabase
            .from('documents')
            .select('*')
            .in('id', change.mergeSourceIds);

        if (fetchError || !sourceDocuments || sourceDocuments.length < 2) {
            console.error('[ML Knowledge] Failed to fetch source documents for merge');
            return false;
        }

        // Combine content from all documents
        const mergedContent = sourceDocuments
            .map((doc: { content: string }) => doc.content)
            .join('\n\n---\n\n');

        // Use the first document's category, or the specified one
        const categoryId = change.newValue?.categoryId || sourceDocuments[0].category_id;

        // Create the merged document
        const { data: newDoc, error: insertError } = await supabase
            .from('documents')
            .insert({
                content: mergedContent,
                metadata: {
                    merged_from: change.mergeSourceIds,
                    merged_at: new Date().toISOString(),
                    original_count: sourceDocuments.length,
                },
                category_id: categoryId,
                edited_by_ai: true,
                last_ai_edit_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (insertError || !newDoc) {
            console.error('[ML Knowledge] Failed to create merged document');
            return false;
        }

        // Delete the source documents
        const { error: deleteError } = await supabase
            .from('documents')
            .delete()
            .in('id', change.mergeSourceIds);

        if (deleteError) {
            console.error('[ML Knowledge] Warning: merged document created but failed to delete sources');
        }

        console.log(`[ML Knowledge] Merged ${sourceDocuments.length} documents into ${newDoc.id}`);
        return true;
    } catch (error) {
        console.error('[ML Knowledge] Error applying document merge:', error);
        return false;
    }
}

/**
 * Process knowledge improvements after a conversation
 */
export async function processKnowledgeImprovements(
    senderId: string,
    conversationHistory: Array<{ role: string; content: string }>,
    failedQueries: string[] = []
): Promise<void> {
    try {
        // Analyze for knowledge gaps
        const suggestions = await analyzeKnowledgeGaps(conversationHistory, failedQueries);

        // Apply high-confidence changes automatically
        for (const suggestion of suggestions) {
            if (suggestion.confidenceScore > 0.8) {
                await applyKnowledgeChange(suggestion, true);
                console.log(`[ML Knowledge] Auto-applied change: ${suggestion.changeType} ${suggestion.entityType}`);
            } else {
                // Log for manual review
                await applyKnowledgeChange(suggestion, false);
                console.log(`[ML Knowledge] Change logged for review: ${suggestion.changeType} ${suggestion.entityType}`);
            }
        }
    } catch (error) {
        console.error('[ML Knowledge] Error processing improvements:', error);
    }
}
