'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Loader2, Check, Copy, Sparkles } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface DocumentAIAssistantProps {
    documentText: string;
    documentName?: string;
    onApplySuggestion: (editedText: string) => void;
    onClose: () => void;
    onPreviewContentChange?: (content: string | undefined) => void; // Callback to notify parent of preview content
}

export default function DocumentAIAssistant({
    documentText,
    documentName,
    onApplySuggestion,
    onClose,
    onPreviewContentChange,
}: DocumentAIAssistantProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [suggestedEdit, setSuggestedEdit] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        // Initialize with welcome message
        setMessages([{
            role: 'assistant',
            content: `Hi! I'm your AI document assistant. I can help you improve, edit, or rewrite your document "${documentName || 'Untitled'}".\n\n✨ I have full context about your bot:\n- Bot personality and tone\n- Bot rules and guidelines\n- Knowledge base content\n- Bot instructions\n- 🌐 Web search access for current information\n\nThis means I'll edit your document to be consistent with your bot's style and knowledge, and I can search the web for current information when needed!\n\nWhat would you like me to do?\n\nExamples:\n- "Make this more professional"\n- "Fix grammar and spelling"\n- "Expand on the second paragraph"\n- "Make it shorter and more concise"\n- "Add current pricing information" (I'll search the web!)\n- "Update with latest statistics"\n- "Search for current market trends"\n- "Make this align with bot rules"\n- "Ensure this matches bot tone"`,
            timestamp: new Date(),
        }]);
    }, [documentName]);

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
        setInput('');
        setLoading(true);
        setSuggestedEdit(null);

        try {
            const response = await fetch('/api/ai-document-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    documentText: documentText || '', // Ensure it's always a string
                    documentName: documentName || 'Untitled Document',
                    userPrompt: input.trim(),
                    conversationHistory: messages.map(m => ({
                        role: m.role,
                        content: m.content,
                    })),
                }),
            });

            const data = await response.json();

            if (data.success) {
                const assistantMessage: Message = {
                    role: 'assistant',
                    content: data.explanation || 'I\'ve analyzed and edited your document. Here\'s what I changed:',
                    timestamp: new Date(),
                };

                setMessages(prev => [...prev, assistantMessage]);
                setSuggestedEdit(data.editedText);
                
                // Notify parent component about preview content (unapplied edit)
                if (onPreviewContentChange) {
                    onPreviewContentChange(data.editedText);
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
            
            // Clear preview content when changes are applied
            if (onPreviewContentChange) {
                onPreviewContentChange(undefined);
            }
            
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '✅ Applied! The changes have been applied to your document.',
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

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                            <Sparkles size={20} className="text-white" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">AI Document Assistant</h3>
                            <p className="text-xs text-gray-500">{documentName || 'Untitled Document'}</p>
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
                                        ? 'bg-purple-600 text-white'
                                        : 'bg-white border border-gray-200 text-gray-900'
                                }`}
                            >
                                <div className="flex items-start gap-2">
                                    {message.role === 'assistant' && (
                                        <Bot size={18} className="flex-shrink-0 mt-0.5 text-purple-600" />
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
                                    <Loader2 size={18} className="animate-spin text-purple-600" />
                                    <span className="text-sm text-gray-600">Analyzing and editing...</span>
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
                                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">
                                    {suggestedEdit}
                                </pre>
                            </div>
                            <button
                                onClick={handleApply}
                                className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <Check size={16} />
                                Apply Changes to Document
                            </button>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="p-4 border-t border-gray-200 bg-white">
                    <div className="flex items-end gap-2">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Tell me what you'd like me to do with your document..."
                            className="flex-1 px-4 py-3 border-2 border-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-600 resize-none bg-white text-gray-900 placeholder:text-gray-600 text-lg font-medium"
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
                            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-md"
                        >
                            {loading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Send size={18} />
                            )}
                            Send
                        </button>
                    </div>
                    <p className="text-xs text-gray-600 mt-2 font-medium">
                        Press Enter to send, Shift+Enter for new line
                    </p>
                </div>
            </div>
        </div>
    );
}

