/**
 * Best Time to Contact Service
 * Computes optimal contact times based on message history and reply patterns
 * Uses simplified ML algorithm to predict when contacts are most likely to respond
 */

import { supabase } from './supabase';

export interface BestContactTimeWindow {
    dayOfWeek: string; // "Monday", "Tuesday", etc.
    timeRange: string; // "9:00 AM - 11:00 AM"
    startHour: number; // 0-23
    endHour: number; // 0-23
    confidence: number; // 0-100
    averageReplyTime?: number; // minutes
    messageCount?: number;
}

export interface BestContactTimesData {
    bestContactTimes: BestContactTimeWindow[];
    totalMessagesAnalyzed: number;
    averageReplyTime?: number;
    fastestReplyTime?: number;
    slowestReplyTime?: number;
    computedAt: string; // ISO timestamp
    timezone: string; // "Asia/Manila"
    isDefault?: boolean;
    isBorrowed?: boolean;
}

/**
 * Get Philippine Time (PHT, UTC+8)
 */
function nowPHT(): Date {
    const now = new Date();
    const phtOffset = 8 * 60; // UTC+8 in minutes
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (phtOffset * 60000));
}

/**
 * Get day name in PHT
 */
function getDayNamePHT(date: Date): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
}

/**
 * Format time in 12-hour format
 */
function formatTimePHT(date: Date): string {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Get default best contact times (fallback)
 */
function getDefaultBestContactTimes(): BestContactTimesData {
    return {
        bestContactTimes: [
            {
                dayOfWeek: 'Monday',
                timeRange: '9:00 AM - 12:00 PM',
                startHour: 9,
                endHour: 12,
                confidence: 50,
            },
            {
                dayOfWeek: 'Monday',
                timeRange: '2:00 PM - 5:00 PM',
                startHour: 14,
                endHour: 17,
                confidence: 50,
            },
            {
                dayOfWeek: 'Tuesday',
                timeRange: '9:00 AM - 12:00 PM',
                startHour: 9,
                endHour: 12,
                confidence: 50,
            },
            {
                dayOfWeek: 'Tuesday',
                timeRange: '2:00 PM - 5:00 PM',
                startHour: 14,
                endHour: 17,
                confidence: 50,
            },
            {
                dayOfWeek: 'Wednesday',
                timeRange: '9:00 AM - 12:00 PM',
                startHour: 9,
                endHour: 12,
                confidence: 50,
            },
            {
                dayOfWeek: 'Wednesday',
                timeRange: '2:00 PM - 5:00 PM',
                startHour: 14,
                endHour: 17,
                confidence: 50,
            },
            {
                dayOfWeek: 'Thursday',
                timeRange: '9:00 AM - 12:00 PM',
                startHour: 9,
                endHour: 12,
                confidence: 50,
            },
            {
                dayOfWeek: 'Thursday',
                timeRange: '2:00 PM - 5:00 PM',
                startHour: 14,
                endHour: 17,
                confidence: 50,
            },
            {
                dayOfWeek: 'Friday',
                timeRange: '9:00 AM - 12:00 PM',
                startHour: 9,
                endHour: 12,
                confidence: 50,
            },
            {
                dayOfWeek: 'Friday',
                timeRange: '2:00 PM - 5:00 PM',
                startHour: 14,
                endHour: 17,
                confidence: 50,
            },
            {
                dayOfWeek: 'Saturday',
                timeRange: '10:00 AM - 1:00 PM',
                startHour: 10,
                endHour: 13,
                confidence: 50,
            },
            {
                dayOfWeek: 'Saturday',
                timeRange: '3:00 PM - 6:00 PM',
                startHour: 15,
                endHour: 18,
                confidence: 50,
            },
            {
                dayOfWeek: 'Sunday',
                timeRange: '10:00 AM - 1:00 PM',
                startHour: 10,
                endHour: 13,
                confidence: 50,
            },
            {
                dayOfWeek: 'Sunday',
                timeRange: '3:00 PM - 6:00 PM',
                startHour: 15,
                endHour: 18,
                confidence: 50,
            },
        ],
        totalMessagesAnalyzed: 0,
        computedAt: nowPHT().toISOString(),
        timezone: 'Asia/Manila',
        isDefault: true,
    };
}

/**
 * Compute best contact times from message history
 */
export async function computeBestContactTimes(senderId: string): Promise<BestContactTimesData | null> {
    try {
        // Fetch all conversations for this sender
        const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select('role, content, created_at')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: true });

        if (convError) {
            console.error('[BestContactTimes] Error fetching conversations:', convError);
            return null;
        }

        if (!conversations || conversations.length < 2) {
            console.log('[BestContactTimes] Insufficient messages for', senderId);
            return null;
        }

        // Build activity histogram (168 bins: 7 days × 24 hours)
        const activityHistogram = new Array(168).fill(0);
        const replyTimes: number[] = []; // Store reply times in minutes

        // Track business messages and their replies
        for (let i = 0; i < conversations.length; i++) {
            const msg = conversations[i];
            
            // If it's a bot message, look for user reply
            if (msg.role === 'assistant') {
                const sentTime = new Date(msg.created_at);
                
                // Find next user message (reply)
                for (let j = i + 1; j < conversations.length; j++) {
                    if (conversations[j].role === 'user') {
                        const replyTime = new Date(conversations[j].created_at);
                        const replyDelay = (replyTime.getTime() - sentTime.getTime()) / (1000 * 60); // minutes
                        
                        if (replyDelay > 0 && replyDelay < 1440) { // Within 24 hours
                            replyTimes.push(replyDelay);
                            
                            // Add to activity histogram
                            const dayOfWeek = replyTime.getDay();
                            const hour = replyTime.getHours();
                            const binIndex = dayOfWeek * 24 + hour;
                            if (binIndex >= 0 && binIndex < 168) {
                                activityHistogram[binIndex]++;
                            }
                        }
                        break;
                    }
                }
            }
        }

        if (replyTimes.length === 0) {
            console.log('[BestContactTimes] No reply data found');
            return null;
        }

        // Normalize histogram with Laplace smoothing
        const totalActivity = activityHistogram.reduce((a, b) => a + b, 0);
        const normalizedHistogram = activityHistogram.map(count => 
            (count + 1) / (totalActivity + 168)
        );

        // Find top time windows (simplified approach)
        const scoredWindows: Array<{
            dayOfWeek: string;
            startHour: number;
            endHour: number;
            score: number;
            avgReplyTime: number;
        }> = [];

        // Score each day-hour combination
        for (let day = 0; day < 7; day++) {
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            
            // Find best hour range for this day
            let bestStart = 9;
            let bestEnd = 11;
            let bestScore = 0;

            for (let start = 8; start <= 17; start++) {
                for (let end = start + 1; end <= Math.min(start + 3, 18); end++) {
                    let score = 0;
                    let count = 0;
                    
                    for (let hour = start; hour < end; hour++) {
                        const binIndex = day * 24 + hour;
                        if (binIndex >= 0 && binIndex < 168) {
                            score += normalizedHistogram[binIndex];
                            count++;
                        }
                    }
                    
                    const avgScore = count > 0 ? score / count : 0;
                    if (avgScore > bestScore) {
                        bestScore = avgScore;
                        bestStart = start;
                        bestEnd = end;
                    }
                }
            }

            if (bestScore > 0) {
                // Calculate average reply time for this window
                const relevantReplies = replyTimes.filter((_, idx) => {
                    // This is simplified - in production, match actual reply times to windows
                    return true;
                });
                const avgReplyTime = relevantReplies.length > 0
                    ? Math.round(relevantReplies.reduce((a, b) => a + b, 0) / relevantReplies.length)
                    : undefined;

                scoredWindows.push({
                    dayOfWeek: dayNames[day],
                    startHour: bestStart,
                    endHour: bestEnd,
                    score: bestScore,
                    avgReplyTime: avgReplyTime || 0,
                });
            }
        }

        // Sort by score and take top 5-7
        scoredWindows.sort((a, b) => b.score - a.score);
        const topWindows = scoredWindows.slice(0, 7);

        // Format time ranges
        const bestContactTimes: BestContactTimeWindow[] = topWindows.map(window => {
            const startDate = new Date();
            startDate.setHours(window.startHour, 0, 0, 0);
            const endDate = new Date();
            endDate.setHours(window.endHour, 0, 0, 0);

            return {
                dayOfWeek: window.dayOfWeek,
                timeRange: `${formatTimePHT(startDate)} - ${formatTimePHT(endDate)}`,
                startHour: window.startHour,
                endHour: window.endHour,
                confidence: Math.min(100, Math.round(window.score * 1000)),
                averageReplyTime: window.avgReplyTime > 0 ? window.avgReplyTime : undefined,
                messageCount: replyTimes.length,
            };
        });

        const avgReplyTime = replyTimes.length > 0
            ? Math.round(replyTimes.reduce((a, b) => a + b, 0) / replyTimes.length)
            : undefined;

        return {
            bestContactTimes,
            totalMessagesAnalyzed: conversations.length,
            averageReplyTime: avgReplyTime,
            fastestReplyTime: replyTimes.length > 0 ? Math.min(...replyTimes) : undefined,
            slowestReplyTime: replyTimes.length > 0 ? Math.max(...replyTimes) : undefined,
            computedAt: nowPHT().toISOString(),
            timezone: 'Asia/Manila',
            isDefault: false,
        };
    } catch (error) {
        console.error('[BestContactTimes] Error computing times:', error);
        return null;
    }
}

/**
 * Store best contact times for a lead
 */
export async function storeBestContactTimes(
    leadId: string,
    times: BestContactTimesData
): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('leads')
            .update({ best_contact_times: times })
            .eq('id', leadId);

        if (error) {
            console.error('[BestContactTimes] Error storing times:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[BestContactTimes] Error:', error);
        return false;
    }
}

/**
 * Get best contact times for a lead (compute if not exists)
 */
export async function getBestContactTimes(senderId: string, leadId: string): Promise<BestContactTimesData> {
    try {
        // Check if already computed
        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select('best_contact_times')
            .eq('id', leadId)
            .single();

        if (!leadError && lead?.best_contact_times) {
            return lead.best_contact_times as BestContactTimesData;
        }

        // Compute new times
        const computed = await computeBestContactTimes(senderId);
        if (computed) {
            await storeBestContactTimes(leadId, computed);
            return computed;
        }

        // Fallback to defaults
        const defaults = getDefaultBestContactTimes();
        await storeBestContactTimes(leadId, defaults);
        return defaults;
    } catch (error) {
        console.error('[BestContactTimes] Error getting times:', error);
        return getDefaultBestContactTimes();
    }
}

