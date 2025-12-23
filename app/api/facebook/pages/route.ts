import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { subscribePageWebhook, unsubscribePageWebhook } from '@/app/lib/facebookSubscriptionService';

interface ConnectedPage {
    id: string;
    page_id: string;
    page_name: string;
    page_access_token: string;
    is_active: boolean;
    webhook_subscribed: boolean;
    profile_pic: string | null;
    created_at: string;
}

// GET - List all connected pages
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('connected_pages')
            .select('id, page_id, page_name, is_active, webhook_subscribed, profile_pic, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching connected pages:', error);
            return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 });
        }

        return NextResponse.json({ pages: data || [] });

    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Connect a new page
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { pageId, pageName, pageAccessToken, profilePic } = body;

        if (!pageId || !pageName || !pageAccessToken) {
            return NextResponse.json(
                { error: 'Missing required fields: pageId, pageName, pageAccessToken' },
                { status: 400 }
            );
        }

        // Check if page already exists
        const { data: existing } = await supabase
            .from('connected_pages')
            .select('id, page_name')
            .eq('page_id', pageId)
            .single();

        if (existing) {
            console.log(`[Page Connect] Page ${pageName} (${pageId}) already exists, updating access token...`);
            // Update existing page with new access token (could be from different account)
            const { error: updateError } = await supabase
                .from('connected_pages')
                .update({
                    page_name: pageName,
                    page_access_token: pageAccessToken,
                    profile_pic: profilePic || null,
                    is_active: true,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id);

            if (updateError) {
                console.error('Error updating page:', updateError);
                return NextResponse.json({ error: 'Failed to update page' }, { status: 500 });
            }
            console.log(`[Page Connect] Page ${pageName} updated successfully with new access token`);
        } else {
            console.log(`[Page Connect] Connecting new page: ${pageName} (${pageId})`);
            // Insert new page
            const { error: insertError } = await supabase
                .from('connected_pages')
                .insert({
                    page_id: pageId,
                    page_name: pageName,
                    page_access_token: pageAccessToken,
                    profile_pic: profilePic || null,
                    is_active: true,
                    webhook_subscribed: false,
                });

            if (insertError) {
                console.error('Error inserting page:', insertError);
                return NextResponse.json({ error: 'Failed to connect page' }, { status: 500 });
            }
            console.log(`[Page Connect] Page ${pageName} connected successfully`);
        }

        // Subscribe to webhook
        const subscribeResult = await subscribePageWebhook(pageId, pageAccessToken);

        if (subscribeResult.success) {
            // Update webhook_subscribed status
            await supabase
                .from('connected_pages')
                .update({ webhook_subscribed: true })
                .eq('page_id', pageId);
        } else {
            console.warn('Webhook subscription failed:', subscribeResult.error);
            // Page is connected but webhook subscription failed - not a fatal error
        }

        return NextResponse.json({
            success: true,
            webhookSubscribed: subscribeResult.success,
            message: subscribeResult.success
                ? 'Page connected and webhook subscribed successfully'
                : `Page connected but webhook subscription failed: ${subscribeResult.error}`,
        });

    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Disconnect a page
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const pageId = searchParams.get('pageId');

        if (!pageId) {
            return NextResponse.json({ error: 'Missing pageId parameter' }, { status: 400 });
        }

        // Get page details for unsubscribing
        const { data: page, error: fetchError } = await supabase
            .from('connected_pages')
            .select('page_access_token, webhook_subscribed')
            .eq('page_id', pageId)
            .single();

        if (fetchError || !page) {
            return NextResponse.json({ error: 'Page not found' }, { status: 404 });
        }

        // Unsubscribe from webhook if subscribed
        if (page.webhook_subscribed) {
            const unsubscribeResult = await unsubscribePageWebhook(pageId, page.page_access_token);
            if (!unsubscribeResult.success) {
                console.warn('Webhook unsubscription failed:', unsubscribeResult.error);
            }
        }

        // Delete the page from database
        const { error: deleteError } = await supabase
            .from('connected_pages')
            .delete()
            .eq('page_id', pageId);

        if (deleteError) {
            console.error('Error deleting page:', deleteError);
            return NextResponse.json({ error: 'Failed to disconnect page' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Page disconnected successfully' });

    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
