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

        const results: { table: string; success: boolean; error?: string }[] = [];

        // Order matters - delete in correct order to respect foreign key constraints
        // Use 'not is null' pattern to match all rows

        // 1. Delete AI follow-ups
        try {
            const { error } = await supabase
                .from('ai_followups')
                .delete()
                .not('id', 'is', null);
            results.push({ table: 'ai_followups', success: !error, error: error?.message });
        } catch (e) {
            results.push({ table: 'ai_followups', success: false, error: String(e) });
        }

        // 2. Delete scheduled messages
        try {
            const { error } = await supabase
                .from('scheduled_messages')
                .delete()
                .not('id', 'is', null);
            results.push({ table: 'scheduled_messages', success: !error, error: error?.message });
        } catch (e) {
            results.push({ table: 'scheduled_messages', success: false, error: String(e) });
        }

        // 3. Delete workflow executions
        try {
            const { error } = await supabase
                .from('workflow_executions')
                .delete()
                .not('id', 'is', null);
            results.push({ table: 'workflow_executions', success: !error, error: error?.message });
        } catch (e) {
            results.push({ table: 'workflow_executions', success: false, error: String(e) });
        }

        // 4. Delete ML behavior events
        try {
            const { error } = await supabase
                .from('ml_behavior_events')
                .delete()
                .not('id', 'is', null);
            results.push({ table: 'ml_behavior_events', success: !error, error: error?.message });
        } catch (e) {
            results.push({ table: 'ml_behavior_events', success: false, error: String(e) });
        }

        // 5. Delete lead goal completions
        try {
            const { error } = await supabase
                .from('lead_goal_completions')
                .delete()
                .not('id', 'is', null);
            results.push({ table: 'lead_goal_completions', success: !error, error: error?.message });
        } catch (e) {
            results.push({ table: 'lead_goal_completions', success: false, error: String(e) });
        }

        // 6. Delete conversations
        try {
            const { error } = await supabase
                .from('conversations')
                .delete()
                .not('id', 'is', null);
            results.push({ table: 'conversations', success: !error, error: error?.message });
        } catch (e) {
            results.push({ table: 'conversations', success: false, error: String(e) });
        }

        // 7. Delete leads
        try {
            const { error } = await supabase
                .from('leads')
                .delete()
                .not('id', 'is', null);
            results.push({ table: 'leads', success: !error, error: error?.message });
        } catch (e) {
            results.push({ table: 'leads', success: false, error: String(e) });
        }

        // 8. Delete connected pages
        try {
            const { error } = await supabase
                .from('connected_pages')
                .delete()
                .not('id', 'is', null);
            results.push({ table: 'connected_pages', success: !error, error: error?.message });
        } catch (e) {
            results.push({ table: 'connected_pages', success: false, error: String(e) });
        }

        // Check for any errors
        const failures = results.filter(r => !r.success);

        if (failures.length > 0) {
            console.error('[Reset Data] Some tables failed:', failures);
            return NextResponse.json({
                success: false,
                message: 'Some tables failed to reset',
                results,
                failures,
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
