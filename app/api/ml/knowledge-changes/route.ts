/**
 * ML Knowledge Changes API
 * Get recent AI edits and manage undo functionality
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - Get recent AI knowledge changes (last 3)
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '3');
        const entityType = searchParams.get('entityType'); // Optional filter

        let query = supabase
            .from('ml_knowledge_changes')
            .select('*')
            .eq('undone', false)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (entityType) {
            query = query.eq('entity_type', entityType);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[ML Knowledge] Error fetching changes:', error);
            return NextResponse.json(
                { error: 'Failed to fetch changes' },
                { status: 500 }
            );
        }

        return NextResponse.json({ changes: data || [] });
    } catch (error) {
        console.error('[ML Knowledge] Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// POST - Undo a knowledge change
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { changeId } = body;

        if (!changeId) {
            return NextResponse.json(
                { error: 'changeId is required' },
                { status: 400 }
            );
        }

        // Get the change record
        const { data: change, error: fetchError } = await supabase
            .from('ml_knowledge_changes')
            .select('*')
            .eq('id', changeId)
            .single();

        if (fetchError || !change) {
            return NextResponse.json(
                { error: 'Change not found' },
                { status: 404 }
            );
        }

        if (change.undone) {
            return NextResponse.json(
                { error: 'Change already undone' },
                { status: 400 }
            );
        }

        // Restore old value based on entity type
        let restoreError = null;

        switch (change.entity_type) {
            case 'document':
                if (change.change_type === 'delete' && change.entity_id) {
                    // Can't restore deleted document, mark as undone
                    restoreError = 'Cannot restore deleted document';
                } else if (change.change_type === 'update' && change.entity_id && change.old_value) {
                    const { error } = await supabase
                        .from('documents')
                        .update({
                            content: change.old_value.content || change.old_value,
                            metadata: change.old_value.metadata || {},
                        })
                        .eq('id', change.entity_id);
                    restoreError = error;
                } else if (change.change_type === 'add' && change.entity_id) {
                    // Delete the added document
                    const { error } = await supabase
                        .from('documents')
                        .delete()
                        .eq('id', change.entity_id);
                    restoreError = error;
                }
                break;

            case 'rule':
                if (change.change_type === 'delete' && change.entity_id) {
                    // Restore deleted rule
                    if (change.old_value) {
                        const { error } = await supabase
                            .from('bot_rules')
                            .insert({
                                id: change.entity_id,
                                rule: change.old_value.rule || change.old_value,
                                category: change.old_value.category || 'general',
                                priority: change.old_value.priority || 5,
                                enabled: change.old_value.enabled ?? true,
                            });
                        restoreError = error;
                    }
                } else if (change.change_type === 'update' && change.entity_id && change.old_value) {
                    const { error } = await supabase
                        .from('bot_rules')
                        .update({
                            rule: change.old_value.rule || change.old_value,
                            category: change.old_value.category,
                            priority: change.old_value.priority,
                        })
                        .eq('id', change.entity_id);
                    restoreError = error;
                } else if (change.change_type === 'add' && change.entity_id) {
                    // Delete the added rule
                    const { error } = await supabase
                        .from('bot_rules')
                        .delete()
                        .eq('id', change.entity_id);
                    restoreError = error;
                }
                break;

            case 'instruction':
                // Get current instructions
                const { data: current } = await supabase
                    .from('bot_settings')
                    .select('bot_instructions')
                    .limit(1)
                    .single();

                if (change.old_value) {
                    const { error } = await supabase
                        .from('bot_settings')
                        .update({ bot_instructions: change.old_value })
                        .limit(1);
                    restoreError = error;
                }
                break;

            case 'personality':
                if (change.old_value) {
                    const updates: Record<string, any> = {};
                    if (change.old_value.botTone) updates.bot_tone = change.old_value.botTone;
                    if (change.old_value.botName) updates.bot_name = change.old_value.botName;

                    if (Object.keys(updates).length > 0) {
                        const { error } = await supabase
                            .from('bot_settings')
                            .update(updates)
                            .limit(1);
                        restoreError = error;
                    }
                }
                break;
        }

        if (restoreError) {
            console.error('[ML Knowledge] Error restoring change:', restoreError);
            return NextResponse.json(
                { error: 'Failed to restore change' },
                { status: 500 }
            );
        }

        // Mark change as undone
        const { error: updateError } = await supabase
            .from('ml_knowledge_changes')
            .update({ undone: true })
            .eq('id', changeId);

        if (updateError) {
            console.error('[ML Knowledge] Error marking as undone:', updateError);
        }

        return NextResponse.json({
            success: true,
            message: 'Change undone successfully',
        });
    } catch (error) {
        console.error('[ML Knowledge] Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

