/**
 * Manual Human Takeover API
 * Allows manually pausing/resuming the bot for a specific lead
 */

import { NextResponse } from 'next/server';
import { startOrRefreshTakeover, endTakeover, isTakeoverActive, getHumanTakeoverTimeout } from '@/app/lib/humanTakeoverService';

// POST - Start or refresh human takeover for a lead
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { senderId, action } = body;

        if (!senderId) {
            return NextResponse.json({ error: 'senderId is required' }, { status: 400 });
        }

        if (action === 'pause') {
            // Start human takeover
            await startOrRefreshTakeover(senderId);
            const timeout = await getHumanTakeoverTimeout();
            return NextResponse.json({
                success: true,
                message: `Bot paused for ${senderId} for ${timeout} minutes`,
                timeout,
                action: 'paused'
            });
        } else if (action === 'resume') {
            // End human takeover
            await endTakeover(senderId);
            return NextResponse.json({
                success: true,
                message: `Bot resumed for ${senderId}`,
                action: 'resumed'
            });
        } else {
            return NextResponse.json({ error: 'action must be "pause" or "resume"' }, { status: 400 });
        }
    } catch (error) {
        console.error('Error in manual takeover:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// GET - Check if takeover is active for a lead
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const senderId = searchParams.get('senderId');

        if (!senderId) {
            return NextResponse.json({ error: 'senderId is required' }, { status: 400 });
        }

        const isActive = await isTakeoverActive(senderId);
        const timeout = await getHumanTakeoverTimeout();

        return NextResponse.json({
            senderId,
            takeoverActive: isActive,
            timeoutMinutes: timeout
        });
    } catch (error) {
        console.error('Error checking takeover status:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
