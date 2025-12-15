import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - Fetch goal completions for a lead
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const leadId = searchParams.get('leadId');
        const senderId = searchParams.get('senderId');

        if (!leadId && !senderId) {
            return NextResponse.json({ error: 'Either leadId or senderId is required' }, { status: 400 });
        }

        let query = supabase
            .from('lead_goal_completions')
            .select(`
                *,
                bot_goals (
                    id,
                    goal_name,
                    goal_description,
                    priority_order
                )
            `)
            .order('completed_at', { ascending: false });

        if (leadId) {
            query = query.eq('lead_id', leadId);
        } else if (senderId) {
            query = query.eq('sender_id', senderId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching goal completions:', error);
            return NextResponse.json({ error: 'Failed to fetch goal completions' }, { status: 500 });
        }

        return NextResponse.json({ completions: data || [] });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Record a goal completion
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { leadId, goalId, senderId, completionContext } = body;

        if (!goalId) {
            return NextResponse.json({ error: 'Goal ID is required' }, { status: 400 });
        }

        if (!leadId && !senderId) {
            return NextResponse.json({ error: 'Either leadId or senderId is required' }, { status: 400 });
        }

        // If only senderId is provided, try to find the lead
        let finalLeadId = leadId;
        if (!finalLeadId && senderId) {
            const { data: lead } = await supabase
                .from('leads')
                .select('id')
                .eq('sender_id', senderId)
                .single();
            
            if (lead) {
                finalLeadId = lead.id;
            }
        }

        const insertData: Record<string, any> = {
            goal_id: goalId,
            completion_context: completionContext?.trim() || null,
        };

        if (finalLeadId) {
            insertData.lead_id = finalLeadId;
        }
        if (senderId) {
            insertData.sender_id = senderId;
        }

        const { data, error } = await supabase
            .from('lead_goal_completions')
            .insert(insertData)
            .select(`
                *,
                bot_goals (
                    id,
                    goal_name,
                    goal_description,
                    priority_order
                )
            `)
            .single();

        if (error) {
            // If it's a unique constraint violation, the goal was already completed
            if (error.code === '23505') {
                return NextResponse.json({ 
                    error: 'Goal already completed for this lead',
                    alreadyCompleted: true 
                }, { status: 409 });
            }
            console.error('Error recording goal completion:', error);
            return NextResponse.json({ error: 'Failed to record goal completion', details: error.message }, { status: 500 });
        }

        return NextResponse.json({ completion: data, success: true });
    } catch (error: any) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error?.message }, { status: 500 });
    }
}


