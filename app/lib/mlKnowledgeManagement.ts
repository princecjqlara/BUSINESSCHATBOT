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
    changeType: 'add' | 'update' | 'delete';
    entityType: 'document' | 'rule' | 'instruction' | 'personality';
    entityId?: string;
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
        const analysisPrompt = `You are an AI assistant analyzing conversation patterns to improve the knowledge base.

Conversation History:
${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Failed Queries (questions that couldn't be answered well):
${failedQueries.join('\n')}

Based on this analysis, suggest knowledge base improvements:
1. What information is missing?
2. What rules should be added or updated?
3. What instructions would help the bot respond better?

Respond in JSON format with an array of suggested changes:
[
  {
    "changeType": "add|update|delete",
    "entityType": "document|rule|instruction|personality",
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

        const parsed = JSON.parse(content);
        const suggestions = parsed.suggestions || parsed.changes || [];

        // Filter by confidence
        return suggestions.filter((s: KnowledgeChange) => s.confidenceScore > 0.7);
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
                return await applyDocumentChange(change);
            case 'rule':
                return await applyRuleChange(change);
            case 'instruction':
                return await applyInstructionChange(change);
            case 'personality':
                return await applyPersonalityChange(change);
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

