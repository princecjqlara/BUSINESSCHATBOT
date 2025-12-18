/**
 * ML Sandbox Rules API
 * CRUD operations for sandbox bot rules
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - Fetch sandbox rules
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const category = searchParams.get('category');
        const enabled = searchParams.get('enabled');

        let query = supabase
            .from('ml_sandbox_bot_rules')
            .select('*')
            .order('priority', { ascending: true });

        if (category) {
            query = query.eq('category', category);
        }
        if (enabled !== null) {
            query = query.eq('enabled', enabled === 'true');
        }

        const { data, error } = await query;

        if (error) {
            console.error('[ML Sandbox Rules] GET Error:', error);
            return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
        }

        return NextResponse.json({ rules: data || [] });
    } catch (error) {
        console.error('[ML Sandbox Rules] GET Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create sandbox rule
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { rule, category, priority, enabled } = body;

        if (!rule) {
            return NextResponse.json({ error: 'Rule content is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('ml_sandbox_bot_rules')
            .insert({
                rule,
                category: category || 'general',
                priority: priority || 5,
                enabled: enabled !== false,
            })
            .select()
            .single();

        if (error) {
            console.error('[ML Sandbox Rules] POST Error:', error);
            return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
        }

        return NextResponse.json({ rule: data, message: 'Rule created' });
    } catch (error) {
        console.error('[ML Sandbox Rules] POST Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PUT - Update sandbox rule
export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, rule, category, priority, enabled } = body;

        if (!id) {
            return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 });
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (rule !== undefined) updates.rule = rule;
        if (category !== undefined) updates.category = category;
        if (priority !== undefined) updates.priority = priority;
        if (enabled !== undefined) updates.enabled = enabled;

        const { data, error } = await supabase
            .from('ml_sandbox_bot_rules')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[ML Sandbox Rules] PUT Error:', error);
            return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
        }

        return NextResponse.json({ rule: data, message: 'Rule updated' });
    } catch (error) {
        console.error('[ML Sandbox Rules] PUT Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Delete sandbox rule
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('ml_sandbox_bot_rules')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[ML Sandbox Rules] DELETE Error:', error);
            return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Rule deleted' });
    } catch (error) {
        console.error('[ML Sandbox Rules] DELETE Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
