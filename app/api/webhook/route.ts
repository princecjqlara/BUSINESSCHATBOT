import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { getBotResponse, ImageContext } from '@/app/lib/chatService';
import { supabase } from '@/app/lib/supabase';
import { getOrCreateLead, incrementMessageCount, shouldAnalyzeStage, analyzeAndUpdateStage, moveLeadToReceiptStage } from '@/app/lib/pipelineService';
import { analyzeImageForReceipt, isConfirmedReceipt } from '@/app/lib/receiptDetectionService';
import { isTakeoverActive, startOrRefreshTakeover } from '@/app/lib/humanTakeoverService';

// Cache settings to avoid database calls on every request
let cachedSettings: any = null;
let settingsLastFetched = 0;
const SETTINGS_CACHE_MS = 60000; // 1 minute cache

// Cache for connected page tokens
const pageTokenCache = new Map<string, { token: string; fetchedAt: number }>();
const PAGE_TOKEN_CACHE_MS = 60000; // 1 minute cache

// Fetch settings from database with caching
async function getSettings() {
    const now = Date.now();
    if (cachedSettings && now - settingsLastFetched < SETTINGS_CACHE_MS) {
        return cachedSettings;
    }

    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching settings:', error);
            return {
                facebook_verify_token: 'TEST_TOKEN',
                facebook_page_access_token: null,
            };
        }

        cachedSettings = data;
        settingsLastFetched = now;
        return data;
    } catch (error) {
        console.error('Error fetching settings:', error);
        return {
            facebook_verify_token: 'TEST_TOKEN',
            facebook_page_access_token: null,
        };
    }
}

// Get page access token - first tries connected_pages table, then falls back to bot_settings
async function getPageToken(pageId?: string): Promise<string | null> {
    // If we have a page ID, try to get page-specific token first
    if (pageId) {
        const now = Date.now();
        const cached = pageTokenCache.get(pageId);
        if (cached && now - cached.fetchedAt < PAGE_TOKEN_CACHE_MS) {
            return cached.token;
        }

        try {
            const { data, error } = await supabase
                .from('connected_pages')
                .select('page_access_token')
                .eq('page_id', pageId)
                .eq('is_active', true)
                .single();

            if (!error && data?.page_access_token) {
                pageTokenCache.set(pageId, { token: data.page_access_token, fetchedAt: now });
                return data.page_access_token;
            }
        } catch (error) {
            console.error('Error fetching page token:', error);
        }
    }

    // Fallback to bot_settings or environment variable
    const settings = await getSettings();
    return settings.facebook_page_access_token || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || null;
}

export async function GET(req: Request) {
    const settings = await getSettings();
    const VERIFY_TOKEN = settings.facebook_verify_token || process.env.FACEBOOK_VERIFY_TOKEN || 'TEST_TOKEN';
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            return new NextResponse(challenge, { status: 200 });
        } else {
            return new NextResponse('Forbidden', { status: 403 });
        }
    }

    return new NextResponse('Bad Request', { status: 400 });
}

// Track processed message IDs to prevent duplicates (Facebook retries webhooks)
const processedMessages = new Set<string>();
const MAX_PROCESSED_CACHE = 1000;

function cleanupProcessedMessages() {
    if (processedMessages.size > MAX_PROCESSED_CACHE) {
        const toDelete = Array.from(processedMessages).slice(0, processedMessages.size - MAX_PROCESSED_CACHE);
        toDelete.forEach(id => processedMessages.delete(id));
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log('Webhook POST received:', JSON.stringify(body, null, 2));

        if (body.object === 'page') {
            for (const entry of body.entry) {
                const webhook_event = entry.messaging?.[0];
                if (!webhook_event) {
                    console.log('No messaging event found in entry:', entry);
                    continue;
                }

                const sender_psid = webhook_event.sender?.id;
                const recipient_psid = webhook_event.recipient?.id;
                const messageId = webhook_event.message?.mid;

                // Skip if already processed (prevents duplicate responses)
                if (messageId && processedMessages.has(messageId)) {
                    console.log('Skipping duplicate message:', messageId);
                    continue;
                }

                // Mark as processed
                if (messageId) {
                    processedMessages.add(messageId);
                    cleanupProcessedMessages();
                }

                console.log('Processing message from:', sender_psid, 'to:', recipient_psid, 'mid:', messageId);

                // Check if this is a message echo (page/human agent sent a message)
                // Facebook sends is_echo=true when the PAGE sends a message (human agent reply)
                const isEchoMessage = webhook_event.message?.is_echo === true;

                if (isEchoMessage) {
                    // This is a message sent BY the page (human agent) TO a customer
                    // The recipient is the customer, start takeover for them
                    console.log('📢 MESSAGE ECHO detected! Human agent sent message to:', recipient_psid);
                    waitUntil(
                        startOrRefreshTakeover(recipient_psid).catch(err => {
                            console.error('Error starting takeover:', err);
                        })
                    );
                    // Don't process echo messages further (they're outgoing, not incoming)
                    continue;
                }

                if (webhook_event.message) {
                    const hasImageAttachment = webhook_event.message.attachments?.some(
                        (att: { type: string }) => att.type === 'image'
                    );
                    const messageText = webhook_event.message.text;

                    // Handle image attachments - pass any accompanying text to the image handler
                    if (webhook_event.message.attachments) {
                        for (const attachment of webhook_event.message.attachments) {
                            if (attachment.type === 'image' && attachment.payload?.url) {
                                console.log('Image attachment detected:', attachment.payload.url.substring(0, 100));
                                waitUntil(
                                    handleImageMessage(
                                        sender_psid,
                                        attachment.payload.url,
                                        recipient_psid,
                                        messageText // Pass accompanying text
                                    ).catch(err => {
                                        console.error('Error handling image message:', err);
                                    })
                                );
                            }
                        }
                    }

                    // Handle text messages ONLY if there's no image attachment
                    // (if there's an image, the image handler already processes the text)
                    if (messageText && !hasImageAttachment) {
                        console.log('Message text:', messageText);
                        // Use waitUntil to ensure Vercel keeps the function alive
                        // until the message is fully processed and responded to
                        waitUntil(
                            handleMessage(sender_psid, messageText, recipient_psid).catch(err => {
                                console.error('Error handling message:', err);
                            })
                        );
                    }
                }
            }
            return new NextResponse('EVENT_RECEIVED', { status: 200 });
        } else {
            console.log('Not a page event:', body.object);
            return new NextResponse('Not Found', { status: 404 });
        }
    } catch (error) {
        console.error('Webhook error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}


// Send typing indicator to show bot is working
async function sendTypingIndicator(sender_psid: string, on: boolean, pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);

    if (!PAGE_ACCESS_TOKEN) return;

    try {
        await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: sender_psid },
                sender_action: on ? 'typing_on' : 'typing_off'
            }),
        });
    } catch (error) {
        console.error('Failed to send typing indicator:', error);
    }
}

async function handleMessage(sender_psid: string, received_message: string, pageId?: string) {
    console.log('handleMessage called, generating response...');

    // Check if human takeover is active for this conversation
    const takeoverActive = await isTakeoverActive(sender_psid);
    if (takeoverActive) {
        console.log('Human takeover active for', sender_psid, '- skipping AI response');
        return;
    }

    // Send typing indicator immediately
    await sendTypingIndicator(sender_psid, true, pageId);

    // Process message and send response
    try {
        // Get page access token for profile fetching (using per-page token)
        const pageToken = await getPageToken(pageId);

        // Track the lead and check if stage analysis is needed
        const lead = await getOrCreateLead(sender_psid, pageToken || undefined);
        if (lead) {
            const messageCount = await incrementMessageCount(lead.id);
            console.log(`Lead ${lead.id} message count: ${messageCount}`);

            // Check if we should analyze stage (runs in background, non-blocking)
            if (shouldAnalyzeStage({ ...lead, message_count: messageCount }, received_message)) {
                console.log('Triggering pipeline stage analysis...');
                // Fire and forget - don't await
                analyzeAndUpdateStage(lead, sender_psid).catch((err: unknown) => {
                    console.error('Error in stage analysis:', err);
                });
            }
        }
        // === END AUTO-PIPELINE ===


        const responseText = await getBotResponse(received_message, sender_psid);
        console.log('Bot response generated:', responseText.substring(0, 100) + '...');

        const response = {
            text: responseText,
        };

        await callSendAPI(sender_psid, response, pageId);
    } finally {
        // Turn off typing indicator
        await sendTypingIndicator(sender_psid, false, pageId);
    }
}

// Handle image messages - analyze and pass context to chatbot for intelligent response
async function handleImageMessage(sender_psid: string, imageUrl: string, pageId?: string, accompanyingText?: string) {
    console.log('handleImageMessage called, analyzing image...');

    // Check if human takeover is active
    const takeoverActive = await isTakeoverActive(sender_psid);
    if (takeoverActive) {
        console.log('Human takeover active for', sender_psid, '- skipping AI response for image');
        return;
    }

    try {
        // Get page token for this specific page
        const pageToken = await getPageToken(pageId);

        // Get or create the lead first
        const lead = await getOrCreateLead(sender_psid, pageToken || undefined);
        if (!lead) {
            console.error('Could not get or create lead for sender:', sender_psid);
            return;
        }

        // Send typing indicator while analyzing
        await sendTypingIndicator(sender_psid, true, pageId);

        // Analyze the image
        const result = await analyzeImageForReceipt(imageUrl);
        console.log('Image analysis result:', result);

        // Build image context for the chatbot
        const imageContext: ImageContext = {
            isReceipt: result.isReceipt,
            confidence: result.confidence,
            details: result.details,
            extractedAmount: result.extractedAmount,
            extractedDate: result.extractedDate,
            imageUrl: imageUrl
        };

        // If high-confidence receipt detected, also move to receipt stage
        if (isConfirmedReceipt(result)) {
            console.log('Receipt confirmed! Moving lead to payment stage...');
            await moveLeadToReceiptStage(lead.id, imageUrl, result.details || 'Receipt detected by AI');
        }

        // Increment message count for the lead
        await incrementMessageCount(lead.id);

        // Build a user message that includes any accompanying text
        const userMessage = accompanyingText
            ? `[Customer sent an image with message: "${accompanyingText}"]`
            : "[Customer sent an image]";

        // Get chatbot response with image context
        const responseText = await getBotResponse(userMessage, sender_psid, imageContext);
        console.log('Bot response for image:', responseText.substring(0, 100) + '...');

        // Send the AI's response
        await callSendAPI(sender_psid, { text: responseText }, pageId);

    } catch (error) {
        console.error('Error in handleImageMessage:', error);
        // Send a fallback response on error
        await callSendAPI(sender_psid, {
            text: "Nakita ko po ang image niyo. May tanong ba kayo tungkol dito? 😊"
        }, pageId);
    } finally {
        await sendTypingIndicator(sender_psid, false, pageId);
    }
}




async function callSendAPI(sender_psid: string, response: any, pageId?: string) {
    const PAGE_ACCESS_TOKEN = await getPageToken(pageId);

    console.log('callSendAPI called, token present:', !!PAGE_ACCESS_TOKEN);

    if (!PAGE_ACCESS_TOKEN) {
        console.warn('FACEBOOK_PAGE_ACCESS_TOKEN not set, skipping message send.');
        return;
    }

    const requestBody = {
        recipient: {
            id: sender_psid,
        },
        message: response,
    };

    console.log('Sending to Facebook:', JSON.stringify(requestBody, null, 2));

    try {
        const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        const resText = await res.text();
        console.log('Facebook API response:', res.status, resText);

        if (!res.ok) {
            console.error('Unable to send message:', resText);
        }
    } catch (error) {
        console.error('Unable to send message:', error);
    }
}
