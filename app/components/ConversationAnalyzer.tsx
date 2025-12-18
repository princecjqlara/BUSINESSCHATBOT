'use client';

import { useState, useEffect } from 'react';

// Types
interface MessageAnalysis {
    rating: 'excellent' | 'good' | 'questionable' | 'mistake' | 'blunder';
    score: number;
    issues: string[];
    betterResponse?: string;
    explanation: string;
    missedOpportunities?: string[];
}

interface AnalyzedMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    analysis?: MessageAnalysis;
}

interface ConversationAnalysis {
    messages: AnalyzedMessage[];
    summary: {
        overallScore: number;
        mistakeCount: number;
        blunderCount: number;
        excellentCount: number;
        goodCount: number;
        questionableCount: number;
        keyInsights: string[];
        improvementAreas: string[];
    };
    leadInfo?: {
        id: string;
        name: string | null;
        phone: string | null;
    };
}

interface RecentConversation {
    senderId: string;
    leadId: string | null;
    leadName: string | null;
    messageCount: number;
    lastMessageAt: string;
}

// Rating configurations
const ratingConfig = {
    excellent: { icon: '♔', color: '#22c55e', bgColor: '#22c55e20', label: 'Excellent', borderColor: '#22c55e' },
    good: { icon: '✓', color: '#3b82f6', bgColor: '#3b82f620', label: 'Good', borderColor: '#3b82f6' },
    questionable: { icon: '?!', color: '#eab308', bgColor: '#eab30820', label: 'Questionable', borderColor: '#eab308' },
    mistake: { icon: '?', color: '#f97316', bgColor: '#f9731620', label: 'Mistake', borderColor: '#f97316' },
    blunder: { icon: '??', color: '#ef4444', bgColor: '#ef444420', label: 'Blunder', borderColor: '#ef4444' },
};

export default function ConversationAnalyzer() {
    const [conversations, setConversations] = useState<RecentConversation[]>([]);
    const [selectedSenderId, setSelectedSenderId] = useState<string>('');
    const [analysis, setAnalysis] = useState<ConversationAnalysis | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingConversations, setLoadingConversations] = useState(true);
    const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

    // Fetch recent conversations on mount
    useEffect(() => {
        fetchConversations();
    }, []);

    const fetchConversations = async () => {
        setLoadingConversations(true);
        try {
            const response = await fetch('/api/ml/analytics/conversation-analysis?type=list&limit=30');
            if (response.ok) {
                const data = await response.json();
                setConversations(data.conversations || []);
            }
        } catch (error) {
            console.error('Error fetching conversations:', error);
        } finally {
            setLoadingConversations(false);
        }
    };

    const analyzeConversation = async () => {
        if (!selectedSenderId) return;

        setLoading(true);
        setAnalysis(null);

        try {
            const response = await fetch('/api/ml/analytics/conversation-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ senderId: selectedSenderId, limit: 50 }),
            });

            if (response.ok) {
                const data = await response.json();
                setAnalysis(data);
            } else {
                console.error('Analysis failed');
            }
        } catch (error) {
            console.error('Error analyzing conversation:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleMessage = (messageId: string) => {
        setExpandedMessages(prev => {
            const next = new Set(prev);
            if (next.has(messageId)) {
                next.delete(messageId);
            } else {
                next.add(messageId);
            }
            return next;
        });
    };

    const formatTimeAgo = (dateString: string): string => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    const getScoreColor = (score: number): string => {
        if (score >= 80) return '#22c55e';
        if (score >= 60) return '#3b82f6';
        if (score >= 40) return '#eab308';
        if (score >= 20) return '#f97316';
        return '#ef4444';
    };

    return (
        <div style={{ display: 'flex', gap: '24px', minHeight: '600px' }}>
            {/* Left Panel - Conversation Selector & Analysis Summary */}
            <div style={{ width: '320px', flexShrink: 0 }}>
                {/* Conversation Selector */}
                <div style={{
                    background: '#1e293b',
                    borderRadius: '12px',
                    padding: '20px',
                    border: '1px solid #334155',
                    marginBottom: '16px',
                }}>
                    <h3 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
                        🎯 Select Conversation
                    </h3>

                    {loadingConversations ? (
                        <div style={{ color: '#64748b', padding: '12px 0' }}>Loading conversations...</div>
                    ) : (
                        <>
                            <select
                                value={selectedSenderId}
                                onChange={(e) => setSelectedSenderId(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    marginBottom: '12px',
                                }}
                            >
                                <option value="">Choose a contact...</option>
                                {conversations.map((conv) => (
                                    <option key={conv.senderId} value={conv.senderId}>
                                        {conv.leadName || conv.senderId.slice(0, 15) + '...'} ({conv.messageCount} msgs)
                                    </option>
                                ))}
                            </select>

                            <button
                                onClick={analyzeConversation}
                                disabled={!selectedSenderId || loading}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    background: selectedSenderId && !loading ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' : '#334155',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    cursor: selectedSenderId && !loading ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {loading ? '⏳ Analyzing...' : '🔍 Analyze Conversation'}
                            </button>
                        </>
                    )}
                </div>

                {/* Analysis Summary */}
                {analysis && (
                    <div style={{
                        background: '#1e293b',
                        borderRadius: '12px',
                        padding: '20px',
                        border: '1px solid #334155',
                    }}>
                        <h3 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
                            📊 Analysis Summary
                        </h3>

                        {/* Overall Score */}
                        <div style={{
                            textAlign: 'center',
                            padding: '20px',
                            background: '#0f172a',
                            borderRadius: '12px',
                            marginBottom: '16px',
                        }}>
                            <div style={{
                                fontSize: '48px',
                                fontWeight: 700,
                                color: getScoreColor(analysis.summary.overallScore),
                            }}>
                                {analysis.summary.overallScore}
                            </div>
                            <div style={{ color: '#94a3b8', fontSize: '14px' }}>
                                Overall Score
                            </div>
                        </div>

                        {/* Rating Counts */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' }}>
                            <div style={{ background: ratingConfig.excellent.bgColor, padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                                <div style={{ color: ratingConfig.excellent.color, fontSize: '20px', fontWeight: 600 }}>{analysis.summary.excellentCount}</div>
                                <div style={{ color: '#94a3b8', fontSize: '11px' }}>Excellent ♔</div>
                            </div>
                            <div style={{ background: ratingConfig.good.bgColor, padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                                <div style={{ color: ratingConfig.good.color, fontSize: '20px', fontWeight: 600 }}>{analysis.summary.goodCount}</div>
                                <div style={{ color: '#94a3b8', fontSize: '11px' }}>Good ✓</div>
                            </div>
                            <div style={{ background: ratingConfig.questionable.bgColor, padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                                <div style={{ color: ratingConfig.questionable.color, fontSize: '20px', fontWeight: 600 }}>{analysis.summary.questionableCount}</div>
                                <div style={{ color: '#94a3b8', fontSize: '11px' }}>Questionable ?!</div>
                            </div>
                            <div style={{ background: ratingConfig.mistake.bgColor, padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                                <div style={{ color: ratingConfig.mistake.color, fontSize: '20px', fontWeight: 600 }}>{analysis.summary.mistakeCount}</div>
                                <div style={{ color: '#94a3b8', fontSize: '11px' }}>Mistake ?</div>
                            </div>
                            <div style={{ background: ratingConfig.blunder.bgColor, padding: '12px', borderRadius: '8px', textAlign: 'center', gridColumn: 'span 2' }}>
                                <div style={{ color: ratingConfig.blunder.color, fontSize: '20px', fontWeight: 600 }}>{analysis.summary.blunderCount}</div>
                                <div style={{ color: '#94a3b8', fontSize: '11px' }}>Blunder ??</div>
                            </div>
                        </div>

                        {/* Key Insights */}
                        {analysis.summary.keyInsights.length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '8px', fontWeight: 600 }}>
                                    💡 Key Insights
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '16px', color: '#e2e8f0', fontSize: '13px', lineHeight: '1.6' }}>
                                    {analysis.summary.keyInsights.map((insight, idx) => (
                                        <li key={idx}>{insight}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Improvement Areas */}
                        {analysis.summary.improvementAreas.length > 0 && (
                            <div>
                                <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '8px', fontWeight: 600 }}>
                                    🎯 Areas to Improve
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {analysis.summary.improvementAreas.map((area, idx) => (
                                        <span
                                            key={idx}
                                            style={{
                                                padding: '4px 10px',
                                                background: '#1e3a5f',
                                                borderRadius: '12px',
                                                fontSize: '12px',
                                                color: '#60a5fa',
                                            }}
                                        >
                                            {area}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Right Panel - Conversation Messages */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    background: '#1e293b',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    <div style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid #334155',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <h3 style={{ color: '#fff', margin: 0, fontSize: '16px', fontWeight: 600 }}>
                            💬 Conversation Analysis
                        </h3>
                        {analysis?.leadInfo && (
                            <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                                {analysis.leadInfo.name || 'Unknown Contact'} • {analysis.messages.length} messages
                            </span>
                        )}
                    </div>

                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '20px',
                    }}>
                        {!analysis && !loading && (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                                color: '#64748b',
                                textAlign: 'center',
                                padding: '40px',
                            }}>
                                <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.5 }}>🔍</div>
                                <div style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>
                                    Select a conversation to analyze
                                </div>
                                <div style={{ fontSize: '14px' }}>
                                    The AI will review each bot response and identify mistakes, missed opportunities, and suggest better alternatives.
                                </div>
                            </div>
                        )}

                        {loading && (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                                color: '#94a3b8',
                            }}>
                                <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'pulse 2s infinite' }}>🧠</div>
                                <div style={{ fontSize: '16px' }}>Analyzing conversation...</div>
                                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
                                    This may take a few seconds
                                </div>
                            </div>
                        )}

                        {analysis && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {analysis.messages.map((msg) => {
                                    const isExpanded = expandedMessages.has(msg.id);
                                    const config = msg.analysis ? ratingConfig[msg.analysis.rating] : null;

                                    return (
                                        <div
                                            key={msg.id}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                            }}
                                        >
                                            {/* Message Bubble */}
                                            <div
                                                onClick={() => msg.analysis && toggleMessage(msg.id)}
                                                style={{
                                                    maxWidth: '80%',
                                                    padding: '12px 16px',
                                                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                                    background: msg.role === 'user' ? '#3b82f6' : '#0f172a',
                                                    border: msg.analysis ? `2px solid ${config?.borderColor}` : '1px solid #334155',
                                                    color: '#fff',
                                                    cursor: msg.analysis ? 'pointer' : 'default',
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                {/* Role Label & Rating */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    marginBottom: '4px',
                                                    gap: '8px',
                                                }}>
                                                    <span style={{ fontSize: '11px', color: msg.role === 'user' ? '#bfdbfe' : '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                                                        {msg.role === 'user' ? 'User' : 'Bot'}
                                                    </span>
                                                    {msg.analysis && config && (
                                                        <span style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: '2px 8px',
                                                            background: config.bgColor,
                                                            borderRadius: '10px',
                                                            fontSize: '11px',
                                                            fontWeight: 600,
                                                            color: config.color,
                                                        }}>
                                                            <span>{config.icon}</span>
                                                            <span>{msg.analysis.score}</span>
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Message Content */}
                                                <div style={{ fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                                    {msg.content}
                                                </div>

                                                {/* Timestamp */}
                                                <div style={{ fontSize: '10px', color: msg.role === 'user' ? '#bfdbfe' : '#64748b', marginTop: '6px', textAlign: 'right' }}>
                                                    {formatTimeAgo(msg.timestamp)}
                                                </div>
                                            </div>

                                            {/* Expanded Analysis Panel */}
                                            {msg.analysis && isExpanded && (
                                                <div style={{
                                                    maxWidth: '80%',
                                                    marginTop: '8px',
                                                    padding: '16px',
                                                    background: '#0f172a',
                                                    borderRadius: '12px',
                                                    border: `1px solid ${config?.borderColor}`,
                                                }}>
                                                    {/* Explanation */}
                                                    <div style={{ marginBottom: '12px' }}>
                                                        <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px', fontWeight: 600 }}>
                                                            📝 Analysis
                                                        </div>
                                                        <div style={{ color: '#e2e8f0', fontSize: '13px' }}>
                                                            {msg.analysis.explanation}
                                                        </div>
                                                    </div>

                                                    {/* Issues */}
                                                    {msg.analysis.issues.length > 0 && (
                                                        <div style={{ marginBottom: '12px' }}>
                                                            <div style={{ color: '#f97316', fontSize: '11px', marginBottom: '4px', fontWeight: 600 }}>
                                                                ⚠️ Issues
                                                            </div>
                                                            <ul style={{ margin: 0, paddingLeft: '16px', color: '#fbbf24', fontSize: '12px' }}>
                                                                {msg.analysis.issues.map((issue, idx) => (
                                                                    <li key={idx}>{issue}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}

                                                    {/* Better Response */}
                                                    {msg.analysis.betterResponse && (
                                                        <div style={{ marginBottom: '12px' }}>
                                                            <div style={{ color: '#22c55e', fontSize: '11px', marginBottom: '4px', fontWeight: 600 }}>
                                                                ✨ Better Response
                                                            </div>
                                                            <div style={{
                                                                padding: '10px',
                                                                background: '#22c55e10',
                                                                borderRadius: '8px',
                                                                border: '1px solid #22c55e40',
                                                                color: '#86efac',
                                                                fontSize: '13px',
                                                                lineHeight: '1.5',
                                                            }}>
                                                                {msg.analysis.betterResponse}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Missed Opportunities */}
                                                    {msg.analysis.missedOpportunities && msg.analysis.missedOpportunities.length > 0 && (
                                                        <div>
                                                            <div style={{ color: '#a78bfa', fontSize: '11px', marginBottom: '4px', fontWeight: 600 }}>
                                                                💡 Missed Opportunities
                                                            </div>
                                                            <ul style={{ margin: 0, paddingLeft: '16px', color: '#c4b5fd', fontSize: '12px' }}>
                                                                {msg.analysis.missedOpportunities.map((opp, idx) => (
                                                                    <li key={idx}>{opp}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Click hint for bot messages with analysis */}
                                            {msg.analysis && !isExpanded && (
                                                <div style={{
                                                    fontSize: '11px',
                                                    color: '#64748b',
                                                    marginTop: '4px',
                                                    cursor: 'pointer',
                                                }}
                                                    onClick={() => toggleMessage(msg.id)}
                                                >
                                                    Click to view analysis →
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
