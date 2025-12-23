import { NextResponse } from 'next/server';
import { executeWorkflow } from '@/app/lib/workflowEngine';

export async function POST(req: Request) {
    try {
        const { workflowId, leadId, senderId } = await req.json();

        if (!workflowId || !leadId || !senderId) {
            return NextResponse.json({
                error: 'workflowId, leadId, and senderId are required'
            }, { status: 400 });
        }

        console.log(`[TEST] Starting workflow execution: ${workflowId} for lead ${leadId}`);
        console.log(`[TEST] Sender ID: ${senderId}`);
        console.log(`[TEST] Running with real wait scheduling - use cron to process scheduled steps`);

        // Execute the workflow (skip publish check for testing, but respect wait nodes)
        // skipWait=false so wait nodes schedule for later execution
        await executeWorkflow(workflowId, leadId, senderId, true, false);

        return NextResponse.json({
            success: true,
            message: 'Workflow test started. First message sent, subsequent messages will be scheduled. Use cron or manual trigger to process scheduled steps.'
        });
    } catch (error) {
        console.error('Error testing workflow:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to execute workflow'
        }, { status: 500 });
    }
}
