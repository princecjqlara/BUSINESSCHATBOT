import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

/**
 * Reset user data while keeping bot knowledge, settings, and goals
 * This clears:
 * - Connected pages
 * - Leads/contacts
 * - Conversations
 * - AI follow-ups
 * - Scheduled messages
 * - Workflow executions
 * - ML behavior events
 * - Lead goal completions
 * 
 * This keeps:
 * - Bot settings
 * - Bot goals
 * - Bot rules
 * - Documents (knowledge base)
 * - Pipeline stages
 * - Workflows (definitions, not executions)
 * - ML strategies
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

        const results: { table: string; deleted: number | null; error?: string }[] = [];

        // Order matters - delete in correct order to respect foreign key constraints

        // 1. Delete AI follow-ups
        const { error: followupsError, count: followupsCount } = await supabase
            .from('ai_followups')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000') // Match all
            .select('*', { count: 'exact', head: true });

        if (followupsError) {
            results.push({ table: 'ai_followups', deleted: null, error: followupsError.message });
        } else {
            // Actually delete
            await supabase.from('ai_followups').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            results.push({ table: 'ai_followups', deleted: followupsCount });
        }

        // 2. Delete scheduled messages
        const { error: scheduledError } = await supabase
            .from('scheduled_messages')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
        results.push({ table: 'scheduled_messages', deleted: scheduledError ? null : -1, error: scheduledError?.message });

        // 3. Delete workflow executions
        const { error: workflowExecError } = await supabase
            .from('workflow_executions')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
        results.push({ table: 'workflow_executions', deleted: workflowExecError ? null : -1, error: workflowExecError?.message });

        // 4. Delete ML behavior events
        const { error: mlEventsError } = await supabase
            .from('ml_behavior_events')
            .delete()
            .gte('id', 0);
        results.push({ table: 'ml_behavior_events', deleted: mlEventsError ? null : -1, error: mlEventsError?.message });

        // 5. Delete lead goal completions
        const { error: goalCompletionsError } = await supabase
            .from('lead_goal_completions')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
        results.push({ table: 'lead_goal_completions', deleted: goalCompletionsError ? null : -1, error: goalCompletionsError?.message });

        // 6. Delete conversations
        const { error: conversationsError } = await supabase
            .from('conversations')
            .delete()
            .gte('id', 0);
        results.push({ table: 'conversations', deleted: conversationsError ? null : -1, error: conversationsError?.message });

        // 7. Delete leads
        const { error: leadsError } = await supabase
            .from('leads')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
        results.push({ table: 'leads', deleted: leadsError ? null : -1, error: leadsError?.message });

        // 8. Delete connected pages
        const { error: pagesError } = await supabase
            .from('connected_pages')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
        results.push({ table: 'connected_pages', deleted: pagesError ? null : -1, error: pagesError?.message });

        // Check for any errors
        const errors = results.filter(r => r.error);

        if (errors.length > 0) {
            return NextResponse.json({
                success: false,
                message: 'Some tables failed to reset',
                results,
                errors,
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'All user data has been reset. Bot knowledge, settings, and goals are preserved.',
            results,
            preserved: [
                'bot_settings',
                'bot_goals',
                'bot_rules',
                'documents',
                'pipeline_stages',
                'workflows',
                'ml_strategies',
            ],
        });

    } catch (error) {
        console.error('[Reset Data] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to reset data' },
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
            'scheduled_messages - All scheduled messages',
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
