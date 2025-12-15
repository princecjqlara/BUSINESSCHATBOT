import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { computeBestContactTimes, storeBestContactTimes, getBestContactTimes } from '@/app/lib/bestContactTimesService';

// GET - Get best contact times for a lead
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { data: lead, error } = await supabase
            .from('leads')
            .select('id, sender_id, best_contact_times')
            .eq('id', id)
            .single();

        if (error || !lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        if (lead.best_contact_times) {
            return NextResponse.json({ data: lead.best_contact_times });
        }

        // Compute if not exists
        const bestTimes = await getBestContactTimes(lead.sender_id, lead.id);
        return NextResponse.json({ data: bestTimes });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Compute and update best contact times
export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select('id, sender_id')
            .eq('id', id)
            .single();

        if (leadError || !lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        // Compute best contact times
        const bestTimes = await computeBestContactTimes(lead.sender_id);

        if (!bestTimes) {
            return NextResponse.json({
                success: false,
                error: 'Insufficient message data. Need at least 2 messages to compute best contact times.',
            }, { status: 400 });
        }

        // Store in database
        const stored = await storeBestContactTimes(lead.id, bestTimes);

        if (!stored) {
            return NextResponse.json({ error: 'Failed to store best contact times' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Best contact times computed and stored successfully',
            data: bestTimes,
        });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

