/**
 * ML Analytics API
 * Provides conversion rates, strategy performance, and funnel data
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getStrategyConversionPerformance, getConversionFunnel } from '@/app/lib/mlConversionTracking';
import { getAllRewardMappings, getRewardCategories } from '@/app/lib/mlRewardEngine';

// GET - Get ML analytics data
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type') || 'overview';
        const days = parseInt(searchParams.get('days') || '30');

        switch (type) {
            case 'overview':
                return await getOverviewAnalytics(days);

            case 'strategies':
                return await getStrategyAnalytics(days);

            case 'funnel':
                return await getFunnelAnalytics(days);

            case 'trends':
                return await getTrendAnalytics(days);

            case 'rewards':
                return NextResponse.json({
                    mappings: getAllRewardMappings(),
                    categories: getRewardCategories(),
                });

            default:
                return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }
    } catch (error) {
        console.error('[ML Analytics] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Get overview analytics (summary metrics)
 */
async function getOverviewAnalytics(days: number) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get conversion funnel data
    const funnel = await getConversionFunnel(startDate, endDate);

    // Get strategy performance
    const strategies = await getStrategyConversionPerformance(days);

    // Get total behavior events
    const { count: totalEvents } = await supabase
        .from('ml_behavior_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startDate.toISOString());

    // Get average reward
    const { data: rewardData } = await supabase
        .from('ml_behavior_events')
        .select('reward_value')
        .gte('created_at', startDate.toISOString())
        .not('reward_value', 'is', null);

    const avgReward = rewardData && rewardData.length > 0
        ? rewardData.reduce((sum: number, r: { reward_value: number | null }) => sum + (r.reward_value || 0), 0) / rewardData.length
        : 0;

    // Get top performing strategy
    const topStrategy = strategies.length > 0
        ? strategies.reduce((best, current) =>
            current.conversionRate > best.conversionRate ? current : best
        )
        : null;

    return NextResponse.json({
        period: { startDate: startDate.toISOString(), endDate: endDate.toISOString(), days },
        funnel,
        summary: {
            totalEvents: totalEvents || 0,
            averageReward: Math.round(avgReward * 100) / 100,
            totalStrategies: strategies.length,
            topStrategy: topStrategy ? {
                name: topStrategy.strategyName,
                conversionRate: Math.round(topStrategy.conversionRate * 100),
            } : null,
        },
    });
}

/**
 * Get strategy performance analytics
 */
async function getStrategyAnalytics(days: number) {
    // Get strategy conversion performance
    const strategies = await getStrategyConversionPerformance(days);

    // Get additional strategy details
    const { data: strategyDetails } = await supabase
        .from('ml_strategies')
        .select('id, strategy_name, strategy_type, strategy_description, is_active');

    // Merge performance data with details
    const enrichedStrategies = strategies.map(perf => {
        const details = strategyDetails?.find((d: { id: string }) => d.id === perf.strategyId);
        return {
            ...perf,
            strategyType: details?.strategy_type || 'unknown',
            description: details?.strategy_description || '',
            isActive: details?.is_active ?? true,
        };
    });

    return NextResponse.json({
        strategies: enrichedStrategies,
        summary: {
            totalStrategies: strategies.length,
            activeStrategies: enrichedStrategies.filter(s => s.isActive).length,
            avgConversionRate: strategies.length > 0
                ? strategies.reduce((sum, s) => sum + s.conversionRate, 0) / strategies.length
                : 0,
        },
    });
}

/**
 * Get conversion funnel analytics
 */
async function getFunnelAnalytics(days: number) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const funnel = await getConversionFunnel(startDate, endDate);

    // Get conversion counts by type
    const { data: conversionsByType } = await supabase
        .from('ml_conversions')
        .select('conversion_type')
        .gte('created_at', startDate.toISOString());

    const typeCounts: Record<string, number> = {};
    conversionsByType?.forEach((c: { conversion_type: string }) => {
        typeCounts[c.conversion_type] = (typeCounts[c.conversion_type] || 0) + 1;
    });

    return NextResponse.json({
        funnel,
        conversionsByType: typeCounts,
        funnelStages: [
            { stage: 'Conversations', count: funnel.totalConversations, rate: 100 },
            { stage: 'Inquiries', count: funnel.inquiries, rate: funnel.totalConversations > 0 ? (funnel.inquiries / funnel.totalConversations) * 100 : 0 },
            { stage: 'Leads', count: funnel.leadsCapured, rate: funnel.inquiries > 0 ? (funnel.leadsCapured / funnel.inquiries) * 100 : 0 },
            { stage: 'Orders', count: funnel.ordersPlaced, rate: funnel.leadsCapured > 0 ? (funnel.ordersPlaced / funnel.leadsCapured) * 100 : 0 },
            { stage: 'Payments', count: funnel.paymentsCompleted, rate: funnel.ordersPlaced > 0 ? (funnel.paymentsCompleted / funnel.ordersPlaced) * 100 : 0 },
        ],
    });
}

/**
 * Get trend analytics over time
 */
async function getTrendAnalytics(days: number) {
    const { data: dailyMetrics, error } = await supabase
        .from('ml_conversion_metrics_daily')
        .select('*')
        .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('date', { ascending: true });

    if (error) {
        console.error('[ML Analytics] Error getting trends:', error);
        return NextResponse.json({ trends: [] });
    }

    interface DailyMetric {
        date: string;
        total_conversations: number;
        payments_completed: number;
        overall_conversion_rate: string | null;
        total_revenue: string | null;
        average_order_value: string | null;
    }

    const trends = (dailyMetrics || []).map((day: DailyMetric) => ({
        date: day.date,
        conversations: day.total_conversations,
        conversions: day.payments_completed,
        conversionRate: parseFloat(day.overall_conversion_rate || '0') * 100,
        revenue: parseFloat(day.total_revenue || '0'),
        avgOrderValue: parseFloat(day.average_order_value || '0'),
    }));

    return NextResponse.json({
        trends,
        summary: {
            totalDays: trends.length,
            avgDailyConversations: trends.length > 0
                ? trends.reduce((sum: number, t: { conversations: number }) => sum + t.conversations, 0) / trends.length
                : 0,
            avgDailyRevenue: trends.length > 0
                ? trends.reduce((sum: number, t: { revenue: number }) => sum + t.revenue, 0) / trends.length
                : 0,
        },
    });
}
