/**
 * ML Conversion Tracking Service
 * Tracks when conversations lead to sales and attributes them to strategies
 */

import { supabase } from './supabase';

export type ConversionType =
    | 'inquiry'           // Customer asks about products/services
    | 'lead_capture'      // Customer provides contact info
    | 'order_placed'      // Customer places an order
    | 'payment_completed' // Customer completes payment
    | 'repeat_purchase'   // Returning customer buys again
    | 'referral';         // Customer refers someone

export interface ConversionEvent {
    senderId: string;
    leadId?: string;
    conversionType: ConversionType;
    conversionValue?: number;
    orderId?: string;
    metadata?: Record<string, any>;
}

export interface ConversionResult {
    conversionId: string;
    attributedStrategies: number;
    success: boolean;
}

/**
 * Record a conversion event and attribute it to strategies used in the conversation
 */
export async function recordConversion(event: ConversionEvent): Promise<ConversionResult> {
    try {
        console.log(`[Conversion] Recording ${event.conversionType} for sender ${event.senderId}`);

        // Get first message time and count for timing metrics
        const { data: messageStats } = await supabase
            .from('conversations')
            .select('created_at')
            .eq('sender_id', event.senderId)
            .order('created_at', { ascending: true });

        const firstMessageTime = messageStats?.[0]?.created_at;
        const messageCount = messageStats?.length || 0;
        const timeToConvertMinutes = firstMessageTime
            ? Math.floor((Date.now() - new Date(firstMessageTime).getTime()) / (1000 * 60))
            : null;

        // Insert conversion record
        const { data: conversion, error: conversionError } = await supabase
            .from('ml_conversions')
            .insert({
                sender_id: event.senderId,
                lead_id: event.leadId || null,
                conversion_type: event.conversionType,
                conversion_value: event.conversionValue || 0,
                order_id: event.orderId || null,
                time_to_convert_minutes: timeToConvertMinutes,
                messages_before_convert: messageCount,
                metadata: event.metadata || {},
            })
            .select()
            .single();

        if (conversionError) {
            console.error('[Conversion] Error recording conversion:', conversionError);
            return { conversionId: '', attributedStrategies: 0, success: false };
        }

        // Attribute conversion to strategies used before this conversion
        const attributedCount = await attributeConversionToStrategies(
            conversion.id,
            event.senderId
        );

        // Update daily metrics in background
        updateDailyMetrics().catch(err => {
            console.error('[Conversion] Error updating daily metrics:', err);
        });

        console.log(`[Conversion] Recorded ${event.conversionType} with ${attributedCount} strategy attributions`);

        return {
            conversionId: conversion.id,
            attributedStrategies: attributedCount,
            success: true,
        };
    } catch (error) {
        console.error('[Conversion] Error:', error);
        return { conversionId: '', attributedStrategies: 0, success: false };
    }
}

/**
 * Attribute a conversion to strategies that were used in the conversation
 * Uses last-touch attribution by default (most recent strategies get full credit)
 */
async function attributeConversionToStrategies(
    conversionId: string,
    senderId: string,
    attributionModel: 'last_touch' | 'first_touch' | 'linear' = 'last_touch'
): Promise<number> {
    try {
        // Get all behavior events with strategies for this sender
        const { data: events, error } = await supabase
            .from('ml_behavior_events')
            .select('strategy_id, created_at')
            .eq('sender_id', senderId)
            .not('strategy_id', 'is', null)
            .order('created_at', { ascending: false });

        if (error || !events || events.length === 0) {
            return 0;
        }

        // Remove duplicates and get unique strategies
        const uniqueStrategies = [...new Set(events.map((e: { strategy_id: string }) => e.strategy_id))] as string[];

        // Calculate attribution weights based on model
        let attributions: { strategyId: string; weight: number; position: number }[] = [];

        switch (attributionModel) {
            case 'last_touch':
                // 100% credit to the last strategy used
                attributions = [{
                    strategyId: events[0].strategy_id,
                    weight: 1.0,
                    position: 1,
                }];
                break;

            case 'first_touch':
                // 100% credit to the first strategy used
                attributions = [{
                    strategyId: events[events.length - 1].strategy_id,
                    weight: 1.0,
                    position: events.length,
                }];
                break;

            case 'linear':
                // Equal credit to all strategies
                const weight = 1.0 / uniqueStrategies.length;
                attributions = uniqueStrategies.map((strategyId: string, index: number) => ({
                    strategyId,
                    weight,
                    position: index + 1,
                }));
                break;
        }

        // Insert attribution records
        const { error: insertError } = await supabase
            .from('ml_conversion_attribution')
            .insert(
                attributions.map(attr => ({
                    conversion_id: conversionId,
                    strategy_id: attr.strategyId,
                    attribution_weight: attr.weight,
                    attribution_model: attributionModel,
                    message_position: attr.position,
                }))
            );

        if (insertError) {
            console.error('[Conversion] Error inserting attributions:', insertError);
            return 0;
        }

        return attributions.length;
    } catch (error) {
        console.error('[Conversion] Error attributing strategies:', error);
        return 0;
    }
}

/**
 * Update daily conversion metrics
 */
async function updateDailyMetrics(): Promise<void> {
    try {
        await supabase.rpc('update_daily_conversion_metrics');
    } catch (error) {
        console.error('[Conversion] Error calling update_daily_conversion_metrics:', error);
    }
}

/**
 * Get conversion funnel metrics for a date range
 */
export async function getConversionFunnel(
    startDate: Date,
    endDate: Date
): Promise<{
    totalConversations: number;
    inquiries: number;
    leadsCapured: number;
    ordersPlaced: number;
    paymentsCompleted: number;
    conversionRate: number;
    totalRevenue: number;
}> {
    try {
        const { data, error } = await supabase
            .from('ml_conversion_metrics_daily')
            .select('*')
            .gte('date', startDate.toISOString().split('T')[0])
            .lte('date', endDate.toISOString().split('T')[0]);

        if (error || !data) {
            return {
                totalConversations: 0,
                inquiries: 0,
                leadsCapured: 0,
                ordersPlaced: 0,
                paymentsCompleted: 0,
                conversionRate: 0,
                totalRevenue: 0,
            };
        }

        // Aggregate metrics
        const totals = data.reduce((acc: any, day: any) => ({
            totalConversations: acc.totalConversations + (day.total_conversations || 0),
            inquiries: acc.inquiries + (day.inquiries || 0),
            leadsCapured: acc.leadsCapured + (day.leads_captured || 0),
            ordersPlaced: acc.ordersPlaced + (day.orders_placed || 0),
            paymentsCompleted: acc.paymentsCompleted + (day.payments_completed || 0),
            totalRevenue: acc.totalRevenue + parseFloat(day.total_revenue || '0'),
        }), {
            totalConversations: 0,
            inquiries: 0,
            leadsCapured: 0,
            ordersPlaced: 0,
            paymentsCompleted: 0,
            totalRevenue: 0,
        });

        return {
            ...totals,
            conversionRate: totals.totalConversations > 0
                ? totals.paymentsCompleted / totals.totalConversations
                : 0,
        };
    } catch (error) {
        console.error('[Conversion] Error getting funnel:', error);
        return {
            totalConversations: 0,
            inquiries: 0,
            leadsCapured: 0,
            ordersPlaced: 0,
            paymentsCompleted: 0,
            conversionRate: 0,
            totalRevenue: 0,
        };
    }
}

/**
 * Get strategy performance with conversion data
 */
export async function getStrategyConversionPerformance(days: number = 30): Promise<Array<{
    strategyId: string;
    strategyName: string;
    totalUses: number;
    conversions: number;
    conversionRate: number;
    totalRevenue: number;
    avgReward: number;
}>> {
    try {
        const { data, error } = await supabase.rpc('get_strategy_conversion_rates', {
            p_days: days,
        });

        if (error) {
            console.error('[Conversion] Error getting strategy performance:', error);
            return [];
        }

        return (data || []).map((row: any) => ({
            strategyId: row.strategy_id,
            strategyName: row.strategy_name,
            totalUses: row.total_uses || 0,
            conversions: row.conversions || 0,
            conversionRate: parseFloat(row.conversion_rate || '0'),
            totalRevenue: parseFloat(row.total_revenue || '0'),
            avgReward: parseFloat(row.avg_reward || '0'),
        }));
    } catch (error) {
        console.error('[Conversion] Error:', error);
        return [];
    }
}

/**
 * Detect potential conversions from message content
 * Call this during chat to auto-detect conversion events
 */
export function detectConversionIntent(
    userMessage: string,
    botResponse: string
): ConversionType | null {
    const lowerMessage = userMessage.toLowerCase();
    const lowerResponse = botResponse.toLowerCase();

    // Order/purchase intent
    const orderKeywords = [
        'order', 'buy', 'purchase', 'checkout', 'bili', 'kuha', 'gusto ko',
        'i want', 'pabili', 'paorder', 'take my order', 'place order'
    ];
    if (orderKeywords.some(kw => lowerMessage.includes(kw))) {
        return 'order_placed';
    }

    // Payment confirmation
    const paymentKeywords = [
        'paid', 'sent payment', 'gcash sent', 'transferred', 'nabayaran',
        'receipt', 'proof of payment', 'reference number'
    ];
    if (paymentKeywords.some(kw => lowerMessage.includes(kw))) {
        return 'payment_completed';
    }

    // Lead capture (providing contact info)
    const contactPatterns = [
        /(?:my (?:number|phone|email) is|contact me at|you can reach me)/i,
        /(?:09\d{9}|(?:\+63)\d{10})/,  // PH phone number
        /[\w.+-]+@[\w-]+\.[\w.-]+/,     // Email
    ];
    if (contactPatterns.some(pattern => pattern.test(userMessage))) {
        return 'lead_capture';
    }

    // Inquiry (asking about products)
    const inquiryKeywords = [
        'how much', 'magkano', 'price', 'available', 'do you have',
        'meron ba', 'pwede ba', 'can i', 'what products'
    ];
    if (inquiryKeywords.some(kw => lowerMessage.includes(kw))) {
        return 'inquiry';
    }

    return null;
}
