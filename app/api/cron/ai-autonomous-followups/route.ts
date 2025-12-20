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
        // Verify cron secret to prevent unauthorized access (skip in development)
        const authHeader = req.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // Only check auth if CRON_SECRET is set (production)
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            console.log('[AI Followup Cron] Unauthorized request');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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
