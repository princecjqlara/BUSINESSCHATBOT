import { NextResponse } from 'next/server';
import { processScheduledMessages } from '@/app/lib/scheduledMessageService';

/**
 * Cron job endpoint to process scheduled messages
 * Should be called every minute to check for messages ready to send
 * 
 * Configure in vercel.json:
 * {
 *   "crons": [
 *     {
 *       "path": "/api/cron/process-scheduled-messages",
 *       "schedule": "* * * * *"
 *     }
 *   ]
 * }
 */
export async function GET(req: Request) {
    try {
        // Optional: Add authentication check for cron jobs
        const authHeader = req.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await processScheduledMessages();

        return NextResponse.json({
            success: true,
            message: 'Scheduled messages processed',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Cron] Error processing scheduled messages:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}

// POST endpoint for manual triggering (e.g., from admin UI)
export async function POST() {
    try {
        console.log('[Scheduled Messages] Manual trigger received');

        await processScheduledMessages();

        return NextResponse.json({
            success: true,
            message: 'Scheduled messages processed',
            triggeredManually: true,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Cron] Error processing scheduled messages:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}

