'use client';

import { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, FileText, Bot, BookOpen, Plus, ArrowRight, X, Trash2, MessageSquare, CheckSquare, Square, Layers } from 'lucide-react';

interface StyleSuggestion {
    type: 'rule' | 'instruction' | 'knowledge' | 'personality';
    title: string;
    content: string;
    reason: string;
    priority?: number;
    variations?: string[]; // Alternative versions of the suggestion
    details?: string; // More detailed explanation
    examples?: string[]; // Example use cases
    impact?: string; // Expected impact on bot behavior
}

type MessageType = 'followup' | 'messaging';

interface BotStyleAnalyzerProps {
    onSuggestionApplied?: () => void; // Callback to refresh parent component data
}

export default function BotStyleAnalyzer({ onSuggestionApplied }: BotStyleAnalyzerProps = {}) {
    const [sampleMessages, setSampleMessages] = useState<string[]>(['']);
    const [messageType, setMessageType] = useState<MessageType>('messaging');
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<StyleSuggestion[]>([]);
    const [applied, setApplied] = useState<Set<string>>(new Set());
    const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
    const [bulkMode, setBulkMode] = useState(false);
    const [applyingBulk, setApplyingBulk] = useState(false);

    const handleAddSample = () => {
        setSampleMessages([...sampleMessages, '']);
    };

    const handleRemoveSample = (index: number) => {
        if (sampleMessages.length > 1) {
            setSampleMessages(sampleMessages.filter((_, i) => i !== index));
        }
    };

    const handleSampleChange = (index: number, value: string) => {
        const updated = [...sampleMessages];
        updated[index] = value;
        setSampleMessages(updated);
    };

    const handleAnalyze = async () => {
        const validMessages = sampleMessages.filter(msg => msg.trim().length > 0);

        if (validMessages.length === 0) {
            alert('Please enter at least one desired bot reply or follow-up message');
            return;
        }

        setLoading(true);
        setSuggestions([]);
        setApplied(new Set());
        setSelectedSuggestions(new Set());
        setBulkMode(false);

        try {
            const response = await fetch('/api/analyze-bot-style', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    desiredMessages: validMessages,
                    messageCount: validMessages.length,
                    messageType: messageType
                }),
            });

            const data = await response.json();

            if (data.success && data.suggestions) {
                setSuggestions(data.suggestions);
            } else {
                alert(data.error || 'Failed to analyze message style');
            }
        } catch (error) {
            console.error('Error analyzing style:', error);
            alert('Failed to analyze message style');
        } finally {
            setLoading(false);
        }
    };

    const toggleSuggestionSelection = (index: number) => {
        const newSelected = new Set(selectedSuggestions);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
        }
        setSelectedSuggestions(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedSuggestions.size === suggestions.length) {
            setSelectedSuggestions(new Set());
        } else {
            setSelectedSuggestions(new Set(suggestions.map((_, i) => i)));
        }
    };

    const handleApplySuggestion = async (suggestion: StyleSuggestion, index: number, variationIndex?: number) => {
        try {
            // Use variation if specified, otherwise use main content
            const contentToApply = variationIndex !== undefined && suggestion.variations && suggestion.variations[variationIndex]
                ? suggestion.variations[variationIndex]
                : suggestion.content;

            const suggestionToApply = {
                ...suggestion,
                content: contentToApply,
            };

            const response = await fetch('/api/apply-style-suggestion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suggestion: suggestionToApply }),
            });

            const data = await response.json();

            if (data.success) {
                setApplied(new Set([...applied, index.toString()]));

                // Show success message with type label
                const typeLabel = suggestion.type === 'rule'
                    ? 'Bot Settings'
                    : suggestion.type === 'instruction'
                        ? 'Instructions'
                        : suggestion.type === 'knowledge'
                            ? 'Knowledge Base'
                            : 'Personality Settings';

                alert(`✅ Successfully added to ${typeLabel}!`);

                // Mark as applied - no page reload to preserve user input
                // Notify parent component to refresh if needed
                if (onSuggestionApplied) {
                    onSuggestionApplied();
                }
            } else {
                alert(`❌ Error: ${data.error || 'Failed to apply suggestion'}`);
            }
        } catch (error) {
            console.error('Error applying suggestion:', error);
            alert('❌ Failed to apply suggestion. Please check the console for details.');
        }
    };

    const handleApplyBulk = async () => {
        if (selectedSuggestions.size === 0) {
            alert('Please select at least one suggestion to apply');
            return;
        }

        setApplyingBulk(true);
        const selectedIndices = Array.from(selectedSuggestions);
        let successCount = 0;
        let errorCount = 0;
        const appliedIndices = new Set<string>();

        try {
            // Apply suggestions sequentially to avoid conflicts
            for (const index of selectedIndices) {
                const suggestion = suggestions[index];
                if (!suggestion || applied.has(index.toString())) {
                    continue;
                }

                try {
                    const suggestionToApply = {
                        ...suggestion,
                        content: suggestion.content,
                    };

                    const response = await fetch('/api/apply-style-suggestion', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ suggestion: suggestionToApply }),
                    });

                    const data = await response.json();

                    if (data.success) {
                        successCount++;
                        appliedIndices.add(index.toString());
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    console.error(`Error applying suggestion ${index}:`, error);
                    errorCount++;
                }
            }

            // Update applied set
            setApplied(new Set([...applied, ...Array.from(appliedIndices)]));
            setSelectedSuggestions(new Set());

            // Show summary
            if (successCount > 0) {
                alert(`✅ Successfully applied ${successCount} suggestion${successCount !== 1 ? 's' : ''}${errorCount > 0 ? `\n❌ ${errorCount} failed` : ''}`);

                // Clear selection after successful apply - no page reload to preserve user input
                setSelectedSuggestions(new Set());

                // Notify parent component to refresh if needed
                if (onSuggestionApplied) {
                    onSuggestionApplied();
                }
            } else {
                alert(`❌ Failed to apply suggestions. Please try again.`);
            }
        } catch (error) {
            console.error('Error in bulk apply:', error);
            alert('❌ Failed to apply suggestions. Please check the console for details.');
        } finally {
            setApplyingBulk(false);
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'rule':
                return <Bot size={18} className="text-blue-600" />;
            case 'instruction':
                return <FileText size={18} className="text-green-600" />;
            case 'knowledge':
                return <BookOpen size={18} className="text-purple-600" />;
            case 'personality':
                return <Sparkles size={18} className="text-orange-600" />;
            default:
                return <FileText size={18} />;
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'rule':
                return 'Bot Rule';
            case 'instruction':
                return 'Instruction';
            case 'knowledge':
                return 'Knowledge Base';
            case 'personality':
                return 'Personality';
            default:
                return type;
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'rule':
                return 'bg-blue-50 border-blue-200 text-blue-700';
            case 'instruction':
                return 'bg-green-50 border-green-200 text-green-700';
            case 'knowledge':
                return 'bg-purple-50 border-purple-200 text-purple-700';
            case 'personality':
                return 'bg-orange-50 border-orange-200 text-orange-700';
            default:
                return 'bg-gray-50 border-gray-200 text-gray-700';
        }
    };

    return (
        <div className="bg-white rounded-[24px] p-8 border border-gray-200/60 shadow-sm">
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gradient-to-br from-purple-50 to-blue-50 text-purple-600 rounded-xl">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-medium text-gray-900">Bot Style Analyzer</h3>
                        <p className="text-sm text-gray-500">Input multiple sample bot replies, and AI will analyze the style patterns to create comprehensive prompts and suggestions</p>
                    </div>
                </div>
            </div>

            {/* Message Type Selection */}
            <div className="mb-6">
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Message Type
                </label>
                <div className="flex gap-2">
                    <button
                        onClick={() => setMessageType('messaging')}
                        className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${messageType === 'messaging'
                                ? 'bg-purple-50 text-purple-700 border-2 border-purple-300 shadow-sm'
                                : 'bg-gray-50 text-gray-600 border-2 border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <MessageSquare size={16} />
                            <span>Regular Messaging</span>
                        </div>
                    </button>
                    <button
                        onClick={() => setMessageType('followup')}
                        className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${messageType === 'followup'
                                ? 'bg-blue-50 text-blue-700 border-2 border-blue-300 shadow-sm'
                                : 'bg-gray-50 text-gray-600 border-2 border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <ArrowRight size={16} />
                            <span>Follow-Up Messages</span>
                        </div>
                    </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                    {messageType === 'followup'
                        ? 'These are follow-up messages sent after initial contact or when re-engaging customers'
                        : 'These are regular conversation messages during active chats'}
                </p>
            </div>

            {/* Input Section */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-gray-700">
                        Sample Bot {messageType === 'followup' ? 'Follow-Up' : ''} Messages
                    </label>
                    <button
                        onClick={handleAddSample}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
                    >
                        <Plus size={14} />
                        <span>Add Sample</span>
                    </button>
                </div>

                <div className="space-y-3">
                    {sampleMessages.map((message, index) => (
                        <div key={index} className="relative">
                            <div className="flex items-start gap-2">
                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-semibold mt-2">
                                    {index + 1}
                                </div>
                                <div className="flex-1">
                                    <textarea
                                        value={message}
                                        onChange={(e) => handleSampleChange(index, e.target.value)}
                                        placeholder={messageType === 'followup'
                                            ? `Sample ${index + 1}: E.g., 'Hey! 👋 Just following up - did you have any questions about our products? I'm here to help!'`
                                            : `Sample ${index + 1}: E.g., 'Hey! 👋 Saw you checking us out. Quick question - what caught your attention? We have some great deals right now!'`}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-gray-900 resize-y min-h-[100px]"
                                    />
                                </div>
                                {sampleMessages.length > 1 && (
                                    <button
                                        onClick={() => handleRemoveSample(index)}
                                        className="flex-shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors mt-2"
                                        title="Remove this sample"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <p className="text-xs text-gray-500 mt-3">
                    Enter multiple examples of how you want your bot to respond {messageType === 'followup' ? 'in follow-up scenarios' : 'during regular conversations'}. AI will analyze all samples together to better understand the style and create comprehensive rules, instructions, or knowledge base entries.
                </p>
            </div>

            {/* Analyze Button */}
            <button
                onClick={handleAnalyze}
                disabled={loading || sampleMessages.every(msg => !msg.trim())}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
            >
                {loading ? (
                    <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Analyzing Style...</span>
                    </>
                ) : (
                    <>
                        <Sparkles size={18} />
                        <span>Analyze & Generate Suggestions</span>
                    </>
                )}
            </button>

            {/* Suggestions Section */}
            {suggestions.length > 0 && (
                <div className="mt-8 space-y-4">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 size={18} className="text-green-600" />
                            <h4 className="text-sm font-medium text-gray-900">
                                AI Generated {suggestions.length} Suggestion{suggestions.length !== 1 ? 's' : ''}
                            </h4>
                            {bulkMode && (
                                <span className="text-xs text-gray-500">
                                    ({selectedSuggestions.size} selected)
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {bulkMode && (
                                <button
                                    onClick={toggleSelectAll}
                                    className="text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 px-2 py-1 rounded transition-colors"
                                >
                                    {selectedSuggestions.size === suggestions.length ? 'Deselect All' : 'Select All'}
                                </button>
                            )}
                            <button
                                onClick={() => setBulkMode(!bulkMode)}
                                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${bulkMode
                                        ? 'bg-purple-100 text-purple-700 border border-purple-300'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                <Layers size={14} />
                                <span>Bulk Mode</span>
                            </button>
                            {bulkMode && selectedSuggestions.size > 0 && (
                                <button
                                    onClick={handleApplyBulk}
                                    disabled={applyingBulk}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {applyingBulk ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            <span>Applying...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Plus size={14} />
                                            <span>Apply {selectedSuggestions.size}</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>

                    {suggestions.map((suggestion, index) => (
                        <div
                            key={index}
                            className={`border-2 rounded-xl p-5 transition-all ${applied.has(index.toString())
                                    ? 'bg-green-50 border-green-300'
                                    : selectedSuggestions.has(index)
                                        ? 'bg-purple-50 border-purple-300'
                                        : 'bg-white border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-4 mb-3">
                                <div className="flex items-center gap-3 flex-1">
                                    {bulkMode && !applied.has(index.toString()) && (
                                        <button
                                            onClick={() => toggleSuggestionSelection(index)}
                                            className="flex-shrink-0 p-1 hover:bg-gray-100 rounded transition-colors"
                                        >
                                            {selectedSuggestions.has(index) ? (
                                                <CheckSquare size={20} className="text-purple-600" />
                                            ) : (
                                                <Square size={20} className="text-gray-400" />
                                            )}
                                        </button>
                                    )}
                                    <div className={`p-2 rounded-lg border ${getTypeColor(suggestion.type)}`}>
                                        {getTypeIcon(suggestion.type)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                                {getTypeLabel(suggestion.type)}
                                            </span>
                                            {suggestion.priority && (
                                                <span className="text-xs text-gray-500">
                                                    Priority: {suggestion.priority}
                                                </span>
                                            )}
                                        </div>
                                        <h5 className="font-medium text-gray-900">{suggestion.title}</h5>
                                    </div>
                                </div>
                                {applied.has(index.toString()) && (
                                    <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
                                )}
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4 mb-3 border border-gray-100">
                                <p className="text-sm text-gray-700 whitespace-pre-wrap font-mono mb-2">
                                    {suggestion.content}
                                </p>
                                {suggestion.details && (
                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                        <p className="text-xs text-gray-600 leading-relaxed">
                                            <span className="font-semibold text-gray-700">Details:</span> {suggestion.details}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Variations */}
                            {suggestion.variations && suggestion.variations.length > 0 && (
                                <div className="bg-purple-50/50 rounded-lg p-3 mb-3 border border-purple-100">
                                    <p className="text-xs font-semibold text-purple-700 mb-2">Variations (Alternative Options):</p>
                                    <ul className="space-y-2">
                                        {suggestion.variations.map((variation, vIdx) => (
                                            <li key={vIdx} className="group">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-xs text-purple-800 pl-3 border-l-2 border-purple-300 flex-1 py-1">
                                                        {variation}
                                                    </span>
                                                    {!applied.has(index.toString()) && (
                                                        <button
                                                            onClick={() => handleApplySuggestion(suggestion, index, vIdx)}
                                                            className="opacity-0 group-hover:opacity-100 px-2 py-1 text-xs text-purple-700 hover:text-purple-900 hover:bg-purple-100 rounded transition-all"
                                                            title="Apply this variation"
                                                        >
                                                            Apply
                                                        </button>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Examples */}
                            {suggestion.examples && suggestion.examples.length > 0 && (
                                <div className="bg-green-50/50 rounded-lg p-3 mb-3 border border-green-100">
                                    <p className="text-xs font-semibold text-green-700 mb-2">Example Use Cases:</p>
                                    <ul className="space-y-1.5">
                                        {suggestion.examples.map((example, eIdx) => (
                                            <li key={eIdx} className="text-xs text-green-800 flex items-start gap-2">
                                                <span className="text-green-600 mt-0.5">•</span>
                                                <span>{example}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Impact */}
                            {suggestion.impact && (
                                <div className="bg-orange-50/50 rounded-lg p-3 mb-3 border border-orange-100">
                                    <p className="text-xs text-orange-800">
                                        <span className="font-semibold">Expected Impact:</span> {suggestion.impact}
                                    </p>
                                </div>
                            )}

                            <div className="bg-blue-50 rounded-lg p-3 mb-4 border border-blue-100">
                                <p className="text-xs text-blue-800">
                                    <span className="font-semibold">Why:</span> {suggestion.reason}
                                </p>
                            </div>

                            {!applied.has(index.toString()) && (
                                <button
                                    onClick={() => handleApplySuggestion(suggestion, index)}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                                >
                                    <Plus size={16} />
                                    <span>Apply to {getTypeLabel(suggestion.type)}</span>
                                    <ArrowRight size={16} />
                                </button>
                            )}

                            {applied.has(index.toString()) && (
                                <div className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                                    <CheckCircle2 size={16} />
                                    <span>Applied to {getTypeLabel(suggestion.type)}</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Empty State */}
            {suggestions.length === 0 && !loading && (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50 mt-6">
                    <Sparkles size={48} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium mb-1">No suggestions yet</p>
                    <p className="text-sm text-gray-400">Enter your desired bot replies (multiple samples recommended) and click "Analyze & Generate Suggestions"</p>
                </div>
            )}
        </div>
    );
}

