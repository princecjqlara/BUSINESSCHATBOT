import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - Fetch all bot rules
export async function GET() {
    try {
        const { data: rules, error } = await supabase
            .from('bot_rules')
            .select('*, edited_by_ai, last_ai_edit_at')
            .order('priority', { ascending: true });

        if (error) {
            console.error('Error fetching rules:', error);
            return NextResponse.json({ rules: [] });
        }

        // Check which rules were edited by ML AI (from ml_knowledge_changes)
        const ruleIds = rules?.map((rule: any) => rule.id) || [];
        let mlEditedIds: Set<string> = new Set();
        
        if (ruleIds.length > 0 && rules?.some((rule: any) => rule.edited_by_ai)) {
            const { data: mlChanges } = await supabase
                .from('ml_knowledge_changes')
                .select('entity_id')
                .eq('entity_type', 'rule')
                .in('entity_id', ruleIds)
                .eq('undone', false);
            
            if (mlChanges) {
                mlEditedIds = new Set(mlChanges.map((change: any) => String(change.entity_id)));
            }
        }

        // Add edited_by_ml_ai field to each rule
        const rulesWithMlFlag = rules?.map((rule: any) => ({
            ...rule,
            edited_by_ml_ai: mlEditedIds.has(String(rule.id)),
        })) || [];

        return NextResponse.json({ rules: rulesWithMlFlag });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ rules: [] });
    }
}

// POST - Create a new bot rule
export async function POST(req: Request) {
    try {
        const { rule, category, priority, edited_by_ai, last_ai_edit_at } = await req.json();

        if (!rule) {
            return NextResponse.json({ error: 'Rule text is required' }, { status: 400 });
        }

        const insertData: any = {
            rule,
            category: category || 'general',
            priority: priority || 0,
            enabled: true,
        };
        if (edited_by_ai !== undefined) insertData.edited_by_ai = edited_by_ai;
        if (last_ai_edit_at !== undefined) insertData.last_ai_edit_at = last_ai_edit_at;

        const { data, error } = await supabase
            .from('bot_rules')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            console.error('Error creating rule:', error);
            return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
        }

        return NextResponse.json({ success: true, rule: data });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
    }
}

// DELETE - Delete a bot rule
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('bot_rules')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting rule:', error);
            return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
    }
}

// PATCH - Update a bot rule
export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { id, rule, category, priority, enabled, edited_by_ai, last_ai_edit_at } = body;

        if (!id) {
            return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 });
        }

        const updates: any = {};
        if (rule !== undefined) updates.rule = rule;
        if (category !== undefined) updates.category = category;
        if (priority !== undefined) updates.priority = priority;
        if (enabled !== undefined) updates.enabled = enabled;
        // Handle AI edit tracking
        if (edited_by_ai !== undefined) updates.edited_by_ai = edited_by_ai;
        if (last_ai_edit_at !== undefined) updates.last_ai_edit_at = last_ai_edit_at;

        const { data, error } = await supabase
            .from('bot_rules')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating rule:', error);
            return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
        }

        return NextResponse.json({ success: true, rule: data });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
    }
}
