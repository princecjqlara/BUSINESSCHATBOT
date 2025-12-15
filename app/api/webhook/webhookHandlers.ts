import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { startOrRefreshTakeover } from '@/app/lib/humanTakeoverService';
import { getSettings } from './config';
import { handleImageMessage, handleMessage, handlePostback, handleReferral } from './messageHandlers';

// Track processed message IDs to prevent duplicates (Facebook retries webhooks)
const processedMessages = new Set<string>();
const MAX_PROCESSED_CACHE = 1000;

// NOTE: Message batching using in-memory Maps and setTimeout does NOT work in serverless environments
// like Vercel because:
// 1. Each function invocation may run in a different instance
// 2. In-memory data (Maps, Sets) don't persist between invocations
// 3. setTimeout callbacks may never fire if the function instance is terminated
// 
// Instead, we process messages immediately. If spam prevention is needed, it should be
// implemented using a persistent store (Redis, database) with proper locking.

function cleanupProcessedMessages() {
    if (processedMessages.size > MAX_PROCESSED_CACHE) {
        const toDelete = Array.from(processedMessages).slice(0, processedMessages.size - MAX_PROCESSED_CACHE);
        toDelete.forEach(id => processedMessages.delete(id));
    }
}

export async function handleGetWebhook(req: Request) {
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

export async function handlePostWebhook(req: Request) {
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

                // Handle Referral (m.me links with ref param)
                if (webhook_event.referral) {
                    console.log('Referral event received:', webhook_event.referral);
                    waitUntil(
                        handleReferral(sender_psid, webhook_event.referral, recipient_psid).catch(err => {
                            console.error('Error handling referral:', err);
                        })
                    );
                    continue;
                }

                if (webhook_event.postback) {
                    console.log('Postback event received:', webhook_event.postback);
                    const handled = await handlePostback(webhook_event.postback, sender_psid, recipient_psid, waitUntil);
                    if (handled) {
                        continue;
                    }
                }

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
                        // Process message immediately - batching doesn't work in serverless environments
                        waitUntil(
                            handleMessage(sender_psid, messageText, recipient_psid).catch(err => {
                                console.error('Error handling text message:', err);
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
