/**
 * ML Sandbox Goals API
 * CRUD operations for sandbox bot goals
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - Fetch sandbox goals
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('ml_sandbox_bot_goals')
            .select('*')
            .order('priority_order', { ascending: true });

        if (error) {
            console.error('[ML Sandbox Goals] GET Error:', error);
            return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
        }

        return NextResponse.json({ goals: data || [] });
    } catch (error) {
        console.error('[ML Sandbox Goals] GET Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create sandbox goal
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { goalName, goalDescription, priorityOrder, isActive, isOptional, stopOnCompletion } = body;

        if (!goalName) {
            return NextResponse.json({ error: 'Goal name is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('ml_sandbox_bot_goals')
            .insert({
                goal_name: goalName,
                goal_description: goalDescription || '',
                priority_order: priorityOrder || null,
                is_active: isActive !== false,
                is_optional: isOptional || false,
                stop_on_completion: stopOnCompletion || false,
            })
            .select()
            .single();

        if (error) {
            console.error('[ML Sandbox Goals] POST Error:', error);
            return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
        }

        return NextResponse.json({ goal: data, message: 'Goal created' });
    } catch (error) {
        console.error('[ML Sandbox Goals] POST Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PUT - Update sandbox goal
export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, goalName, goalDescription, priorityOrder, isActive, isOptional, stopOnCompletion } = body;

        if (!id) {
            return NextResponse.json({ error: 'Goal ID is required' }, { status: 400 });
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (goalName !== undefined) updates.goal_name = goalName;
        if (goalDescription !== undefined) updates.goal_description = goalDescription;
        if (priorityOrder !== undefined) updates.priority_order = priorityOrder;
        if (isActive !== undefined) updates.is_active = isActive;
        if (isOptional !== undefined) updates.is_optional = isOptional;
        if (stopOnCompletion !== undefined) updates.stop_on_completion = stopOnCompletion;

        const { data, error } = await supabase
            .from('ml_sandbox_bot_goals')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[ML Sandbox Goals] PUT Error:', error);
            return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 });
        }

        return NextResponse.json({ goal: data, message: 'Goal updated' });
    } catch (error) {
        console.error('[ML Sandbox Goals] PUT Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Delete sandbox goal
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Goal ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('ml_sandbox_bot_goals')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[ML Sandbox Goals] DELETE Error:', error);
            return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Goal deleted' });
    } catch (error) {
        console.error('[ML Sandbox Goals] DELETE Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
