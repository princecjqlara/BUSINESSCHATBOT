/**
 * AI Autonomous Follow-ups Cron Job
 * 
 * This endpoint is called periodically to process AI-initiated follow-ups.
 * It identifies stale conversations and uses AI to decide if/when to follow up.
 * 
 * Recommended: Run every 15 minutes via Vercel Cron or external scheduler
 */

import { NextResponse } from 'next/server';
import { runAiAutonomousFollowups } from '@/app/lib/aiAutonomousFollowupService';

export const maxDuration = 60; // Allow up to 60 seconds for processing

export async function GET(req: Request) {
    try {
        // Note: Removed CRON_SECRET check for easier testing
        // TODO: Add rate limiting or simple API key if needed
        console.log('[AI Followup Cron] Starting autonomous follow-up run...');

        const result = await runAiAutonomousFollowups();

        console.log('[AI Followup Cron] Run complete:', result);

        return NextResponse.json({
            success: true,
            ...result,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[AI Followup Cron] Error:', error);
        return NextResponse.json(
            {
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

// POST endpoint for manual triggering (e.g., from admin UI)
export async function POST(req: Request) {
    try {
        // For POST requests, we might want different auth or none for testing
        const body = await req.json().catch(() => ({}));
        const { forceRun } = body;

        console.log('[AI Followup Cron] Manual trigger received', { forceRun });

        const result = await runAiAutonomousFollowups();

        return NextResponse.json({
            success: true,
            ...result,
            timestamp: new Date().toISOString(),
            triggeredManually: true,
        });
    } catch (error) {
        console.error('[AI Followup Cron] Error:', error);
        return NextResponse.json(
            {
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
