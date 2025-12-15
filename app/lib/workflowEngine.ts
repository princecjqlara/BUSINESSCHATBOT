import { supabase } from './supabase';
import { sendMessengerMessage, disableBotForLead } from './messengerService';
import { getBotResponse } from './chatService';
import { scheduleFollowUpMessage } from './scheduledMessageService';

interface WorkflowNode {
    id: string;
    type: 'custom';
    data: {
        type: string;
        label: string;
        description?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
    };
}

interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
}

interface WorkflowData {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
}

interface ExecutionContext {
    leadId: string;
    senderId: string;
    conversationHistory?: string;
    lastMessageTime?: Date;
}

export async function executeWorkflow(
    workflowId: string,
    leadId: string,
    senderId: string,
    skipPublishCheck: boolean = false
): Promise<void> {
    console.log(`Starting workflow ${workflowId} for lead ${leadId}`);

    // Get workflow data
    let query = supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId);

    // Only check published status if not skipping
    if (!skipPublishCheck) {
        query = query.eq('is_published', true);
    }

    const { data: workflow, error: workflowError } = await query.single();

    if (workflowError) {
        console.error('Error fetching workflow:', workflowError);
        return;
    }

    if (!workflow) {
        console.error('Workflow not found or not published:', workflowId);
        return;
    }

    console.log('Workflow loaded:', workflow.name);

    const workflowData = workflow.workflow_data as WorkflowData;
    console.log('Workflow data:', JSON.stringify(workflowData, null, 2));

    // Find trigger node
    const triggerNode = workflowData.nodes.find(n => n.data.type === 'trigger');
    if (!triggerNode) {
        console.error('No trigger node found in workflow');
        return;
    }

    console.log('Trigger node found:', triggerNode.id);

    // Create execution record
    const { data: execution, error: execError } = await supabase
        .from('workflow_executions')
        .insert({
            workflow_id: workflowId,
            lead_id: leadId,
            current_node_id: triggerNode.id,
            execution_data: { senderId },
            status: 'pending',
        })
        .select()
        .single();

    if (execError) {
        console.error('Error creating execution record:', execError);
        return;
    }

    if (!execution) {
        console.error('Failed to create execution record');
        return;
    }

    console.log('Execution record created:', execution.id);

    // Start executing from trigger (pass workflowId for scheduled messages)
    await continueExecution(execution.id, workflowData, { leadId, senderId }, workflowId);
}

export async function continueExecution(
    executionId: string,
    workflowData: WorkflowData,
    context: ExecutionContext,
    workflowId?: string
): Promise<void> {
    console.log('continueExecution called for:', executionId);

    const { data: execution, error: execError } = await supabase
        .from('workflow_executions')
        .select('*')
        .eq('id', executionId)
        .single();

    if (execError) {
        console.error('Error fetching execution:', execError);
        return;
    }

    if (!execution || execution.status !== 'pending') {
        console.log('Execution not found or not pending:', execution?.status);
        return;
    }

    console.log('Current node ID:', execution.current_node_id);

    const currentNode = workflowData.nodes.find(n => n.id === execution.current_node_id);
    if (!currentNode) {
        console.log('No current node found - end of workflow');
        // End of workflow
        await supabase
            .from('workflow_executions')
            .update({ status: 'completed' })
            .eq('id', executionId);
        return;
    }

    console.log(`Executing node ${currentNode.id} (${currentNode.data.type})`);
    console.log('Node data:', JSON.stringify(currentNode.data, null, 2));

    // Get workflow ID from execution
    const currentWorkflowId = execution.workflow_id;

    // Execute the node
    const nextNodeId = await executeNode(currentNode, workflowData, context, executionId, currentWorkflowId);
    console.log('Next node ID:', nextNodeId);

    if (nextNodeId === 'WAIT') {
        // Node scheduled for later execution
        console.log('Execution scheduled for later');
        return;
    }

    if (nextNodeId === 'STOP') {
        // Workflow stopped
        await supabase
            .from('workflow_executions')
            .update({ status: 'stopped' })
            .eq('id', executionId);
        return;
    }

    if (!nextNodeId) {
        // End of workflow
        await supabase
            .from('workflow_executions')
            .update({ status: 'completed' })
            .eq('id', executionId);
        return;
    }

    // Update execution to next node
    await supabase
        .from('workflow_executions')
        .update({ current_node_id: nextNodeId })
        .eq('id', executionId);

    // Continue execution (pass workflowId)
    await continueExecution(executionId, workflowData, context, execution.workflow_id);
}

async function executeNode(
    node: WorkflowNode,
    workflowData: WorkflowData,
    context: ExecutionContext,
    executionId: string,
    workflowId?: string
): Promise<string | null | 'WAIT' | 'STOP'> {
    switch (node.data.type) {
        case 'trigger':
            // Just pass through to next node
            return getNextNode(node.id, workflowData);

        case 'message':
            const messageMode = node.data.messageMode || 'custom';
            let messageText = node.data.messageText || node.data.label || 'Hello!';

            if (messageMode === 'ai') {
                // Generate AI message based on prompt + conversation context
                try {
                    // Fetch recent conversation
                    const { data: messages } = await supabase
                        .from('conversations')
                        .select('role, content')
                        .eq('sender_id', context.senderId)
                        .order('created_at', { ascending: true })
                        .limit(10);

                    interface Message { role: string; content: string; }
                    const conversationContext = messages
                        ?.map((m: Message) => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content}`)
                        .join('\n') || '';

                    const aiPrompt = `Generate a message for this customer based on the following instruction:

Instruction: ${messageText}

Recent conversation:
${conversationContext}

Respond with ONLY the message text to send, nothing else. Keep it natural and conversational in Taglish if appropriate.`;

                    const aiResponse = await getBotResponse(aiPrompt, context.senderId);
                    // For workflow, use first message or join all messages
                    messageText = Array.isArray(aiResponse) ? aiResponse.join(' ') : aiResponse;
                } catch (error) {
                    console.error('Error generating AI message:', error);
                    // Fallback to the prompt itself if AI fails
                }
            }

            // Use best time contact scheduling if enabled, otherwise send immediately
            // Get page ID from execution data if available
            const { data: execData } = await supabase
                .from('workflow_executions')
                .select('execution_data')
                .eq('id', executionId)
                .single();

            const executionData = (execData?.execution_data as Record<string, unknown>) || {};
            const pageId = executionData.pageId as string | undefined;

            // Schedule or send based on best time contact setting
            await scheduleFollowUpMessage(
                context.leadId,
                context.senderId,
                messageText,
                pageId,
                {
                    messagingType: 'MESSAGE_TAG',
                    tag: 'ACCOUNT_UPDATE',
                    workflowId: workflowId || '',
                    nodeId: node.id,
                }
            );
            return getNextNode(node.id, workflowData);

        case 'wait':
            // Schedule execution for later
            const duration = parseInt(node.data.duration || '5');
            const unit = node.data.unit || 'minutes';
            const delayMs = unit === 'hours' ? duration * 3600000 :
                unit === 'days' ? duration * 86400000 :
                    duration * 60000; // minutes

            const scheduledFor = new Date(Date.now() + delayMs);

            await supabase
                .from('workflow_executions')
                .update({
                    scheduled_for: scheduledFor.toISOString(),
                    current_node_id: getNextNode(node.id, workflowData),
                })
                .eq('id', executionId);

            return 'WAIT';

        case 'smart_condition':
            const conditionMet = await evaluateSmartCondition(node, context);
            return getNextNodeByCondition(node.id, workflowData, conditionMet);

        case 'stop_bot':
            await disableBotForLead(context.leadId, node.data.reason || 'Workflow stopped');
            return 'STOP';

        default:
            console.warn('Unknown node type:', node.data.type);
            return getNextNode(node.id, workflowData);
    }
}

function getNextNode(nodeId: string, workflowData: WorkflowData): string | null {
    console.log('Getting next node for:', nodeId);
    console.log('Available edges:', workflowData.edges.map(e => `${e.source} -> ${e.target}`));

    // Find all edges from this node
    const edges = workflowData.edges.filter(e => e.source === nodeId);
    console.log('Matching edges:', edges.map(e => e.target));

    // Find the first edge where target node actually exists
    for (const edge of edges) {
        const targetNode = workflowData.nodes.find(n => n.id === edge.target);
        if (targetNode) {
            console.log('Found valid next node:', edge.target, '(', targetNode.data.type, ')');
            return edge.target;
        } else {
            console.warn('Target node does not exist:', edge.target);
        }
    }

    console.log('No valid next node found');
    return null;
}

function getNextNodeByCondition(
    nodeId: string,
    workflowData: WorkflowData,
    conditionMet: boolean
): string | null {
    const edge = workflowData.edges.find(
        e => e.source === nodeId && e.sourceHandle === (conditionMet ? 'true' : 'false')
    );
    return edge?.target || null;
}

async function evaluateSmartCondition(
    node: WorkflowNode,
    context: ExecutionContext
): Promise<boolean> {
    const conditionType = node.data.conditionType || 'has_replied';

    if (conditionType === 'has_replied') {
        // Check if user has sent a message recently
        const { data: lead } = await supabase
            .from('leads')
            .select('last_message_at')
            .eq('id', context.leadId)
            .single();

        if (!lead?.last_message_at) return false;

        const lastMessageTime = new Date(lead.last_message_at);
        const timeSinceMessage = Date.now() - lastMessageTime.getTime();
        const threshold = 3600000; // 1 hour

        return timeSinceMessage < threshold;
    }

    if (conditionType === 'ai_rule') {
        // Use AI to evaluate custom rule
        const rule = node.data.conditionRule || node.data.description;
        if (!rule) return false;

        try {
            const prompt = `You are evaluating a condition for a workflow automation.
      
Condition to check: ${rule}

Context:
- Lead ID: ${context.leadId}
- Recent conversation context available

Respond with ONLY "true" or "false" based on whether the condition is met.`;

            const response = await getBotResponse(prompt, context.senderId);
            // Handle different response types
            let responseText = '';
            if (typeof response === 'string') {
                responseText = response;
            } else if (Array.isArray(response)) {
                responseText = response.join(' ');
            } else if (response && typeof response === 'object' && 'messages' in response) {
                const messages = response.messages;
                responseText = Array.isArray(messages) ? messages.join(' ') : messages;
            }
            return responseText.toLowerCase().includes('true');
        } catch (error) {
            console.error('Error evaluating AI condition:', error);
            return false;
        }
    }

    return false;
}

export async function triggerWorkflowsForStage(stageId: string, leadId: string): Promise<void> {
    console.log(`Checking workflows for stage ${stageId} and lead ${leadId}`);

    const { data: workflows, error: workflowError } = await supabase
        .from('workflows')
        .select('*')
        .eq('trigger_stage_id', stageId)
        .eq('is_published', true);

    if (workflowError) {
        console.error('Error fetching workflows:', workflowError);
        return;
    }

    if (!workflows || workflows.length === 0) {
        console.log('No workflows triggered for stage:', stageId);
        return;
    }

    console.log(`Found ${workflows.length} workflows to trigger:`, workflows.map((w: { name: string }) => w.name));

    const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('sender_id')
        .eq('id', leadId)
        .single();

    if (leadError) {
        console.error('Error fetching lead:', leadError);
        return;
    }

    if (!lead?.sender_id) {
        console.error('Lead not found or no sender_id:', leadId);
        return;
    }

    console.log('Lead sender_id:', lead.sender_id);

    for (const workflow of workflows) {
        console.log(`Executing workflow: ${workflow.name} (${workflow.id})`);
        // Skip publish check since we already filtered for published workflows
        await executeWorkflow(workflow.id, leadId, lead.sender_id, true);
    }
}

