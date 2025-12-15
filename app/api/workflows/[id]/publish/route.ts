import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { executeWorkflow } from '@/app/lib/workflowEngine';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { is_published, apply_to_existing } = await req.json();

        console.log(`[ApplyToExisting] === PUBLISH REQUEST ===`);
        console.log(`[ApplyToExisting] Workflow ID: ${id}`);
        console.log(`[ApplyToExisting] is_published: ${is_published}`);
        console.log(`[ApplyToExisting] apply_to_existing: ${apply_to_existing}`);

        // Update workflow with publish status and apply_to_existing setting
        const { data, error } = await supabase
            .from('workflows')
            .update({ is_published, apply_to_existing: apply_to_existing || false })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        console.log(`[ApplyToExisting] Workflow updated. trigger_stage_id: ${data.trigger_stage_id}`);
        console.log(`[ApplyToExisting] Condition check: is_published=${is_published}, apply_to_existing=${apply_to_existing}, trigger_stage_id=${data.trigger_stage_id}`);

        // If publishing with apply_to_existing enabled, trigger for all existing leads in the trigger stage
        if (is_published && apply_to_existing && data.trigger_stage_id) {
            console.log(`[ApplyToExisting] ✓ All conditions met! Fetching leads in stage ${data.trigger_stage_id}`);

            // Fetch all leads currently in the trigger stage
            const { data: leads, error: leadsError } = await supabase
                .from('leads')
                .select('id, sender_id')
                .eq('current_stage_id', data.trigger_stage_id);

            if (leadsError) {
                console.error('[ApplyToExisting] Error fetching leads:', leadsError);
            } else if (leads && leads.length > 0) {
                console.log(`[ApplyToExisting] Found ${leads.length} leads to trigger`);
                console.log(`[ApplyToExisting] Lead details:`, leads.map((l: any) => ({ id: l.id, sender_id: l.sender_id?.substring(0, 10) + '...' })));

                // Check which leads already have an execution for this workflow to avoid duplicates
                const { data: existingExecutions } = await supabase
                    .from('workflow_executions')
                    .select('lead_id')
                    .eq('workflow_id', id);

                const existingLeadIds = new Set(existingExecutions?.map((e: any) => e.lead_id) || []);
                console.log(`[ApplyToExisting] ${existingLeadIds.size} leads already have executions, will skip those`);

                // Trigger workflow for each lead that doesn't already have an execution
                // AWAIT each one to ensure they complete before returning
                let successCount = 0;
                let skipCount = 0;
                let errorCount = 0;

                for (const lead of leads) {
                    if (!existingLeadIds.has(lead.id)) {
                        if (!lead.sender_id) {
                            console.error(`[ApplyToExisting] Lead ${lead.id} has no sender_id - skipping`);
                            errorCount++;
                            continue;
                        }
                        console.log(`[ApplyToExisting] Executing workflow for lead: ${lead.id} (sender: ${lead.sender_id})`);
                        try {
                            await executeWorkflow(id, lead.id, lead.sender_id, true);
                            console.log(`[ApplyToExisting] ✓ Workflow completed for lead: ${lead.id}`);
                            successCount++;
                        } catch (err) {
                            console.error(`[ApplyToExisting] ✗ Error executing workflow for lead ${lead.id}:`, err);
                            errorCount++;
                        }
                    } else {
                        console.log(`[ApplyToExisting] Skipping lead ${lead.id} - already has execution`);
                        skipCount++;
                    }
                }

                console.log(`[ApplyToExisting] === SUMMARY ===`);
                console.log(`[ApplyToExisting] Success: ${successCount}, Skipped: ${skipCount}, Errors: ${errorCount}`);
            } else {
                console.log(`[ApplyToExisting] No leads found in stage ${data.trigger_stage_id}`);
            }
        } else {
            console.log(`[ApplyToExisting] ✗ Conditions NOT met - skipping apply to existing`);
            if (!is_published) console.log(`[ApplyToExisting]   - is_published is false`);
            if (!apply_to_existing) console.log(`[ApplyToExisting]   - apply_to_existing is false`);
            if (!data.trigger_stage_id) console.log(`[ApplyToExisting]   - trigger_stage_id is null/undefined`);
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('[ApplyToExisting] Error publishing workflow:', error);
        return NextResponse.json({ error: 'Failed to publish workflow' }, { status: 500 });
    }
}
