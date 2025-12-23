import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

/**
 * Reset user data while keeping bot knowledge, settings, and goals
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { confirmReset } = body;

        // Require explicit confirmation
        if (confirmReset !== 'RESET_ALL_DATA') {
            return NextResponse.json(
                { error: 'Invalid confirmation. Send { confirmReset: "RESET_ALL_DATA" }' },
                { status: 400 }
            );
        }

        const results: { table: string; success: boolean; error?: string; skipped?: boolean }[] = [];

        // Helper function to safely delete from a table
        async function safeDelete(tableName: string): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
            try {
                const { error } = await supabase
                    .from(tableName)
                    .delete()
                    .not('id', 'is', null);

                if (error) {
                    // If table doesn't exist, skip it
                    if (error.message.includes('Could not find the table') ||
                        error.message.includes('does not exist')) {
                        return { success: true, skipped: true };
                    }
                    return { success: false, error: error.message };
                }
                return { success: true };
            } catch (e) {
                const errMsg = String(e);
                if (errMsg.includes('Could not find the table') ||
                    errMsg.includes('does not exist')) {
                    return { success: true, skipped: true };
                }
                return { success: false, error: errMsg };
            }
        }

        // Order matters - delete in correct order to respect foreign key constraints

        // 1. Delete AI follow-ups
        const r1 = await safeDelete('ai_followups');
        results.push({ table: 'ai_followups', ...r1 });

        // 2. Delete scheduled messages (may not exist)
        const r2 = await safeDelete('scheduled_messages');
        results.push({ table: 'scheduled_messages', ...r2 });

        // 3. Delete workflow executions
        const r3 = await safeDelete('workflow_executions');
        results.push({ table: 'workflow_executions', ...r3 });

        // 4. Delete ML behavior events
        const r4 = await safeDelete('ml_behavior_events');
        results.push({ table: 'ml_behavior_events', ...r4 });

        // 5. Delete lead goal completions
        const r5 = await safeDelete('lead_goal_completions');
        results.push({ table: 'lead_goal_completions', ...r5 });

        // 6. Delete conversations
        const r6 = await safeDelete('conversations');
        results.push({ table: 'conversations', ...r6 });

        // 7. Delete leads
        const r7 = await safeDelete('leads');
        results.push({ table: 'leads', ...r7 });

        // 8. Delete connected pages
        const r8 = await safeDelete('connected_pages');
        results.push({ table: 'connected_pages', ...r8 });

        // Check for any failures (skipped tables are OK)
        const failures = results.filter(r => !r.success && !r.skipped);

        if (failures.length > 0) {
            console.error('[Reset Data] Some tables failed:', failures);
            return NextResponse.json({
                success: false,
                message: 'Some tables failed to reset',
                results,
                failures,
            }, { status: 500 });
        }

        const skipped = results.filter(r => r.skipped);
        const deleted = results.filter(r => r.success && !r.skipped);

        return NextResponse.json({
            success: true,
            message: 'All user data has been reset. Bot knowledge, settings, and goals are preserved.',
            deleted: deleted.map(r => r.table),
            skipped: skipped.map(r => r.table),
            results,
        });

    } catch (error) {
        console.error('[Reset Data] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to reset data', details: String(error) },
            { status: 500 }
        );
    }
}

// GET - Show what will be deleted
export async function GET() {
    return NextResponse.json({
        warning: 'This endpoint resets all user data!',
        willDelete: [
            'connected_pages - All connected Facebook pages',
            'leads - All leads/contacts',
            'conversations - All chat history',
            'ai_followups - All AI follow-up records',
            'scheduled_messages - All scheduled messages (if table exists)',
            'workflow_executions - All workflow runs',
            'ml_behavior_events - All ML tracking data',
            'lead_goal_completions - All goal completion records',
        ],
        willPreserve: [
            'bot_settings - Bot configuration',
            'bot_goals - Defined goals',
            'bot_rules - Bot response rules',
            'documents - Knowledge base',
            'pipeline_stages - Pipeline configuration',
            'workflows - Workflow definitions',
            'ml_strategies - ML strategies',
        ],
        howToUse: 'POST to this endpoint with { confirmReset: "RESET_ALL_DATA" }',
    });
}
