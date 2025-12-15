'use client';

import { useState } from 'react';
import { MessageSquare, Send, Loader2, Bot, User, RefreshCw } from 'lucide-react';

interface FollowUpMessageTesterProps {
    botName?: string;
    botTone?: string;
}

export default function FollowUpMessageTester({ botName = 'Assistant', botTone = 'helpful and professional' }: FollowUpMessageTesterProps) {
    const [scenario, setScenario] = useState('');
    const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
    const [testMessage, setTestMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [messageMode, setMessageMode] = useState<'custom' | 'ai'>('ai');
    const [customMessage, setCustomMessage] = useState('');

    const handleTestFollowUp = async () => {
        if (!scenario.trim() && !testMessage.trim()) {
            alert('Please enter a scenario or test message');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/test/follow-up-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scenario: scenario || testMessage,
                    conversationHistory,
                    messageMode,
                    customMessage: messageMode === 'custom' ? customMessage : undefined,
                }),
            });

            const data = await response.json();
            
            if (data.success && data.message) {
                // Add to conversation history
                if (scenario || testMessage) {
                    setConversationHistory(prev => [
                        ...prev,
                        { role: 'user', content: scenario || testMessage },
                        { role: 'assistant', content: data.message },
                    ]);
                } else {
                    setConversationHistory(prev => [
                        ...prev,
                        { role: 'assistant', content: data.message },
                    ]);
                }
                setScenario('');
                setTestMessage('');
            } else {
                alert(data.error || 'Failed to generate follow-up message');
            }
        } catch (error) {
            console.error('Error testing follow-up:', error);
            alert('Failed to test follow-up message');
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        setConversationHistory([]);
        setScenario('');
        setTestMessage('');
        setCustomMessage('');
    };

    return (
        <div className="bg-white rounded-[24px] p-8 border border-gray-200/60 shadow-sm">
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                        <MessageSquare size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-medium text-gray-900">Test Follow-Up Messages</h3>
                        <p className="text-sm text-gray-500">Preview how your bot will respond in follow-up scenarios</p>
                    </div>
                </div>
            </div>

            {/* Message Mode Selection */}
            <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 mb-2 block">Message Mode</label>
                <div className="flex gap-2">
                    <button
                        onClick={() => setMessageMode('ai')}
                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            messageMode === 'ai'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-gray-50 text-gray-600 border border-gray-200'
                        }`}
                    >
                        AI Generated
                    </button>
                    <button
                        onClick={() => setMessageMode('custom')}
                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            messageMode === 'custom'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-gray-50 text-gray-600 border border-gray-200'
                        }`}
                    >
                        Custom Message
                    </button>
                </div>
            </div>

            {/* Custom Message Input */}
            {messageMode === 'custom' && (
                <div className="mb-4">
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Custom Message Text</label>
                    <textarea
                        value={customMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
                        placeholder="Enter the exact message to send..."
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-900 resize-y min-h-[80px]"
                    />
                </div>
            )}

            {/* Scenario Input */}
            <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                    {messageMode === 'ai' ? 'Scenario or User Message' : 'Test Scenario (Optional)'}
                </label>
                <textarea
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                    placeholder={messageMode === 'ai' 
                        ? 'E.g., "Customer asked about pricing but didn\'t reply for 2 days"' 
                        : 'Optional: Describe the scenario for context'}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-900 resize-y min-h-[80px]"
                />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={handleTestFollowUp}
                    disabled={loading || (messageMode === 'custom' && !customMessage.trim())}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                    {loading ? (
                        <>
                            <Loader2 size={18} className="animate-spin" />
                            <span>Generating...</span>
                        </>
                    ) : (
                        <>
                            <Send size={18} />
                            <span>Test Follow-Up</span>
                        </>
                    )}
                </button>
                {conversationHistory.length > 0 && (
                    <button
                        onClick={handleClear}
                        className="px-4 py-3 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
                        title="Clear conversation"
                    >
                        <RefreshCw size={18} />
                    </button>
                )}
            </div>

            {/* Conversation Preview */}
            {conversationHistory.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                        <div className="flex items-center gap-2">
                            <Bot size={16} className="text-gray-600" />
                            <span className="text-sm font-medium text-gray-700">Conversation Preview</span>
                        </div>
                    </div>
                    <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto bg-gray-50">
                        {conversationHistory.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {msg.role === 'assistant' && (
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                        <Bot size={16} className="text-blue-600" />
                                    </div>
                                )}
                                <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                                        msg.role === 'user'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-white text-gray-900 border border-gray-200'
                                    }`}
                                >
                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                </div>
                                {msg.role === 'user' && (
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                                        <User size={16} className="text-gray-600" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {conversationHistory.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                    <MessageSquare size={48} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium mb-1">No messages yet</p>
                    <p className="text-sm text-gray-400">Enter a scenario and click "Test Follow-Up" to see how your bot responds</p>
                </div>
            )}
        </div>
    );
}



