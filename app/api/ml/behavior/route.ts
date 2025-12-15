/**
 * ML Behavior Tracking API
 * Records user behavior events for online learning
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { computeReward, BehaviorEvent } from '@/app/lib/mlRewardEngine';
import { buildContext, recordBehaviorAndLearn } from '@/app/lib/mlOnlineLearning';

// POST - Record a behavior event
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            senderId,
            leadId,
            eventType,
            eventData,
            strategyId,
            conversationId,
            messageId,
        } = body;

        if (!senderId || !eventType) {
            return NextResponse.json(
                { error: 'senderId and eventType are required' },
                { status: 400 }
            );
        }

        // Build context for learning
        const context = await buildContext(senderId, leadId);

        // Create behavior event
        const event: BehaviorEvent = {
            senderId,
            leadId,
            eventType,
            eventData,
            strategyId,
            conversationId,
            messageId,
        };

        // Record and learn
        await recordBehaviorAndLearn(event, context);

        return NextResponse.json({
            success: true,
            message: 'Behavior event recorded and learning updated',
        });
    } catch (error) {
        console.error('[ML Behavior] Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// GET - Get behavior events for a sender
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const senderId = searchParams.get('senderId');
        const limit = parseInt(searchParams.get('limit') || '50');

        if (!senderId) {
            return NextResponse.json(
                { error: 'senderId is required' },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from('ml_behavior_events')
            .select('*')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[ML Behavior] Error fetching events:', error);
            return NextResponse.json(
                { error: 'Failed to fetch events' },
                { status: 500 }
            );
        }

        return NextResponse.json({ events: data || [] });
    } catch (error) {
        console.error('[ML Behavior] Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

