'use client';

import { useState, useEffect } from 'react';
import { X, Clock, User, Phone, Mail, MessageSquare, TrendingUp, Brain, Calendar, Award, BarChart3, Building2, Link2, Briefcase, UserCircle, Globe, Target, CheckCircle2, Zap, Send } from 'lucide-react';
import { BestContactTimesData, BestContactTimeWindow } from '@/app/lib/bestContactTimesService';

interface LeadDetails {
    lead: {
        id: string;
        senderId: string;
        name: string | null;
        phone: string | null;
        email: string | null;
        messageCount: number;
        lastMessageAt: string | null;
        aiClassificationReason: string | null;
        currentStageId: string | null;
        profilePic: string | null;
        createdAt: string;
        // Contact details
        pageName: string | null;
        pageLink: string | null;
        businessName: string | null;
        decisionMakerName: string | null;
        decisionMakerPosition: string | null;
        additionalContactInfo: any | null;
        conversationAnalysis: {
            overallScore: number;
            excellentCount: number;
            goodCount: number;
            questionableCount: number;
            mistakeCount: number;
            blunderCount: number;
            keyInsights: string[];
            improvementAreas: string[];
            analyzedAt: string;
            triggerStage: string;
            messageCount: number;
        } | null;
    };
    bestContactTimes: BestContactTimesData | null;
    conversationHistory: Array<{
        role: string;
        content: string;
        timestamp: string;
    }>;
    mlBehaviorEvents: Array<{
        id: string;
        eventType: string;
        eventData: any;
        rewardValue: number;
        timestamp: string;
        strategy: { name: string; type: string } | null;
    }>;
    mlStrategyPerformance: Array<{
        strategyId: string;
        strategyName: string;
        strategyType: string;
        strategyDescription: string | null;
        totalUses: number;
        totalReward: number;
        averageReward: number;
        lastUsed: string | null;
    }>;
    mlContextFeatures: {
        conversationStage: string;
        messageCount: number;
        userType?: string;
        hasProductInterest?: boolean;
        lastResponseTime?: number;
        timeOfDay?: string;
        dayOfWeek?: string;
    } | null;
    goalCompletions: Array<{
        id: string;
        goalId: string;
        goalName: string;
        goalDescription: string | null;
        priorityOrder: number;
        completedAt: string;
        completionContext: string | null;
    }>;
    aiFollowups: Array<{
        id: string;
        status: string;
        followupType: string;
        message: string;
        aiReasoning: string | null;
        urgency: string | null;
        scheduledFor: string | null;
        sentAt: string | null;
        createdAt: string;
    }>;
}

interface LeadDetailsModalProps {
    leadId: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function LeadDetailsModal({ leadId, isOpen, onClose }: LeadDetailsModalProps) {
    const [loading, setLoading] = useState(true);
    const [details, setDetails] = useState<LeadDetails | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'contact' | 'ml' | 'conversation' | 'analysis'>('overview');
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [analysisData, setAnalysisData] = useState<any>(null);

    useEffect(() => {
        if (isOpen && leadId) {
            fetchLeadDetails();
        }
    }, [isOpen, leadId]);

    const fetchLeadDetails = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/pipeline/leads/${leadId}/details`);
            if (!response.ok) {
                throw new Error('Failed to fetch lead details');
            }
            const data = await response.json();
            setDetails(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const formatTimeAgo = (dateString: string | null): string => {
        if (!dateString) return 'Unknown';
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

    const formatRewardValue = (value: number): string => {
        if (value > 0) return `+${value.toFixed(2)}`;
        return value.toFixed(2);
    };

    const getEventTypeLabel = (eventType: string): string => {
        const labels: Record<string, string> = {
            purchase: 'Purchase',
            product_click: 'Product Click',
            conversation_continue: 'Conversation Continue',
            message_sent: 'Message Sent',
            leave: 'Left Chat',
            no_response: 'No Response',
        };
        return labels[eventType] || eventType;
    };

    const getEventTypeColor = (eventType: string): string => {
        const colors: Record<string, string> = {
            purchase: 'bg-green-100 text-green-700 border-green-200',
            product_click: 'bg-blue-100 text-blue-700 border-blue-200',
            conversation_continue: 'bg-purple-100 text-purple-700 border-purple-200',
            message_sent: 'bg-gray-100 text-gray-700 border-gray-200',
            leave: 'bg-red-100 text-red-700 border-red-200',
            no_response: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        };
        return colors[eventType] || 'bg-gray-100 text-gray-700 border-gray-200';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-2xl font-bold text-gray-900">Lead Details</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {loading ? (
                        <div className="flex items-center justify-center flex-1 p-8">
                            <div className="text-gray-500">Loading...</div>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center flex-1 p-8">
                            <div className="text-red-500">Error: {error}</div>
                        </div>
                    ) : details ? (
                        <>
                            {/* Tabs */}
                            <div className="flex border-b border-gray-200 px-6">
                                <button
                                    onClick={() => setActiveTab('overview')}
                                    className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'overview'
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Overview
                                </button>
                                <button
                                    onClick={() => setActiveTab('contact')}
                                    className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'contact'
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Best Contact Times
                                </button>
                                <button
                                    onClick={() => setActiveTab('ml')}
                                    className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'ml'
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    ML Insights
                                </button>
                                <button
                                    onClick={() => setActiveTab('conversation')}
                                    className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'conversation'
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Conversation
                                </button>
                                <button
                                    onClick={() => setActiveTab('analysis')}
                                    className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'analysis'
                                        ? 'border-purple-600 text-purple-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    🏆 Analysis
                                </button>
                            </div>

                            {/* Tab Content */}
                            <div className="flex-1 overflow-y-auto p-6">
                                {activeTab === 'overview' && (
                                    <div className="space-y-6">
                                        {/* Customer Details */}
                                        <div className="bg-gray-50 rounded-xl p-6">
                                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                <User size={20} />
                                                Customer Information
                                            </h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <div className="text-xs text-gray-500 mb-1">Name</div>
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {details.lead.name || 'Not provided'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                        <Phone size={12} />
                                                        Phone
                                                    </div>
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {details.lead.phone ? details.lead.phone : <span className="text-gray-400 italic">Not provided</span>}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                        <Mail size={12} />
                                                        Email
                                                    </div>
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {details.lead.email ? details.lead.email : <span className="text-gray-400 italic">Not provided</span>}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                        <MessageSquare size={12} />
                                                        Messages
                                                    </div>
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {details.lead.messageCount}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                        <Clock size={12} />
                                                        Last Message
                                                    </div>
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {formatTimeAgo(details.lead.lastMessageAt)}
                                                    </div>
                                                </div>
                                            </div>
                                            {details.lead.aiClassificationReason && (
                                                <div className="mt-4 pt-4 border-t border-gray-200">
                                                    <div className="text-xs text-gray-500 mb-1">AI Classification</div>
                                                    <div className="text-sm text-gray-700">
                                                        {details.lead.aiClassificationReason}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Business & Contact Details */}
                                        {(details.lead.pageName || details.lead.pageLink || details.lead.businessName ||
                                            details.lead.decisionMakerName || details.lead.decisionMakerPosition ||
                                            details.lead.additionalContactInfo) && (
                                                <div className="bg-blue-50 rounded-xl p-6">
                                                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                        <Building2 size={20} />
                                                        Business & Contact Details
                                                    </h3>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        {details.lead.businessName && (
                                                            <div>
                                                                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                                    <Building2 size={12} />
                                                                    Business Name
                                                                </div>
                                                                <div className="text-sm font-medium text-gray-900">
                                                                    {details.lead.businessName}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {details.lead.pageName && (
                                                            <div>
                                                                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                                    <Globe size={12} />
                                                                    Page Name
                                                                </div>
                                                                <div className="text-sm font-medium text-gray-900">
                                                                    {details.lead.pageName}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {details.lead.pageLink && (
                                                            <div>
                                                                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                                    <Link2 size={12} />
                                                                    Page Link
                                                                </div>
                                                                <div className="text-sm font-medium text-gray-900">
                                                                    <a
                                                                        href={details.lead.pageLink}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-blue-600 hover:text-blue-800 hover:underline break-all"
                                                                    >
                                                                        {details.lead.pageLink}
                                                                    </a>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {details.lead.decisionMakerName && (
                                                            <div>
                                                                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                                    <UserCircle size={12} />
                                                                    Decision Maker
                                                                </div>
                                                                <div className="text-sm font-medium text-gray-900">
                                                                    {details.lead.decisionMakerName}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {details.lead.decisionMakerPosition && (
                                                            <div>
                                                                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                                    <Briefcase size={12} />
                                                                    Position
                                                                </div>
                                                                <div className="text-sm font-medium text-gray-900">
                                                                    {details.lead.decisionMakerPosition}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {details.lead.additionalContactInfo && (
                                                        <div className="mt-4 pt-4 border-t border-blue-200">
                                                            <div className="text-xs text-gray-500 mb-3 font-semibold">Additional Information</div>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                {details.lead.additionalContactInfo.owner && (
                                                                    <div>
                                                                        <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                                            <UserCircle size={12} />
                                                                            Owner
                                                                        </div>
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {details.lead.additionalContactInfo.owner}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {details.lead.additionalContactInfo.address && (
                                                                    <div className="col-span-2">
                                                                        <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                                            <Building2 size={12} />
                                                                            Address
                                                                        </div>
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {details.lead.additionalContactInfo.address}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {details.lead.additionalContactInfo.website && (
                                                                    <div className="col-span-2">
                                                                        <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                                            <Globe size={12} />
                                                                            Website
                                                                        </div>
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            <a
                                                                                href={details.lead.additionalContactInfo.website.startsWith('http')
                                                                                    ? details.lead.additionalContactInfo.website
                                                                                    : `https://${details.lead.additionalContactInfo.website}`}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="text-blue-600 hover:text-blue-800 hover:underline"
                                                                            >
                                                                                {details.lead.additionalContactInfo.website}
                                                                            </a>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {details.lead.additionalContactInfo.industry && (
                                                                    <div>
                                                                        <div className="text-xs text-gray-500 mb-1">Industry</div>
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {details.lead.additionalContactInfo.industry}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {details.lead.additionalContactInfo.businessType && (
                                                                    <div>
                                                                        <div className="text-xs text-gray-500 mb-1">Business Type</div>
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {details.lead.additionalContactInfo.businessType}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {details.lead.additionalContactInfo.companySize && (
                                                                    <div>
                                                                        <div className="text-xs text-gray-500 mb-1">Company Size</div>
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {details.lead.additionalContactInfo.companySize}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {details.lead.additionalContactInfo.yearsInBusiness && (
                                                                    <div>
                                                                        <div className="text-xs text-gray-500 mb-1">Years in Business</div>
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {details.lead.additionalContactInfo.yearsInBusiness}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {details.lead.additionalContactInfo.productsServices && (
                                                                    <div className="col-span-2">
                                                                        <div className="text-xs text-gray-500 mb-1">Products/Services</div>
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {details.lead.additionalContactInfo.productsServices}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {details.lead.additionalContactInfo.socialMedia && (
                                                                    <div className="col-span-2">
                                                                        <div className="text-xs text-gray-500 mb-1">Social Media</div>
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {details.lead.additionalContactInfo.socialMedia}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {details.lead.additionalContactInfo.landline && (
                                                                    <div>
                                                                        <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                                            <Phone size={12} />
                                                                            Landline
                                                                        </div>
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {details.lead.additionalContactInfo.landline}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {details.lead.additionalContactInfo.taxId && (
                                                                    <div>
                                                                        <div className="text-xs text-gray-500 mb-1">Tax ID / Registration</div>
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {details.lead.additionalContactInfo.taxId}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {/* Display any other fields not explicitly handled above */}
                                                                {Object.entries(details.lead.additionalContactInfo)
                                                                    .filter(([key]) => !['owner', 'address', 'website', 'industry', 'businessType',
                                                                        'companySize', 'yearsInBusiness', 'productsServices', 'socialMedia',
                                                                        'landline', 'taxId'].includes(key))
                                                                    .map(([key, value]) => (
                                                                        <div key={key}>
                                                                            <div className="text-xs text-gray-500 mb-1 capitalize">
                                                                                {key.replace(/_/g, ' ')}
                                                                            </div>
                                                                            <div className="text-sm font-medium text-gray-900">
                                                                                {typeof value === 'string' ? value : JSON.stringify(value)}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                        {/* ML Context Features */}
                                        {details.mlContextFeatures && (
                                            <div className="bg-purple-50 rounded-xl p-6">
                                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                    <Brain size={20} />
                                                    ML Context Analysis
                                                </h3>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <div className="text-xs text-gray-500 mb-1">Conversation Stage</div>
                                                        <div className="text-sm font-medium text-gray-900 capitalize">
                                                            {details.mlContextFeatures.conversationStage}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-gray-500 mb-1">User Type</div>
                                                        <div className="text-sm font-medium text-gray-900 capitalize">
                                                            {details.mlContextFeatures.userType || 'Unknown'}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-gray-500 mb-1">Product Interest</div>
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {details.mlContextFeatures.hasProductInterest ? 'Yes' : 'No'}
                                                        </div>
                                                    </div>
                                                    {details.mlContextFeatures.timeOfDay && (
                                                        <div>
                                                            <div className="text-xs text-gray-500 mb-1">Time of Day</div>
                                                            <div className="text-sm font-medium text-gray-900 capitalize">
                                                                {details.mlContextFeatures.timeOfDay}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Bot Goals Completed */}
                                        {details.goalCompletions && details.goalCompletions.length > 0 && (
                                            <div className="bg-green-50 rounded-xl p-6">
                                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                    <Target size={20} />
                                                    Bot Goals Achieved
                                                </h3>
                                                <div className="space-y-3">
                                                    {details.goalCompletions.map((completion) => (
                                                        <div
                                                            key={completion.id}
                                                            className="bg-white rounded-lg p-4 border border-green-200"
                                                        >
                                                            <div className="flex items-start justify-between mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
                                                                    <div>
                                                                        <div className="font-semibold text-gray-900">
                                                                            {completion.goalName}
                                                                        </div>
                                                                        {completion.goalDescription && (
                                                                            <div className="text-xs text-gray-500 mt-1">
                                                                                {completion.goalDescription}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-md font-medium whitespace-nowrap">
                                                                    Priority {completion.priorityOrder + 1}
                                                                </span>
                                                            </div>
                                                            {completion.completionContext && (
                                                                <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2">
                                                                    <span className="font-medium">How:</span> {completion.completionContext}
                                                                </div>
                                                            )}
                                                            <div className="mt-2 text-xs text-gray-400">
                                                                Completed {formatTimeAgo(completion.completedAt)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* AI Autonomous Follow-ups */}
                                        {details.aiFollowups && details.aiFollowups.length > 0 && (
                                            <div className="bg-orange-50 rounded-xl p-6">
                                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                    <Zap size={20} className="text-orange-600" />
                                                    AI Follow-up Decisions
                                                </h3>
                                                <div className="space-y-3">
                                                    {details.aiFollowups.map((followup) => (
                                                        <div
                                                            key={followup.id}
                                                            className={`bg-white rounded-lg p-4 border ${followup.status === 'sent' ? 'border-green-200' :
                                                                    followup.status === 'scheduled' ? 'border-orange-200' :
                                                                        followup.status === 'pending' ? 'border-blue-200' :
                                                                            'border-gray-200'
                                                                }`}
                                                        >
                                                            <div className="flex items-start justify-between mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    {followup.status === 'sent' ? (
                                                                        <Send size={16} className="text-green-600" />
                                                                    ) : followup.status === 'scheduled' ? (
                                                                        <Clock size={16} className="text-orange-600" />
                                                                    ) : (
                                                                        <Zap size={16} className="text-blue-600" />
                                                                    )}
                                                                    <span className={`px-2 py-1 text-xs rounded-md font-medium ${followup.status === 'sent' ? 'bg-green-100 text-green-700' :
                                                                            followup.status === 'scheduled' ? 'bg-orange-100 text-orange-700' :
                                                                                followup.status === 'pending' ? 'bg-blue-100 text-blue-700' :
                                                                                    followup.status === 'failed' ? 'bg-red-100 text-red-700' :
                                                                                        'bg-gray-100 text-gray-700'
                                                                        }`}>
                                                                        {followup.status.toUpperCase()}
                                                                    </span>
                                                                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">
                                                                        {followup.followupType?.replace('_', ' ')}
                                                                    </span>
                                                                    {followup.urgency && (
                                                                        <span className={`px-2 py-1 text-xs rounded-md ${followup.urgency === 'high' ? 'bg-red-100 text-red-700' :
                                                                                followup.urgency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                                                                    'bg-gray-100 text-gray-600'
                                                                            }`}>
                                                                            {followup.urgency}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {followup.aiReasoning && (
                                                                <div className="mt-2 text-sm text-gray-700 bg-orange-50 rounded p-2 border border-orange-100">
                                                                    <span className="font-medium text-orange-700">🤖 AI Reasoning:</span> {followup.aiReasoning}
                                                                </div>
                                                            )}

                                                            <div className="mt-2 text-sm text-gray-600 italic">
                                                                &quot;{followup.message.substring(0, 150)}{followup.message.length > 150 ? '...' : ''}&quot;
                                                            </div>

                                                            <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                                                                {followup.scheduledFor && followup.status === 'scheduled' && (
                                                                    <span className="text-orange-600">
                                                                        ⏰ Scheduled: {new Date(followup.scheduledFor).toLocaleString()}
                                                                    </span>
                                                                )}
                                                                {followup.sentAt && (
                                                                    <span className="text-green-600">
                                                                        ✓ Sent: {formatTimeAgo(followup.sentAt)}
                                                                    </span>
                                                                )}
                                                                <span>Created {formatTimeAgo(followup.createdAt)}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Quick Stats */}
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="bg-blue-50 rounded-lg p-4">
                                                <div className="text-xs text-blue-600 font-medium mb-1">Total Events</div>
                                                <div className="text-2xl font-bold text-blue-900">
                                                    {details.mlBehaviorEvents.length}
                                                </div>
                                            </div>
                                            <div className="bg-green-50 rounded-lg p-4">
                                                <div className="text-xs text-green-600 font-medium mb-1">Total Reward</div>
                                                <div className="text-2xl font-bold text-green-900">
                                                    {formatRewardValue(
                                                        details.mlBehaviorEvents.reduce(
                                                            (sum, e) => sum + (e.rewardValue || 0),
                                                            0
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                            <div className="bg-purple-50 rounded-lg p-4">
                                                <div className="text-xs text-purple-600 font-medium mb-1">Strategies Used</div>
                                                <div className="text-2xl font-bold text-purple-900">
                                                    {details.mlStrategyPerformance.length}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'contact' && (
                                    <div className="space-y-6">
                                        {details.bestContactTimes && details.bestContactTimes.bestContactTimes.length > 0 ? (
                                            <>
                                                <div className="bg-blue-50 rounded-xl p-6">
                                                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                        <Calendar size={20} />
                                                        Best Contact Times
                                                    </h3>
                                                    <div className="space-y-3">
                                                        {details.bestContactTimes.bestContactTimes.map(
                                                            (window: BestContactTimeWindow, idx: number) => (
                                                                <div
                                                                    key={idx}
                                                                    className="bg-white rounded-lg p-4 border border-blue-200"
                                                                >
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <div className="font-semibold text-gray-900">
                                                                            {window.dayOfWeek}
                                                                        </div>
                                                                        <div className="text-sm text-gray-600">
                                                                            {window.timeRange}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                                                        <span>Confidence: {window.confidence}%</span>
                                                                        {window.averageReplyTime && (
                                                                            <span>Avg Reply: {window.averageReplyTime}m</span>
                                                                        )}
                                                                        {window.messageCount && (
                                                                            <span>Messages: {window.messageCount}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                    {details.bestContactTimes.totalMessagesAnalyzed && (
                                                        <div className="mt-4 pt-4 border-t border-blue-200 text-sm text-gray-600">
                                                            Based on {details.bestContactTimes.totalMessagesAnalyzed} messages
                                                            {details.bestContactTimes.averageReplyTime && (
                                                                <> • Average reply time: {details.bestContactTimes.averageReplyTime} minutes</>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
                                                <Calendar size={48} className="mx-auto mb-4 opacity-50" />
                                                <p>No best contact times computed yet.</p>
                                                <p className="text-sm mt-2">
                                                    Best contact times are calculated after sufficient message history.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'ml' && (
                                    <div className="space-y-6">
                                        {/* Strategy Performance */}
                                        {details.mlStrategyPerformance.length > 0 ? (
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                    <TrendingUp size={20} />
                                                    Strategy Performance
                                                </h3>
                                                <div className="space-y-3">
                                                    {details.mlStrategyPerformance
                                                        .sort((a, b) => b.averageReward - a.averageReward)
                                                        .map((strategy) => (
                                                            <div
                                                                key={strategy.strategyId}
                                                                className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                                                            >
                                                                <div className="flex items-start justify-between mb-2">
                                                                    <div>
                                                                        <div className="font-semibold text-gray-900">
                                                                            {strategy.strategyName}
                                                                        </div>
                                                                        {strategy.strategyDescription && (
                                                                            <div className="text-xs text-gray-500 mt-1">
                                                                                {strategy.strategyDescription}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <div className="text-sm font-bold text-green-600">
                                                                            {formatRewardValue(strategy.averageReward)}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500">avg reward</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                                                                    <span>Uses: {strategy.totalUses}</span>
                                                                    <span>Total: {formatRewardValue(strategy.totalReward)}</span>
                                                                    {strategy.lastUsed && (
                                                                        <span>Last: {formatTimeAgo(strategy.lastUsed)}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
                                                <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
                                                <p>No strategy performance data available yet.</p>
                                            </div>
                                        )}

                                        {/* Behavior Events */}
                                        {details.mlBehaviorEvents.length > 0 ? (
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                    <Award size={20} />
                                                    Recent Behavior Events
                                                </h3>
                                                <div className="space-y-2">
                                                    {details.mlBehaviorEvents.map((event) => (
                                                        <div
                                                            key={event.id}
                                                            className="bg-white rounded-lg p-3 border border-gray-200 flex items-center justify-between"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span
                                                                    className={`px-2 py-1 rounded text-xs font-medium border ${getEventTypeColor(
                                                                        event.eventType
                                                                    )}`}
                                                                >
                                                                    {getEventTypeLabel(event.eventType)}
                                                                </span>
                                                                {event.strategy && (
                                                                    <span className="text-xs text-gray-500">
                                                                        via {event.strategy.name}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <span
                                                                    className={`text-sm font-semibold ${event.rewardValue > 0
                                                                        ? 'text-green-600'
                                                                        : event.rewardValue < 0
                                                                            ? 'text-red-600'
                                                                            : 'text-gray-500'
                                                                        }`}
                                                                >
                                                                    {formatRewardValue(event.rewardValue)}
                                                                </span>
                                                                <span className="text-xs text-gray-400">
                                                                    {formatTimeAgo(event.timestamp)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
                                                <Award size={48} className="mx-auto mb-4 opacity-50" />
                                                <p>No behavior events recorded yet.</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'conversation' && (
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                            <MessageSquare size={20} />
                                            Conversation History
                                        </h3>
                                        {details.conversationHistory.length > 0 ? (
                                            <div className="space-y-3 max-h-[500px] overflow-y-auto">
                                                {details.conversationHistory.map((msg, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={`rounded-lg p-4 ${msg.role === 'user'
                                                            ? 'bg-blue-50 border border-blue-200 ml-8'
                                                            : 'bg-gray-50 border border-gray-200 mr-8'
                                                            }`}
                                                    >
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-xs font-semibold text-gray-600 uppercase">
                                                                {msg.role === 'user' ? 'User' : 'Assistant'}
                                                            </span>
                                                            <span className="text-xs text-gray-400">
                                                                {formatTimeAgo(msg.timestamp)}
                                                            </span>
                                                        </div>
                                                        <div className="text-sm text-gray-900 whitespace-pre-wrap">
                                                            {msg.content}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
                                                <MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
                                                <p>No conversation history available.</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'analysis' && (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                                🏆 Conversation Analysis
                                            </h3>
                                            <button
                                                onClick={async () => {
                                                    setAnalysisLoading(true);
                                                    try {
                                                        const res = await fetch(`/api/ml/analytics/conversation-analysis?type=analyze&senderId=${details.lead.senderId}&limit=50`);
                                                        const data = await res.json();
                                                        setAnalysisData(data);
                                                    } catch (err) {
                                                        console.error('Analysis error:', err);
                                                    } finally {
                                                        setAnalysisLoading(false);
                                                    }
                                                }}
                                                disabled={analysisLoading}
                                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                            >
                                                {analysisLoading ? '⏳ Analyzing...' : '🔍 Run Analysis'}
                                            </button>
                                        </div>

                                        {/* Stored Analysis Summary */}
                                        {details.lead.conversationAnalysis && !analysisData && (
                                            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="text-4xl font-bold text-purple-600">
                                                        {details.lead.conversationAnalysis.overallScore}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-700">Overall Score</div>
                                                        <div className="text-xs text-gray-500">
                                                            Analyzed on {new Date(details.lead.conversationAnalysis.analyzedAt).toLocaleDateString()} • Stage: {details.lead.conversationAnalysis.triggerStage}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-5 gap-2 mb-4">
                                                    <div className="text-center p-2 bg-green-100 rounded-lg">
                                                        <div className="text-lg font-bold text-green-700">♔ {details.lead.conversationAnalysis.excellentCount}</div>
                                                        <div className="text-xs text-green-600">Excellent</div>
                                                    </div>
                                                    <div className="text-center p-2 bg-blue-100 rounded-lg">
                                                        <div className="text-lg font-bold text-blue-700">✓ {details.lead.conversationAnalysis.goodCount}</div>
                                                        <div className="text-xs text-blue-600">Good</div>
                                                    </div>
                                                    <div className="text-center p-2 bg-yellow-100 rounded-lg">
                                                        <div className="text-lg font-bold text-yellow-700">?! {details.lead.conversationAnalysis.questionableCount}</div>
                                                        <div className="text-xs text-yellow-600">Questionable</div>
                                                    </div>
                                                    <div className="text-center p-2 bg-orange-100 rounded-lg">
                                                        <div className="text-lg font-bold text-orange-700">? {details.lead.conversationAnalysis.mistakeCount}</div>
                                                        <div className="text-xs text-orange-600">Mistake</div>
                                                    </div>
                                                    <div className="text-center p-2 bg-red-100 rounded-lg">
                                                        <div className="text-lg font-bold text-red-700">?? {details.lead.conversationAnalysis.blunderCount}</div>
                                                        <div className="text-xs text-red-600">Blunder</div>
                                                    </div>
                                                </div>

                                                {details.lead.conversationAnalysis.keyInsights?.length > 0 && (
                                                    <div className="mb-3">
                                                        <div className="text-xs font-semibold text-gray-600 mb-1">Key Insights</div>
                                                        <ul className="text-sm text-gray-700 space-y-1">
                                                            {details.lead.conversationAnalysis.keyInsights.map((insight, i) => (
                                                                <li key={i} className="flex items-start gap-2">
                                                                    <span className="text-green-500">✓</span>
                                                                    {insight}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {details.lead.conversationAnalysis.improvementAreas?.length > 0 && (
                                                    <div>
                                                        <div className="text-xs font-semibold text-gray-600 mb-1">Areas for Improvement</div>
                                                        <ul className="text-sm text-gray-700 space-y-1">
                                                            {details.lead.conversationAnalysis.improvementAreas.map((area, i) => (
                                                                <li key={i} className="flex items-start gap-2">
                                                                    <span className="text-yellow-500">⚡</span>
                                                                    {area}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Live Analysis Results */}
                                        {analysisData && (
                                            <div className="space-y-4">
                                                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6">
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <div className="text-4xl font-bold text-purple-600">
                                                            {analysisData.summary?.overallScore || 0}
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-700">Overall Score</div>
                                                            <div className="text-xs text-gray-500">
                                                                {analysisData.messages?.length || 0} messages analyzed
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-5 gap-2 mb-4">
                                                        <div className="text-center p-2 bg-green-100 rounded-lg">
                                                            <div className="text-lg font-bold text-green-700">♔ {analysisData.summary?.excellentCount || 0}</div>
                                                            <div className="text-xs text-green-600">Excellent</div>
                                                        </div>
                                                        <div className="text-center p-2 bg-blue-100 rounded-lg">
                                                            <div className="text-lg font-bold text-blue-700">✓ {analysisData.summary?.goodCount || 0}</div>
                                                            <div className="text-xs text-blue-600">Good</div>
                                                        </div>
                                                        <div className="text-center p-2 bg-yellow-100 rounded-lg">
                                                            <div className="text-lg font-bold text-yellow-700">?! {analysisData.summary?.questionableCount || 0}</div>
                                                            <div className="text-xs text-yellow-600">Questionable</div>
                                                        </div>
                                                        <div className="text-center p-2 bg-orange-100 rounded-lg">
                                                            <div className="text-lg font-bold text-orange-700">? {analysisData.summary?.mistakeCount || 0}</div>
                                                            <div className="text-xs text-orange-600">Mistake</div>
                                                        </div>
                                                        <div className="text-center p-2 bg-red-100 rounded-lg">
                                                            <div className="text-lg font-bold text-red-700">?? {analysisData.summary?.blunderCount || 0}</div>
                                                            <div className="text-xs text-red-600">Blunder</div>
                                                        </div>
                                                    </div>

                                                    {analysisData.summary?.keyInsights?.length > 0 && (
                                                        <div className="mb-3">
                                                            <div className="text-xs font-semibold text-gray-600 mb-1">Key Insights</div>
                                                            <ul className="text-sm text-gray-700 space-y-1">
                                                                {analysisData.summary.keyInsights.map((insight: string, i: number) => (
                                                                    <li key={i} className="flex items-start gap-2">
                                                                        <span className="text-green-500">✓</span>
                                                                        {insight}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Message-by-message analysis */}
                                                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                                                    {analysisData.messages?.filter((m: any) => m.role === 'assistant' && m.analysis).map((msg: any, idx: number) => {
                                                        const ratingColors: Record<string, string> = {
                                                            excellent: 'border-green-500 bg-green-50',
                                                            good: 'border-blue-500 bg-blue-50',
                                                            questionable: 'border-yellow-500 bg-yellow-50',
                                                            mistake: 'border-orange-500 bg-orange-50',
                                                            blunder: 'border-red-500 bg-red-50',
                                                        };
                                                        const ratingIcons: Record<string, string> = {
                                                            excellent: '♔',
                                                            good: '✓',
                                                            questionable: '?!',
                                                            mistake: '?',
                                                            blunder: '??',
                                                        };
                                                        return (
                                                            <div key={idx} className={`border-l-4 rounded-lg p-4 ${ratingColors[msg.analysis?.rating] || 'border-gray-300 bg-gray-50'}`}>
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <span className="text-lg">{ratingIcons[msg.analysis?.rating] || '?'}</span>
                                                                    <span className="text-sm font-semibold capitalize">{msg.analysis?.rating}</span>
                                                                    <span className="text-xs text-gray-500">Score: {msg.analysis?.score}</span>
                                                                </div>
                                                                <div className="text-sm text-gray-800 mb-2">{msg.content}</div>
                                                                {msg.analysis?.explanation && (
                                                                    <div className="text-xs text-gray-600 mb-2 italic">{msg.analysis.explanation}</div>
                                                                )}
                                                                {msg.analysis?.betterResponse && (
                                                                    <div className="bg-white border border-gray-200 rounded p-2 mt-2">
                                                                        <div className="text-xs font-semibold text-green-700 mb-1">💡 Better Response:</div>
                                                                        <div className="text-sm text-gray-700">{msg.analysis.betterResponse}</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {!details.lead.conversationAnalysis && !analysisData && !analysisLoading && (
                                            <div className="bg-gray-50 rounded-xl p-8 text-center">
                                                <div className="text-5xl mb-4">🏆</div>
                                                <h4 className="text-lg font-semibold text-gray-700 mb-2">No Analysis Yet</h4>
                                                <p className="text-sm text-gray-500 mb-4">
                                                    Click &quot;Run Analysis&quot; to analyze this conversation like a chess engine analyzes games.
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    Analysis runs automatically when leads move to lost/won/closed stages.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}



