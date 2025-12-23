/**
 * Best Contact Time Checker
 * Real-time utilities to check if current time matches best contact times
 * and calculate when to schedule follow-up messages
 */

import { BestContactTimesData, BestContactTimeWindow } from './bestContactTimesService';

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
 * Get day name from date
 */
function getDayName(date: Date): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
}

/**
 * Check if current time is within any best contact time window
 */
export function isWithinBestContactTime(bestTimes: BestContactTimesData | null): boolean {
    if (!bestTimes || !bestTimes.bestContactTimes || bestTimes.bestContactTimes.length === 0) {
        return false;
    }

    const now = nowPHT();
    const currentDay = getDayName(now);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    for (const window of bestTimes.bestContactTimes) {
        if (window.dayOfWeek === currentDay) {
            // Check if current time is within the window
            const startTotalMinutes = window.startHour * 60;
            const endTotalMinutes = window.endHour * 60;
            const currentTotalMinutes = currentHour * 60 + currentMinute;

            if (currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Get the next best contact time window
 * Returns when the next optimal time to contact will be (in UTC, representing PHT time)
 */
export function getNextBestContactTimeWindow(
    bestTimes: BestContactTimesData | null
): { date: Date; window: BestContactTimeWindow } | null {
    if (!bestTimes || !bestTimes.bestContactTimes || bestTimes.bestContactTimes.length === 0) {
        return null;
    }

    const now = nowPHT();
    const currentDay = getDayName(now);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;

    // Sort windows by day and time
    const dayOrder: Record<string, number> = {
        'Sunday': 0,
        'Monday': 1,
        'Tuesday': 2,
        'Wednesday': 3,
        'Thursday': 4,
        'Friday': 5,
        'Saturday': 6,
    };

    const sortedWindows = [...bestTimes.bestContactTimes].sort((a, b) => {
        const dayDiff = dayOrder[a.dayOfWeek] - dayOrder[b.dayOfWeek];
        if (dayDiff !== 0) return dayDiff;
        return a.startHour - b.startHour;
    });

    /**
     * Helper: Create a proper Date in UTC that represents the given PHT time
     * For example: 8 AM PHT = 00:00 UTC (8 - 8 = 0)
     */
    function createPHTDate(basePHT: Date, daysToAdd: number, phtHour: number): Date {
        // Start from current PHT date
        const targetDate = new Date(basePHT);
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        targetDate.setHours(phtHour, 0, 0, 0);

        // Convert PHT to UTC by subtracting 8 hours
        const phtOffsetMs = 8 * 60 * 60 * 1000;
        return new Date(targetDate.getTime() - phtOffsetMs);
    }

    // Find next window (today or future)
    for (const window of sortedWindows) {
        const windowDayOrder = dayOrder[window.dayOfWeek];
        const currentDayOrder = dayOrder[currentDay];
        const windowStartMinutes = window.startHour * 60;

        // Check if window is today and in the future
        if (windowDayOrder === currentDayOrder && windowStartMinutes > currentTotalMinutes) {
            const nextDate = createPHTDate(now, 0, window.startHour);
            return { date: nextDate, window };
        }

        // Check if window is in a future day
        if (windowDayOrder > currentDayOrder) {
            const daysUntil = windowDayOrder - currentDayOrder;
            const nextDate = createPHTDate(now, daysUntil, window.startHour);
            return { date: nextDate, window };
        }
    }

    // If no window found in current week, use first window of next week
    if (sortedWindows.length > 0) {
        const firstWindow = sortedWindows[0];
        const firstDayOrder = dayOrder[firstWindow.dayOfWeek];
        const currentDayOrder = dayOrder[currentDay];
        const daysUntil = 7 - currentDayOrder + firstDayOrder;

        const nextDate = createPHTDate(now, daysUntil, firstWindow.startHour);
        return { date: nextDate, window: firstWindow };
    }

    return null;
}

/**
 * Calculate minutes until next best contact time
 */
export function getMinutesUntilNextBestTime(bestTimes: BestContactTimesData | null): number | null {
    const nextWindow = getNextBestContactTimeWindow(bestTimes);
    if (!nextWindow) return null;

    const now = nowPHT();
    const diffMs = nextWindow.date.getTime() - now.getTime();
    return Math.max(0, Math.round(diffMs / (1000 * 60)));
}

import { supabase } from './supabase';

/**
 * Check if best time to contact feature is enabled for a lead
 */
export async function isBestTimeContactEnabled(leadId: string): Promise<boolean> {
    try {
        // Check lead-specific setting first
        const { data: lead } = await supabase
            .from('leads')
            .select('enable_best_time_contact')
            .eq('id', leadId)
            .single();

        if (lead?.enable_best_time_contact !== null && lead !== null) {
            return lead.enable_best_time_contact === true;
        }

        // Fall back to global setting
        const { data: settings } = await supabase
            .from('bot_settings')
            .select('enable_best_time_contact')
            .limit(1)
            .single();

        return settings?.enable_best_time_contact === true;
    } catch (error) {
        console.error('[BestTimeChecker] Error checking setting:', error);
        return false; // Default to disabled on error
    }
}

