import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { startOrRefreshTakeover } from '@/app/lib/humanTakeoverService';
import { getSettings } from './config';
import { handleImageMessage, handleMessage, handlePostback, handleReferral } from './messageHandlers';

// Track processed message IDs to prevent duplicates (Facebook retries webhooks)
const processedMessages = new Set<string>();
const MAX_PROCESSED_CACHE = 1000;

// Message batching system to prevent duplicate responses when contact sends multiple messages simultaneously
interface PendingBatch {
    messages: string[];
    pageId?: string;
    timeoutId: ReturnType<typeof setTimeout>;
    processing: boolean;
}

const pendingBatches = new Map<string, PendingBatch>();
const BATCH_DELAY_MS = 500; // Wait 500ms to collect all messages from the same sender

/**
 * Process a batched set of messages from the same sender
 * Called after the debounce delay
 */
async function processBatchedMessages(senderPsid: string): Promise<void> {
    const batch = pendingBatches.get(senderPsid);
    if (!batch || batch.processing || batch.messages.length === 0) {
        pendingBatches.delete(senderPsid);
        return;
    }

    // Mark as processing to prevent duplicate processing
    batch.processing = true;

    try {
        // Combine all messages into a single message for the bot
        // Use double newlines to separate distinct messages for better AI understanding
        const combinedMessage = batch.messages.length === 1
            ? batch.messages[0]
            : batch.messages.join('\n\n');

        console.log(`[Message Batch] Processing ${batch.messages.length} message(s) from ${senderPsid} as single response`);
        console.log(`[Message Batch] Combined message: ${combinedMessage.substring(0, 100)}...`);

        await handleMessage(senderPsid, combinedMessage, batch.pageId);
    } catch (error) {
        console.error('[Message Batch] Error processing batch:', error);
    } finally {
        pendingBatches.delete(senderPsid);
    }
}

/**
 * Queue a message for batched processing
 * If more messages arrive within BATCH_DELAY_MS, they'll be combined
 */
function queueMessageForBatch(senderPsid: string, messageText: string, pageId?: string): void {
    const existingBatch = pendingBatches.get(senderPsid);

    if (existingBatch && !existingBatch.processing) {
        // Add to existing batch and reset timer
        existingBatch.messages.push(messageText);
        clearTimeout(existingBatch.timeoutId);
        existingBatch.timeoutId = setTimeout(() => {
            waitUntil(processBatchedMessages(senderPsid));
        }, BATCH_DELAY_MS);
        console.log(`[Message Batch] Added message #${existingBatch.messages.length} to batch for ${senderPsid}`);
    } else {
        // Create new batch
        const timeoutId = setTimeout(() => {
            waitUntil(processBatchedMessages(senderPsid));
        }, BATCH_DELAY_MS);

        pendingBatches.set(senderPsid, {
            messages: [messageText],
            pageId,
            timeoutId,
            processing: false,
        });
        console.log(`[Message Batch] Created new batch for ${senderPsid}`);
    }
}

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
                        // Use batching to prevent spam when multiple messages arrive simultaneously
                        // Messages from same sender within 500ms will be combined into a single response
                        queueMessageForBatch(sender_psid, messageText, recipient_psid);
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
