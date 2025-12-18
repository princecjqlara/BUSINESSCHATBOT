'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Loader2, Check, Copy, Sparkles, Settings } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface DiffSegment {
    type: 'added' | 'removed' | 'unchanged';
    text: string;
}

interface ConversationStyleAIAssistantProps {
    currentInstructions: string;
    onApplySuggestion: (editedInstructions: string) => void;
    onClose: () => void;
    onPreviewContentChange?: (content: string | undefined) => void;
}

export default function ConversationStyleAIAssistant({
    currentInstructions,
    onApplySuggestion,
    onClose,
    onPreviewContentChange,
}: ConversationStyleAIAssistantProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [suggestedEdit, setSuggestedEdit] = useState<string | null>(null);
    const [diff, setDiff] = useState<DiffSegment[]>([]);
    const [customPrompt, setCustomPrompt] = useState('');
    const [showCustomPrompt, setShowCustomPrompt] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        // Initialize with welcome message
        setMessages([{
            role: 'assistant',
            content: `Hi! I'm your AI Conversation Style Assistant. I can help you write and edit conversation style instructions for your chatbot.\n\n✨ I have full context about your bot:\n- Bot personality and tone\n- All bot rules and guidelines\n- Knowledge base content\n- Current bot instructions\n- 🌐 Web search access for current best practices\n\nThis means I'll help you create conversation style instructions that are consistent with your bot's style and knowledge!\n\nWhat would you like me to do?\n\nExamples:\n- "Write conversation style instructions for a friendly Filipino salesperson"\n- "Make the instructions more professional"\n- "Add guidance about using emojis"\n- "Remove the part about multiple choice questions"\n- "Search for best practices on chatbot conversation styles"\n- "Ensure instructions align with bot rules"\n- "Make it more concise"`,
            timestamp: new Date(),
        }]);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, suggestedEdit]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMessage: Message = {
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        const currentInput = input.trim();
        setInput('');
        setLoading(true);
        setSuggestedEdit(null);
        setDiff([]);

        try {
            const response = await fetch('/api/ai-conversation-style-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentInstructions: currentInstructions || '',
                    userPrompt: currentInput,
                    conversationHistory: messages.map(m => ({
                        role: m.role,
                        content: m.content,
                    })),
                    customPrompt: customPrompt.trim() || undefined,
                }),
            });

            const data = await response.json();

            if (data.success) {
                const assistantMessage: Message = {
                    role: 'assistant',
                    content: data.explanation || 'I\'ve analyzed and edited your conversation style instructions. Here\'s what I changed:',
                    timestamp: new Date(),
                };

                setMessages(prev => [...prev, assistantMessage]);
                setSuggestedEdit(data.editedInstructions);
                setDiff(data.diff || []);
                
                // Notify parent component about preview content (unapplied edit)
                if (onPreviewContentChange) {
                    onPreviewContentChange(data.editedInstructions);
                }
            } else {
                const errorMessage: Message = {
                    role: 'assistant',
                    content: `Sorry, I encountered an error: ${data.error || 'Failed to process your request'}`,
                    timestamp: new Date(),
                };
                setMessages(prev => [...prev, errorMessage]);
            }
        } catch (error) {
            console.error('Error:', error);
            const errorMessage: Message = {
                role: 'assistant',
                content: 'Sorry, I encountered an error processing your request. Please try again.',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    };

    const handleApply = () => {
        if (suggestedEdit) {
            onApplySuggestion(suggestedEdit);
            setSuggestedEdit(null);
            setDiff([]);
            
            // Clear preview content when changes are applied
            if (onPreviewContentChange) {
                onPreviewContentChange(undefined);
            }
            
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '✅ Applied! The changes have been applied to your conversation style instructions.',
                timestamp: new Date(),
            }]);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Render diff with highlighting
    const renderDiff = (text: string, diffSegments: DiffSegment[]) => {
        if (!diffSegments || diffSegments.length === 0) {
            return <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">{text}</pre>;
        }

        return (
            <div className="space-y-1">
                {diffSegments.map((segment, index) => {
                    if (segment.type === 'unchanged') {
                        return (
                            <div key={index} className="text-sm text-gray-800 whitespace-pre-wrap font-sans">
                                {segment.text}
                            </div>
                        );
                    } else if (segment.type === 'added') {
                        return (
                            <div key={index} className="text-sm bg-green-100 text-green-900 whitespace-pre-wrap font-sans border-l-4 border-green-500 pl-2 py-1">
                                + {segment.text}
                            </div>
                        );
                    } else if (segment.type === 'removed') {
                        return (
                            <div key={index} className="text-sm bg-red-100 text-red-900 whitespace-pre-wrap font-sans border-l-4 border-red-500 pl-2 py-1 line-through opacity-70">
                                - {segment.text}
                            </div>
                        );
                    }
                    return null;
                })}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-yellow-50 to-orange-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                            <Sparkles size={20} className="text-white" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">AI Conversation Style Assistant</h3>
                            <p className="text-xs text-gray-500">Powered by GPT OSS 120B • Web Access Enabled</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-gray-600" />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                    {messages.map((message, index) => (
                        <div
                            key={index}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                                    message.role === 'user'
                                        ? 'bg-yellow-600 text-white'
                                        : 'bg-white border border-gray-200 text-gray-900'
                                }`}
                            >
                                <div className="flex items-start gap-2">
                                    {message.role === 'assistant' && (
                                        <Bot size={18} className="flex-shrink-0 mt-0.5 text-yellow-600" />
                                    )}
                                    <div className={`flex-1 whitespace-pre-wrap leading-relaxed ${
                                        message.role === 'user' ? 'text-base font-medium' : 'text-base font-normal'
                                    }`}>
                                        {message.content}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <Loader2 size={18} className="animate-spin text-yellow-600" />
                                    <span className="text-sm text-gray-600">Analyzing and editing conversation style instructions...</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {suggestedEdit && (
                        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Check size={18} className="text-green-600" />
                                    <h4 className="font-semibold text-green-900">Suggested Edit</h4>
                                </div>
                                <button
                                    onClick={() => navigator.clipboard.writeText(suggestedEdit)}
                                    className="p-1.5 hover:bg-green-200 rounded-lg transition-colors"
                                    title="Copy to clipboard"
                                >
                                    <Copy size={16} className="text-green-700" />
                                </button>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-green-200 max-h-64 overflow-y-auto">
                                {diff.length > 0 ? (
                                    renderDiff(suggestedEdit, diff)
                                ) : (
                                    <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">
                                        {suggestedEdit}
                                    </pre>
                                )}
                            </div>
                            <button
                                onClick={handleApply}
                                className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <Check size={16} />
                                Apply Changes to Instructions
                            </button>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Custom Prompt Section */}
                {showCustomPrompt && (
                    <div className="px-4 pt-2 border-t border-gray-200 bg-gray-50">
                        <div className="mb-2">
                            <label className="text-xs font-medium text-gray-700 mb-1 block">
                                Custom Instruction for AI (Optional)
                            </label>
                            <textarea
                                value={customPrompt}
                                onChange={(e) => setCustomPrompt(e.target.value)}
                                placeholder="E.g., 'Focus on making instructions concise' or 'Prioritize user engagement'..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-600 resize-none bg-white text-gray-900 placeholder:text-gray-500 text-sm"
                                rows={2}
                            />
                        </div>
                    </div>
                )}

                {/* Input */}
                <div className="p-4 border-t border-gray-200 bg-white">
                    <div className="flex items-end gap-2 mb-2">
                        <button
                            onClick={() => setShowCustomPrompt(!showCustomPrompt)}
                            className={`p-2 rounded-lg transition-colors ${
                                showCustomPrompt 
                                    ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' 
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                            title="Toggle custom prompt"
                        >
                            <Settings size={18} />
                        </button>
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Tell me what you'd like me to do with your conversation style instructions..."
                            className="flex-1 px-4 py-3 border-2 border-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-600 resize-none bg-white text-gray-900 placeholder:text-gray-600 text-lg font-medium"
                            rows={3}
                            disabled={loading}
                            style={{ 
                                minHeight: '70px',
                                color: '#111827',
                                fontSize: '16px',
                                lineHeight: '1.5'
                            }}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || loading}
                            className="px-6 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 text-white rounded-xl hover:from-yellow-700 hover:to-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-md"
                        >
                            {loading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Send size={18} />
                            )}
                            Send
                        </button>
                    </div>
                    <p className="text-xs text-gray-600 font-medium">
                        Press Enter to send, Shift+Enter for new line
                        {customPrompt && showCustomPrompt && ' • Custom prompt active'}
                    </p>
                </div>
            </div>
        </div>
    );
}







