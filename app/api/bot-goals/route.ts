import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - Fetch all bot goals
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('bot_goals')
            .select('*')
            .order('priority_order', { ascending: true }); // NULL values will appear last (default PostgreSQL behavior)

        if (error) {
            console.error('Error fetching bot goals:', error);
            return NextResponse.json({ error: 'Failed to fetch bot goals' }, { status: 500 });
        }

        return NextResponse.json({ goals: data || [] });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create a new bot goal
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { goalName, goalDescription, priorityOrder, isActive, isOptional, stopOnCompletion } = body;

        if (!goalName || goalName.trim() === '') {
            return NextResponse.json({ error: 'Goal name is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('bot_goals')
            .insert({
                goal_name: goalName.trim(),
                goal_description: goalDescription?.trim() || null,
                priority_order: priorityOrder !== undefined && priorityOrder !== null ? parseInt(String(priorityOrder), 10) : null,
                is_active: isActive !== undefined ? Boolean(isActive) : true,
                is_optional: isOptional !== undefined ? Boolean(isOptional) : false,
                stop_on_completion: stopOnCompletion !== undefined ? Boolean(stopOnCompletion) : false,
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating bot goal:', error);
            return NextResponse.json({ error: 'Failed to create bot goal', details: error.message }, { status: 500 });
        }

        return NextResponse.json({ goal: data, success: true });
    } catch (error: any) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error?.message }, { status: 500 });
    }
}

// PUT - Update a bot goal
export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, goalName, goalDescription, priorityOrder, isActive, isOptional, stopOnCompletion } = body;

        if (!id) {
            return NextResponse.json({ error: 'Goal ID is required' }, { status: 400 });
        }

        const updates: Record<string, any> = {};
        if (goalName !== undefined) updates.goal_name = goalName.trim();
        if (goalDescription !== undefined) updates.goal_description = goalDescription?.trim() || null;
        if (priorityOrder !== undefined) {
            updates.priority_order = priorityOrder !== null && priorityOrder !== '' ? parseInt(String(priorityOrder), 10) : null;
        }
        if (isActive !== undefined) updates.is_active = Boolean(isActive);
        if (isOptional !== undefined) updates.is_optional = Boolean(isOptional);
        if (stopOnCompletion !== undefined) updates.stop_on_completion = Boolean(stopOnCompletion);

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('bot_goals')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating bot goal:', error);
            return NextResponse.json({ error: 'Failed to update bot goal', details: error.message }, { status: 500 });
        }

        return NextResponse.json({ goal: data, success: true });
    } catch (error: any) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error?.message }, { status: 500 });
    }
}

// DELETE - Delete a bot goal
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Goal ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('bot_goals')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting bot goal:', error);
            return NextResponse.json({ error: 'Failed to delete bot goal', details: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error?.message }, { status: 500 });
    }
}



