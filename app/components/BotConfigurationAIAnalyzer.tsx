'use client';

import { useState, useEffect, useRef } from 'react';
import { Bot, X, Loader2, Check, AlertTriangle, Sparkles, ArrowUp, ArrowDown, Edit2, Trash2, Plus, Target, FileText, MessageSquare, Settings } from 'lucide-react';

interface Conflict {
    type: string;
    component1: string;
    component2: string;
    description: string;
    specificParts: {
        component1: string;
        component2: string;
    };
    suggestions: Array<{
        action: 'edit' | 'remove' | 'add';
        target: string;
        targetId: string | null;
        currentValue: string | null;
        newValue: string | null;
        reason: string;
    }>;
}

interface PromptImprovement {
    target: string;
    targetId: string | null;
    currentPrompt: string;
    improvedPrompt: string;
    reason: string;
}

interface GoalOrdering {
    currentOrder: Array<{ id: string; name: string; priority: number }>;
    suggestedOrder: Array<{ id: string; name: string; newPriority: number; reason: string }>;
    explanation: string;
}

interface BotConfigurationAIAnalyzerProps {
    onClose: () => void;
    onApplySuggestion: (suggestion: any) => void;
    onRefresh: () => void;
}

export default function BotConfigurationAIAnalyzer({
    onClose,
    onApplySuggestion,
    onRefresh,
}: BotConfigurationAIAnalyzerProps) {
    const [loading, setLoading] = useState(false);
    const [analysisType, setAnalysisType] = useState<'full' | 'conflicts' | 'prompts' | 'goal-order'>('full');
    const [conflicts, setConflicts] = useState<Conflict[]>([]);
    const [promptImprovements, setPromptImprovements] = useState<PromptImprovement[]>([]);
    const [goalOrdering, setGoalOrdering] = useState<GoalOrdering | null>(null);
    const [summary, setSummary] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set());
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = 0;
        }
    }, [conflicts, promptImprovements, goalOrdering]);

    const handleAnalyze = async () => {
        setLoading(true);
        setError(null);
        setConflicts([]);
        setPromptImprovements([]);
        setGoalOrdering(null);
        setSummary('');

        try {
            const response = await fetch('/api/ai-bot-configuration-analyzer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ analysisType }),
            });

            const data = await response.json();

            if (data.success) {
                setConflicts(data.conflicts || []);
                setPromptImprovements(data.promptImprovements || []);
                setGoalOrdering(data.goalOrdering || null);
                setSummary(data.summary || 'Analysis completed.');
            } else {
                setError(data.error || 'Failed to analyze configuration');
            }
        } catch (error: any) {
            console.error('Error:', error);
            setError(error?.message || 'Failed to analyze configuration');
        } finally {
            setLoading(false);
        }
    };

    const handleApplySuggestion = async (suggestion: any, suggestionKey: string) => {
        try {
            await onApplySuggestion(suggestion);
            setAppliedSuggestions(prev => new Set([...prev, suggestionKey]));
            
            // Refresh data after applying
            setTimeout(() => {
                onRefresh();
            }, 500);
        } catch (error) {
            console.error('Failed to apply suggestion:', error);
            alert('Failed to apply suggestion. Please try again.');
        }
    };

    const getComponentIcon = (component: string) => {
        switch (component) {
            case 'conversation_flow':
                return <MessageSquare size={16} className="text-blue-600" />;
            case 'bot_goals':
                return <Target size={16} className="text-indigo-600" />;
            case 'bot_rules':
                return <FileText size={16} className="text-teal-600" />;
            case 'conversation_style':
                return <Settings size={16} className="text-yellow-600" />;
            case 'tone_personality':
                return <Bot size={16} className="text-purple-600" />;
            default:
                return <Bot size={16} />;
        }
    };

    const getComponentName = (component: string) => {
        switch (component) {
            case 'conversation_flow':
                return 'Conversation Flow';
            case 'bot_goals':
                return 'Bot Goals';
            case 'bot_rules':
                return 'Bot Rules';
            case 'conversation_style':
                return 'Conversation Style';
            case 'tone_personality':
                return 'Tone & Personality';
            default:
                return component;
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
                            <Sparkles size={24} className="text-white" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 text-lg">AI Configuration Analyzer</h3>
                            <p className="text-xs text-gray-500">Analyze conflicts, improve prompts, optimize goal order</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-gray-600" />
                    </button>
                </div>

                {/* Analysis Type Selector */}
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-gray-700">Analysis Type:</label>
                        <select
                            value={analysisType}
                            onChange={(e) => setAnalysisType(e.target.value as any)}
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-gray-900"
                            disabled={loading}
                        >
                            <option value="full">Full Analysis</option>
                            <option value="conflicts">Conflicts Only</option>
                            <option value="prompts">Prompt Improvements</option>
                            <option value="goal-order">Goal Ordering</option>
                        </select>
                        <button
                            onClick={handleAnalyze}
                            disabled={loading}
                            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={18} />
                                    Analyze Configuration
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div ref={contentRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">
                    {error && (
                        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={20} className="text-red-600" />
                                <span className="font-medium text-red-900">Error: {error}</span>
                            </div>
                        </div>
                    )}

                    {!loading && !error && conflicts.length === 0 && promptImprovements.length === 0 && !goalOrdering && (
                        <div className="text-center py-12">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Sparkles size={32} className="text-gray-400" />
                            </div>
                            <p className="text-gray-500 font-medium">Click "Analyze Configuration" to start</p>
                            <p className="text-sm text-gray-400 mt-2">The AI will analyze all components for conflicts and improvements</p>
                        </div>
                    )}

                    {/* Summary */}
                    {summary && (
                        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4">
                            <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                                <Bot size={18} />
                                Analysis Summary
                            </h4>
                            <p className="text-sm text-blue-800 whitespace-pre-wrap">{summary}</p>
                        </div>
                    )}

                    {/* Conflicts */}
                    {conflicts.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <AlertTriangle size={20} className="text-red-600" />
                                Conflicts Detected ({conflicts.length})
                            </h3>
                            {conflicts.map((conflict, index) => (
                                <div key={index} className="bg-white border-2 border-red-200 rounded-xl p-5 shadow-sm">
                                    <div className="mb-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded">
                                                {conflict.type.replace(/_/g, ' ').toUpperCase()}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-700 mb-3">{conflict.description}</p>
                                        <div className="grid md:grid-cols-2 gap-3 mb-4">
                                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {getComponentIcon(conflict.component1)}
                                                    <span className="text-xs font-semibold text-gray-600">
                                                        {getComponentName(conflict.component1)}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-700 italic">
                                                    "{conflict.specificParts.component1}"
                                                </p>
                                            </div>
                                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {getComponentIcon(conflict.component2)}
                                                    <span className="text-xs font-semibold text-gray-600">
                                                        {getComponentName(conflict.component2)}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-700 italic">
                                                    "{conflict.specificParts.component2}"
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <h5 className="text-sm font-semibold text-gray-900">Suggestions:</h5>
                                        {conflict.suggestions.map((suggestion, sIndex) => {
                                            const suggestionKey = `conflict-${index}-suggestion-${sIndex}`;
                                            const isApplied = appliedSuggestions.has(suggestionKey);
                                            return (
                                                <div
                                                    key={sIndex}
                                                    className={`p-3 rounded-lg border ${
                                                        suggestion.action === 'edit'
                                                            ? 'bg-yellow-50 border-yellow-200'
                                                            : suggestion.action === 'remove'
                                                            ? 'bg-red-50 border-red-200'
                                                            : 'bg-green-50 border-green-200'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between mb-2">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                {suggestion.action === 'edit' && <Edit2 size={14} className="text-yellow-600" />}
                                                                {suggestion.action === 'remove' && <Trash2 size={14} className="text-red-600" />}
                                                                {suggestion.action === 'add' && <Plus size={14} className="text-green-600" />}
                                                                <span className="text-xs font-semibold text-gray-700">
                                                                    {suggestion.action.toUpperCase()}: {getComponentName(suggestion.target)}
                                                                </span>
                                                            </div>
                                                            {suggestion.currentValue && (
                                                                <p className="text-xs text-gray-600 mb-1">
                                                                    <span className="font-medium">Current:</span> {suggestion.currentValue}
                                                                </p>
                                                            )}
                                                            {suggestion.newValue && (
                                                                <p className="text-xs text-gray-800">
                                                                    <span className="font-medium">New:</span> {suggestion.newValue}
                                                                </p>
                                                            )}
                                                            <p className="text-xs text-gray-500 mt-1 italic">{suggestion.reason}</p>
                                                        </div>
                                                        {!isApplied && (
                                                            <button
                                                                onClick={() => handleApplySuggestion(suggestion, suggestionKey)}
                                                                className="ml-3 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1"
                                                            >
                                                                <Check size={14} />
                                                                Apply
                                                            </button>
                                                        )}
                                                        {isApplied && (
                                                            <span className="ml-3 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg flex items-center gap-1">
                                                                <Check size={14} />
                                                                Applied
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Prompt Improvements */}
                    {promptImprovements.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <Sparkles size={20} className="text-purple-600" />
                                Prompt Improvements ({promptImprovements.length})
                            </h3>
                            {promptImprovements.map((improvement, index) => {
                                const suggestionKey = `prompt-${index}`;
                                const isApplied = appliedSuggestions.has(suggestionKey);
                                return (
                                    <div key={index} className="bg-white border-2 border-purple-200 rounded-xl p-5 shadow-sm">
                                        <div className="flex items-center gap-2 mb-3">
                                            {getComponentIcon(improvement.target)}
                                            <span className="font-semibold text-gray-900">
                                                {getComponentName(improvement.target)}
                                            </span>
                                        </div>
                                        <div className="grid md:grid-cols-2 gap-4 mb-4">
                                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                <p className="text-xs font-semibold text-gray-600 mb-2">Current Prompt:</p>
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{improvement.currentPrompt}</p>
                                            </div>
                                            <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                                                <p className="text-xs font-semibold text-green-700 mb-2">Improved Prompt:</p>
                                                <p className="text-sm text-gray-800 whitespace-pre-wrap">{improvement.improvedPrompt}</p>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 italic mb-3">{improvement.reason}</p>
                                        {!isApplied && (
                                            <button
                                                onClick={() => handleApplySuggestion(improvement, suggestionKey)}
                                                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                                            >
                                                <Check size={16} />
                                                Apply Improvement
                                            </button>
                                        )}
                                        {isApplied && (
                                            <span className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg flex items-center gap-2 inline-block">
                                                <Check size={16} />
                                                Applied
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Goal Ordering */}
                    {goalOrdering && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <Target size={20} className="text-indigo-600" />
                                Goal Ordering Optimization
                            </h3>
                            <div className="bg-white border-2 border-indigo-200 rounded-xl p-5 shadow-sm">
                                <p className="text-sm text-gray-700 mb-4">{goalOrdering.explanation}</p>
                                <div className="grid md:grid-cols-2 gap-4 mb-4">
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                        <p className="text-xs font-semibold text-gray-600 mb-3">Current Order:</p>
                                        <div className="space-y-2">
                                            {goalOrdering.currentOrder.map((goal, index) => (
                                                <div key={goal.id} className="flex items-center gap-2 text-sm">
                                                    <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold">
                                                        {index + 1}
                                                    </span>
                                                    <span className="text-gray-700">{goal.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                                        <p className="text-xs font-semibold text-indigo-700 mb-3">Suggested Order:</p>
                                        <div className="space-y-2">
                                            {goalOrdering.suggestedOrder.map((goal, index) => (
                                                <div key={goal.id} className="flex items-center gap-2 text-sm">
                                                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                                                        {index + 1}
                                                    </span>
                                                    <span className="text-gray-800">{goal.name}</span>
                                                    <span className="text-xs text-indigo-600 italic ml-auto">
                                                        {goal.reason}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                {!appliedSuggestions.has('goal-ordering') && (
                                    <button
                                        onClick={() => {
                                            handleApplySuggestion({ target: 'goal_ordering', suggestedOrder: goalOrdering.suggestedOrder }, 'goal-ordering');
                                        }}
                                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                                    >
                                        <Check size={16} />
                                        Apply Goal Ordering
                                    </button>
                                )}
                                {appliedSuggestions.has('goal-ordering') && (
                                    <span className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg flex items-center gap-2 inline-block">
                                        <Check size={16} />
                                        Applied
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}



