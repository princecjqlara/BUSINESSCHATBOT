/**
 * Scheduled Message Service
 * Manages queuing and sending of messages scheduled for best contact times
 */

import { supabase } from './supabase';
import { sendMessengerMessage } from './messengerService';
import { getBestContactTimes, BestContactTimesData } from './bestContactTimesService';
import { getNextBestContactTimeWindow, isWithinBestContactTime, isBestTimeContactEnabled } from './bestContactTimeChecker';

export interface ScheduledMessage {
    id: string;
    lead_id: string;
    sender_id: string;
    message_text: string;
    scheduled_for: string;
    status: 'pending' | 'sent' | 'cancelled' | 'failed';
    page_id?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Schedule a follow-up message for best contact time
 */
export async function scheduleFollowUpMessage(
    leadId: string,
    senderId: string,
    messageText: string,
    pageId?: string,
    metadata?: Record<string, unknown>
): Promise<string | null> {
    try {
        // Check if best time contact is enabled
        const enabled = await isBestTimeContactEnabled(leadId);
        if (!enabled) {
            console.log('[ScheduledMessage] Best time contact disabled, sending immediately');
            // Send immediately if disabled
            await sendMessengerMessage(senderId, messageText, {
                messagingType: 'MESSAGE_TAG',
                tag: 'ACCOUNT_UPDATE',
            });
            return null;
        }

        // Get best contact times
        const bestTimes = await getBestContactTimes(senderId, leadId);

        // Check if we're currently in a best contact time
        if (isWithinBestContactTime(bestTimes)) {
            console.log('[ScheduledMessage] Currently in best contact time, sending immediately');
            await sendMessengerMessage(senderId, messageText, {
                messagingType: 'MESSAGE_TAG',
                tag: 'ACCOUNT_UPDATE',
            });
            return null;
        }

        // Get next best contact time window
        const nextWindow = getNextBestContactTimeWindow(bestTimes);
        if (!nextWindow) {
            console.log('[ScheduledMessage] No best contact time found, sending immediately');
            await sendMessengerMessage(senderId, messageText, {
                messagingType: 'MESSAGE_TAG',
                tag: 'ACCOUNT_UPDATE',
            });
            return null;
        }

        // Schedule message for next best time
        const { data: scheduled, error } = await supabase
            .from('scheduled_messages')
            .insert({
                lead_id: leadId,
                sender_id: senderId,
                message_text: messageText,
                scheduled_for: nextWindow.date.toISOString(),
                status: 'pending',
                page_id: pageId,
                metadata: metadata || {},
            })
            .select()
            .single();

        if (error) {
            console.error('[ScheduledMessage] Error scheduling message:', error);
            // Fallback: send immediately
            await sendMessengerMessage(senderId, messageText, {
                messagingType: 'MESSAGE_TAG',
                tag: 'ACCOUNT_UPDATE',
            });
            return null;
        }

        console.log(`[ScheduledMessage] Message scheduled for ${nextWindow.date.toISOString()} (${nextWindow.window.dayOfWeek} ${nextWindow.window.timeRange})`);
        return scheduled.id;
    } catch (error) {
        console.error('[ScheduledMessage] Error:', error);
        // Fallback: send immediately
        try {
            await sendMessengerMessage(senderId, messageText, {
                messagingType: 'MESSAGE_TAG',
                tag: 'ACCOUNT_UPDATE',
            });
        } catch (sendError) {
            console.error('[ScheduledMessage] Error sending fallback message:', sendError);
        }
        return null;
    }
}

/**
 * Process pending scheduled messages (called by cron job)
 */
export async function processScheduledMessages(): Promise<void> {
    try {
        const now = new Date();

        // Find messages ready to send
        const { data: pendingMessages, error } = await supabase
            .from('scheduled_messages')
            .select('*')
            .eq('status', 'pending')
            .lte('scheduled_for', now.toISOString())
            .order('scheduled_for', { ascending: true })
            .limit(50); // Process in batches

        if (error) {
            console.error('[ScheduledMessage] Error fetching pending messages:', error);
            return;
        }

        if (!pendingMessages || pendingMessages.length === 0) {
            return;
        }

        console.log(`[ScheduledMessage] Processing ${pendingMessages.length} scheduled messages`);

        for (const msg of pendingMessages) {
            try {
                // Check if still within best contact time (re-check before sending)
                const bestTimes = await getBestContactTimes(msg.sender_id, msg.lead_id);
                const enabled = await isBestTimeContactEnabled(msg.lead_id);

                if (enabled && !isWithinBestContactTime(bestTimes)) {
                    // Reschedule if not in best time anymore
                    const nextWindow = getNextBestContactTimeWindow(bestTimes);
                    if (nextWindow) {
                        await supabase
                            .from('scheduled_messages')
                            .update({
                                scheduled_for: nextWindow.date.toISOString(),
                            })
                            .eq('id', msg.id);
                        console.log(`[ScheduledMessage] Rescheduled message ${msg.id} to ${nextWindow.date.toISOString()}`);
                        continue;
                    }
                }

                // Send the message
                await sendMessengerMessage(
                    msg.sender_id,
                    msg.message_text,
                    {
                        messagingType: (msg.metadata?.messagingType as 'RESPONSE' | 'UPDATE' | 'MESSAGE_TAG') || 'MESSAGE_TAG',
                        tag: (msg.metadata?.tag as 'ACCOUNT_UPDATE' | 'CONFIRMED_EVENT_UPDATE' | 'POST_PURCHASE_UPDATE') || 'ACCOUNT_UPDATE',
                    }
                );

                // Mark as sent
                await supabase
                    .from('scheduled_messages')
                    .update({
                        status: 'sent',
                        sent_at: new Date().toISOString(),
                    })
                    .eq('id', msg.id);

                console.log(`[ScheduledMessage] Successfully sent message ${msg.id}`);
            } catch (error) {
                console.error(`[ScheduledMessage] Error processing message ${msg.id}:`, error);

                // Increment retry count
                const retryCount = (msg.retry_count || 0) + 1;
                const maxRetries = msg.max_retries || 3;

                if (retryCount >= maxRetries) {
                    // Mark as failed
                    await supabase
                        .from('scheduled_messages')
                        .update({
                            status: 'failed',
                            error_message: error instanceof Error ? error.message : 'Unknown error',
                        })
                        .eq('id', msg.id);
                } else {
                    // Retry later (add 5 minutes)
                    const retryTime = new Date(Date.now() + 5 * 60 * 1000);
                    await supabase
                        .from('scheduled_messages')
                        .update({
                            retry_count: retryCount,
                            scheduled_for: retryTime.toISOString(),
                        })
                        .eq('id', msg.id);
                }
            }
        }
    } catch (error) {
        console.error('[ScheduledMessage] Error processing scheduled messages:', error);
    }
}

