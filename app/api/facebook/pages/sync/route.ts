import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getOrCreateLead } from '@/app/lib/pipelineService';

// POST - Sync all conversations from a Facebook page
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { pageId } = body;

        if (!pageId) {
            return NextResponse.json(
                { error: 'Missing pageId parameter' },
                { status: 400 }
            );
        }

        // Get page access token
        const { data: page, error: fetchError } = await supabase
            .from('connected_pages')
            .select('page_id, page_name, page_access_token')
            .eq('page_id', pageId)
            .single();

        if (fetchError || !page) {
            return NextResponse.json({ error: 'Page not found' }, { status: 404 });
        }

        const pageAccessToken = page.page_access_token;
        if (!pageAccessToken) {
            return NextResponse.json({ error: 'Page access token not found' }, { status: 400 });
        }

        let totalSynced = 0;
        let totalErrors = 0;
        let nextUrl: string | null = null;
        let hasMore = true;

        // Fetch all conversations from Facebook Graph API
        // Use conversations endpoint to get all conversations, not just recent ones
        // Note: Facebook Graph API returns conversations sorted by updated_time, but we'll paginate through all
        const baseUrl = `https://graph.facebook.com/v21.0/${pageId}/conversations`;
        
        // Initial request - fetch all conversations with pagination
        // No date filters - we want ALL conversations regardless of when they were last active
        let url = `${baseUrl}?fields=participants,senders,updated_time&access_token=${pageAccessToken}&limit=100`;

        while (hasMore) {
            try {
                const response = await fetch(url);
                const data = await response.json();

                if (data.error) {
                    console.error('Facebook API error:', data.error);
                    return NextResponse.json(
                        { error: `Facebook API error: ${data.error.message || 'Unknown error'}` },
                        { status: 500 }
                    );
                }

                const conversations = data.data || [];
                console.log(`Processing ${conversations.length} conversations...`);

                // Process each conversation
                for (const conversation of conversations) {
                    try {
                        // Get participants/senders from the conversation
                        const participants = conversation.participants?.data || conversation.senders?.data || [];
                        
                        // Find the user (not the page) in the participants
                        for (const participant of participants) {
                            // Skip if it's the page itself
                            if (participant.id === pageId) {
                                continue;
                            }

                            // Create or get lead for this sender
                            const lead = await getOrCreateLead(participant.id, pageAccessToken);
                            if (lead) {
                                totalSynced++;
                            } else {
                                totalErrors++;
                            }
                        }
                    } catch (error) {
                        console.error('Error processing conversation:', error);
                        totalErrors++;
                    }
                }

                // Check for pagination
                if (data.paging && data.paging.next) {
                    url = data.paging.next;
                    hasMore = true;
                } else {
                    hasMore = false;
                }

                // Add a small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error('Error fetching conversations:', error);
                return NextResponse.json(
                    { error: `Failed to fetch conversations: ${error instanceof Error ? error.message : 'Unknown error'}` },
                    { status: 500 }
                );
            }
        }

        return NextResponse.json({
            success: true,
            message: `Successfully synced ${totalSynced} contacts from ${page.page_name}`,
            synced: totalSynced,
            errors: totalErrors,
        });

    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

