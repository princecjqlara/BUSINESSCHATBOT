'use client';

import { useState, useEffect } from 'react';
import ConversationAnalyzer from '@/app/components/ConversationAnalyzer';

interface OverviewData {
    period: { startDate: string; endDate: string; days: number };
    funnel: {
        totalConversations: number;
        inquiries: number;
        leadsCapured: number;
        ordersPlaced: number;
        paymentsCompleted: number;
        conversionRate: number;
        totalRevenue: number;
    };
    summary: {
        totalEvents: number;
        averageReward: number;
        totalStrategies: number;
        topStrategy: { name: string; conversionRate: number } | null;
    };
}

interface StrategyData {
    strategyId: string;
    strategyName: string;
    strategyType: string;
    totalUses: number;
    conversions: number;
    conversionRate: number;
    totalRevenue: number;
    avgReward: number;
    isActive: boolean;
}

interface FunnelStage {
    stage: string;
    count: number;
    rate: number;
}

export default function MLAnalyticsPage() {
    const [overview, setOverview] = useState<OverviewData | null>(null);
    const [strategies, setStrategies] = useState<StrategyData[]>([]);
    const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);
    const [activeTab, setActiveTab] = useState<'overview' | 'strategies' | 'funnel' | 'analysis'>('overview');

    useEffect(() => {
        fetchData();
    }, [days]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [overviewRes, strategiesRes, funnelRes] = await Promise.all([
                fetch(`/api/ml/analytics?type=overview&days=${days}`),
                fetch(`/api/ml/analytics?type=strategies&days=${days}`),
                fetch(`/api/ml/analytics?type=funnel&days=${days}`),
            ]);

            if (overviewRes.ok) {
                const data = await overviewRes.json();
                setOverview(data);
            }

            if (strategiesRes.ok) {
                const data = await strategiesRes.json();
                setStrategies(data.strategies || []);
            }

            if (funnelRes.ok) {
                const data = await funnelRes.json();
                setFunnelStages(data.funnelStages || []);
            }
        } catch (error) {
            console.error('Error fetching analytics:', error);
        }
        setLoading(false);
    };

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-PH').format(num);
    };

    const formatCurrency = (num: number) => {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP',
        }).format(num);
    };

    const formatPercent = (num: number) => {
        return `${Math.round(num * 100) / 100}%`;
    };

    return (
        <div style={{ minHeight: '100vh', background: '#ffffff', overflow: 'auto' }}>
            <main style={{ padding: '24px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#fff', margin: 0 }}>
                            🤖 ML Analytics
                        </h1>
                        <p style={{ color: '#94a3b8', marginTop: '4px' }}>
                            Track how your chatbot learns to improve sales conversion
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <select
                            value={days}
                            onChange={(e) => setDays(parseInt(e.target.value))}
                            style={{
                                padding: '8px 16px',
                                background: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                color: '#fff',
                                cursor: 'pointer',
                            }}
                        >
                            <option value={7}>Last 7 days</option>
                            <option value={30}>Last 30 days</option>
                            <option value={90}>Last 90 days</option>
                        </select>
                        <button
                            onClick={fetchData}
                            style={{
                                padding: '8px 16px',
                                background: '#3b82f6',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#fff',
                                cursor: 'pointer',
                                fontWeight: 500,
                            }}
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                    {(['overview', 'strategies', 'funnel', 'analysis'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '10px 20px',
                                background: activeTab === tab ? '#3b82f6' : '#1e293b',
                                border: activeTab === tab ? 'none' : '1px solid #334155',
                                borderRadius: '8px',
                                color: '#fff',
                                cursor: 'pointer',
                                fontWeight: activeTab === tab ? 600 : 400,
                                textTransform: 'capitalize',
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        height: '400px',
                        color: '#64748b',
                        fontSize: '18px',
                    }}>
                        Loading analytics...
                    </div>
                ) : (
                    <>
                        {/* Overview Tab */}
                        {activeTab === 'overview' && overview && (
                            <div>
                                {/* Metric Cards */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                    gap: '16px',
                                    marginBottom: '24px',
                                }}>
                                    <MetricCard
                                        title="Conversations"
                                        value={formatNumber(overview.funnel.totalConversations)}
                                        icon="💬"
                                    />
                                    <MetricCard
                                        title="Conversions"
                                        value={formatNumber(overview.funnel.paymentsCompleted)}
                                        subtitle={`${formatPercent(overview.funnel.conversionRate * 100)} rate`}
                                        icon="✅"
                                    />
                                    <MetricCard
                                        title="Revenue"
                                        value={formatCurrency(overview.funnel.totalRevenue)}
                                        icon="💰"
                                    />
                                    <MetricCard
                                        title="Avg Reward"
                                        value={overview.summary.averageReward.toFixed(2)}
                                        subtitle="Learning score"
                                        icon="🎯"
                                    />
                                </div>

                                {/* Top Strategy Card */}
                                {overview.summary.topStrategy && (
                                    <div style={{
                                        background: 'linear-gradient(135deg, #1e3a5f 0%, #1e293b 100%)',
                                        borderRadius: '12px',
                                        padding: '24px',
                                        border: '1px solid #334155',
                                        marginBottom: '24px',
                                    }}>
                                        <h3 style={{ color: '#94a3b8', margin: '0 0 8px 0', fontSize: '14px' }}>
                                            🏆 Top Performing Strategy
                                        </h3>
                                        <p style={{ color: '#fff', fontSize: '24px', fontWeight: 600, margin: 0 }}>
                                            {overview.summary.topStrategy.name}
                                        </p>
                                        <p style={{ color: '#22c55e', margin: '8px 0 0 0' }}>
                                            {overview.summary.topStrategy.conversionRate}% conversion rate
                                        </p>
                                    </div>
                                )}

                                {/* ML Learning Status */}
                                <div style={{
                                    background: '#1e293b',
                                    borderRadius: '12px',
                                    padding: '24px',
                                    border: '1px solid #334155',
                                }}>
                                    <h3 style={{ color: '#fff', margin: '0 0 16px 0' }}>ML Learning Status</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                        <div>
                                            <p style={{ color: '#94a3b8', margin: 0, fontSize: '14px' }}>Total Events Tracked</p>
                                            <p style={{ color: '#fff', fontSize: '24px', fontWeight: 600, margin: '4px 0 0 0' }}>
                                                {formatNumber(overview.summary.totalEvents)}
                                            </p>
                                        </div>
                                        <div>
                                            <p style={{ color: '#94a3b8', margin: 0, fontSize: '14px' }}>Active Strategies</p>
                                            <p style={{ color: '#fff', fontSize: '24px', fontWeight: 600, margin: '4px 0 0 0' }}>
                                                {overview.summary.totalStrategies}
                                            </p>
                                        </div>
                                        <div>
                                            <p style={{ color: '#94a3b8', margin: 0, fontSize: '14px' }}>Period</p>
                                            <p style={{ color: '#fff', fontSize: '24px', fontWeight: 600, margin: '4px 0 0 0' }}>
                                                {days} days
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Strategies Tab */}
                        {activeTab === 'strategies' && (
                            <div style={{
                                background: '#1e293b',
                                borderRadius: '12px',
                                border: '1px solid #334155',
                                overflow: 'hidden',
                            }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: '#0f172a' }}>
                                            <th style={{ padding: '16px', textAlign: 'left', color: '#94a3b8', fontWeight: 500 }}>Strategy</th>
                                            <th style={{ padding: '16px', textAlign: 'right', color: '#94a3b8', fontWeight: 500 }}>Uses</th>
                                            <th style={{ padding: '16px', textAlign: 'right', color: '#94a3b8', fontWeight: 500 }}>Conversions</th>
                                            <th style={{ padding: '16px', textAlign: 'right', color: '#94a3b8', fontWeight: 500 }}>Conv. Rate</th>
                                            <th style={{ padding: '16px', textAlign: 'right', color: '#94a3b8', fontWeight: 500 }}>Revenue</th>
                                            <th style={{ padding: '16px', textAlign: 'right', color: '#94a3b8', fontWeight: 500 }}>Avg Reward</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {strategies.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                                                    No strategy data yet. Enable ML Chatbot in Settings to start learning!
                                                </td>
                                            </tr>
                                        ) : (
                                            strategies.map((strategy) => (
                                                <tr key={strategy.strategyId} style={{ borderTop: '1px solid #334155' }}>
                                                    <td style={{ padding: '16px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{
                                                                width: '8px',
                                                                height: '8px',
                                                                borderRadius: '50%',
                                                                background: strategy.isActive ? '#22c55e' : '#64748b'
                                                            }} />
                                                            <div>
                                                                <p style={{ color: '#fff', margin: 0, fontWeight: 500 }}>{strategy.strategyName}</p>
                                                                <p style={{ color: '#64748b', margin: 0, fontSize: '12px' }}>{strategy.strategyType}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '16px', textAlign: 'right', color: '#fff' }}>{formatNumber(strategy.totalUses)}</td>
                                                    <td style={{ padding: '16px', textAlign: 'right', color: '#fff' }}>{strategy.conversions}</td>
                                                    <td style={{ padding: '16px', textAlign: 'right' }}>
                                                        <span style={{
                                                            color: strategy.conversionRate > 0.1 ? '#22c55e' : strategy.conversionRate > 0.05 ? '#eab308' : '#fff',
                                                            fontWeight: 500,
                                                        }}>
                                                            {formatPercent(strategy.conversionRate * 100)}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '16px', textAlign: 'right', color: '#fff' }}>{formatCurrency(strategy.totalRevenue)}</td>
                                                    <td style={{ padding: '16px', textAlign: 'right', color: '#3b82f6' }}>{strategy.avgReward.toFixed(2)}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Funnel Tab */}
                        {activeTab === 'funnel' && (
                            <div>
                                <div style={{
                                    background: '#1e293b',
                                    borderRadius: '12px',
                                    padding: '24px',
                                    border: '1px solid #334155',
                                }}>
                                    <h3 style={{ color: '#fff', margin: '0 0 24px 0' }}>Conversion Funnel</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {funnelStages.map((stage, index) => (
                                            <div key={stage.stage} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                <div style={{ width: '120px', color: '#94a3b8', fontSize: '14px' }}>
                                                    {stage.stage}
                                                </div>
                                                <div style={{ flex: 1, position: 'relative' }}>
                                                    <div style={{
                                                        background: '#334155',
                                                        borderRadius: '4px',
                                                        height: '32px',
                                                        overflow: 'hidden',
                                                    }}>
                                                        <div style={{
                                                            background: `linear-gradient(90deg, #3b82f6 0%, ${index === funnelStages.length - 1 ? '#22c55e' : '#60a5fa'} 100%)`,
                                                            height: '100%',
                                                            width: `${Math.max(5, stage.rate)}%`,
                                                            transition: 'width 0.5s ease',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            paddingLeft: '12px',
                                                        }}>
                                                            <span style={{ color: '#fff', fontSize: '14px', fontWeight: 500 }}>
                                                                {formatNumber(stage.count)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ width: '60px', textAlign: 'right', color: '#fff', fontWeight: 500 }}>
                                                    {formatPercent(stage.rate)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {funnelStages.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                                            No funnel data yet. Conversions will appear here as customers progress through your sales process.
                                        </div>
                                    )}
                                </div>

                                {/* Funnel Tips */}
                                <div style={{
                                    background: '#1e3a5f',
                                    borderRadius: '12px',
                                    padding: '20px',
                                    border: '1px solid #334155',
                                    marginTop: '24px',
                                }}>
                                    <h4 style={{ color: '#fff', margin: '0 0 12px 0' }}>💡 How the ML System Optimizes Your Funnel</h4>
                                    <ul style={{ color: '#94a3b8', margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
                                        <li>The chatbot tracks which messaging strategies lead to conversions</li>
                                        <li>It learns automatically - strategies that convert well get used more often</li>
                                        <li>Low-performing strategies are tried less but never completely abandoned (exploration)</li>
                                        <li>Over time, your overall conversion rate should improve!</li>
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* Analysis Tab */}
                        {activeTab === 'analysis' && (
                            <ConversationAnalyzer />
                        )}
                    </>
                )}
            </main>
        </div>
    );
}

// Metric Card Component
function MetricCard({ title, value, subtitle, icon }: { title: string; value: string; subtitle?: string; icon: string }) {
    return (
        <div style={{
            background: '#1e293b',
            borderRadius: '12px',
            padding: '20px',
            border: '1px solid #334155',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <p style={{ color: '#94a3b8', margin: 0, fontSize: '14px' }}>{title}</p>
                    <p style={{ color: '#fff', fontSize: '28px', fontWeight: 600, margin: '8px 0 0 0' }}>{value}</p>
                    {subtitle && <p style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '12px' }}>{subtitle}</p>}
                </div>
                <span style={{ fontSize: '24px' }}>{icon}</span>
            </div>
        </div>
    );
}
