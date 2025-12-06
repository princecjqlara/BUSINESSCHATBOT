import OpenAI from 'openai';
import { supabase } from './supabase';

// Constants
const MESSAGES_BEFORE_ANALYSIS = 5;
const TRIGGER_KEYWORDS = ['buy', 'price', 'order', 'payment', 'interested', 'how much', 'magkano', 'bili', 'bayad'];

// Initialize OpenAI client for NVIDIA
const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

// Types
interface Lead {
    id: string;
    sender_id: string;
    name: string | null;
    current_stage_id: string | null;
    message_count: number;
    last_analyzed_at: string | null;
}

interface PipelineStage {
    id: string;
    name: string;
    display_order: number;
    color: string;
}

// Get or create a lead record for a sender
export async function getOrCreateLead(senderId: string, pageAccessToken?: string): Promise<Lead | null> {
    try {
        // Check if lead exists
        const { data: existing, error: fetchError } = await supabase
            .from('leads')
            .select('*')
            .eq('sender_id', senderId)
            .single();

        if (existing) {
            return existing as Lead;
        }

        // Fetch user profile from Facebook if we have a token
        let userName: string | null = null;
        let profilePic: string | null = null;

        if (pageAccessToken) {
            try {
                const profileRes = await fetch(
                    `https://graph.facebook.com/v21.0/${senderId}?fields=first_name,last_name,name,profile_pic&access_token=${pageAccessToken}`
                );
                if (profileRes.ok) {
                    const profile = await profileRes.json();
                    userName = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || null;
                    profilePic = profile.profile_pic || null;
                    console.log('Fetched Facebook profile for lead:', userName);
                }
            } catch (profileError) {
                console.error('Error fetching Facebook profile:', profileError);
            }
        }

        // Get the default "New Lead" stage
        const { data: defaultStage } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('is_default', true)
            .single();

        // Create new lead
        const { data: newLead, error: insertError } = await supabase
            .from('leads')
            .insert({
                sender_id: senderId,
                name: userName,
                profile_pic: profilePic,
                current_stage_id: defaultStage?.id || null,
                message_count: 0,
                last_message_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (insertError) {
            console.error('Error creating lead:', insertError);
            return null;
        }

        return newLead as Lead;
    } catch (error) {
        console.error('Error in getOrCreateLead:', error);
        return null;
    }
}


// Increment message count for a lead
export async function incrementMessageCount(leadId: string): Promise<number> {
    try {
        const { data, error } = await supabase
            .rpc('increment_lead_message_count', { lead_id: leadId });

        if (error) {
            // Fallback: fetch and update manually
            const { data: lead } = await supabase
                .from('leads')
                .select('message_count')
                .eq('id', leadId)
                .single();

            const newCount = (lead?.message_count || 0) + 1;

            await supabase
                .from('leads')
                .update({
                    message_count: newCount,
                    last_message_at: new Date().toISOString()
                })
                .eq('id', leadId);

            return newCount;
        }

        return data || 1;
    } catch (error) {
        console.error('Error incrementing message count:', error);
        return 0;
    }
}

// Check if we should analyze the lead's stage
export function shouldAnalyzeStage(lead: Lead, latestMessage: string): boolean {
    // Trigger after every N messages
    if (lead.message_count > 0 && lead.message_count % MESSAGES_BEFORE_ANALYSIS === 0) {
        return true;
    }

    // Trigger on keywords
    const lowerMessage = latestMessage.toLowerCase();
    for (const keyword of TRIGGER_KEYWORDS) {
        if (lowerMessage.includes(keyword)) {
            return true;
        }
    }

    return false;
}

// Analyze conversation and update stage
export async function analyzeAndUpdateStage(lead: Lead, senderId: string): Promise<void> {
    try {
        // Fetch recent conversation history
        const { data: messages, error: historyError } = await supabase
            .from('conversations')
            .select('role, content')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: true })
            .limit(20);

        if (historyError || !messages || messages.length === 0) {
            console.log('No conversation history to analyze');
            return;
        }

        // Fetch all pipeline stages
        const { data: stages, error: stagesError } = await supabase
            .from('pipeline_stages')
            .select('id, name, description')
            .order('display_order', { ascending: true });

        if (stagesError || !stages) {
            console.error('Error fetching stages:', stagesError);
            return;
        }

        // Build conversation summary
        const conversationSummary = messages
            .map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content}`)
            .join('\n');

        // Build stages list for prompt
        const stagesList = stages.map(s => `- ${s.name}: ${s.description || 'No description'}`).join('\n');

        // Call LLM to classify
        const prompt = `You are a sales pipeline classifier. Based on the conversation below, determine which pipeline stage this lead should be in.

AVAILABLE STAGES:
${stagesList}

CONVERSATION HISTORY:
${conversationSummary}

Respond with ONLY a JSON object in this exact format:
{"stage": "Stage Name", "reason": "Brief reason for classification"}

Choose the most appropriate stage based on the customer's intent, interest level, and conversation progress.`;

        const completion = await client.chat.completions.create({
            model: "deepseek-ai/deepseek-v3.1",
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 200,
        });

        const responseText = completion.choices[0]?.message?.content || '';
        console.log('Pipeline classification response:', responseText);

        // Parse JSON response
        let classification;
        try {
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                classification = JSON.parse(jsonMatch[0]);
            }
        } catch (parseError) {
            console.error('Error parsing classification:', parseError);
            return;
        }

        if (!classification?.stage) {
            console.log('No stage classification returned');
            return;
        }

        // Find the matching stage
        const matchedStage = stages.find(s =>
            s.name.toLowerCase() === classification.stage.toLowerCase()
        );

        if (!matchedStage) {
            console.log('Stage not found:', classification.stage);
            return;
        }

        // Update lead if stage changed
        if (matchedStage.id !== lead.current_stage_id) {
            // Record stage change history
            await supabase
                .from('lead_stage_history')
                .insert({
                    lead_id: lead.id,
                    from_stage_id: lead.current_stage_id,
                    to_stage_id: matchedStage.id,
                    reason: classification.reason || 'AI classification',
                    changed_by: 'ai',
                });

            // Update lead's current stage
            await supabase
                .from('leads')
                .update({
                    current_stage_id: matchedStage.id,
                    last_analyzed_at: new Date().toISOString(),
                    ai_classification_reason: classification.reason,
                })
                .eq('id', lead.id);

            console.log(`Lead ${lead.id} moved to stage: ${matchedStage.name}`);
        } else {
            // Just update last analyzed timestamp
            await supabase
                .from('leads')
                .update({ last_analyzed_at: new Date().toISOString() })
                .eq('id', lead.id);
        }
    } catch (error) {
        console.error('Error in analyzeAndUpdateStage:', error);
    }
}

// Get all leads grouped by stage
export async function getLeadsByStage(): Promise<Record<string, Lead[]>> {
    try {
        const { data: leads, error } = await supabase
            .from('leads')
            .select(`
                *,
                pipeline_stages (
                    id,
                    name,
                    display_order,
                    color
                )
            `)
            .order('last_message_at', { ascending: false });

        if (error) {
            console.error('Error fetching leads:', error);
            return {};
        }

        // Group by stage
        const grouped: Record<string, Lead[]> = {};
        for (const lead of leads || []) {
            const stageName = (lead as any).pipeline_stages?.name || 'Unassigned';
            if (!grouped[stageName]) {
                grouped[stageName] = [];
            }
            grouped[stageName].push(lead);
        }

        return grouped;
    } catch (error) {
        console.error('Error in getLeadsByStage:', error);
        return {};
    }
}

// Get all pipeline stages
export async function getPipelineStages(): Promise<PipelineStage[]> {
    try {
        const { data, error } = await supabase
            .from('pipeline_stages')
            .select('*')
            .order('display_order', { ascending: true });

        if (error) {
            console.error('Error fetching stages:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error in getPipelineStages:', error);
        return [];
    }
}
