'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Loader2, Check, Copy, Sparkles, BookOpen, Edit, Plus } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface KnowledgeBaseAIAssistantProps {
    onClose: () => void;
}

export default function KnowledgeBaseAIAssistant({
    onClose,
}: KnowledgeBaseAIAssistantProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [suggestedEdits, setSuggestedEdits] = useState<Array<{
        documentId: number;
        reason: string;
        suggestedText: string;
        documentName?: string;
    }>>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        // Initialize with welcome message
        setMessages([{
            role: 'assistant',
            content: `Hi! I'm your AI Knowledge Base Assistant. I can help you manage your chatbot's knowledge base.\n\n✨ My capabilities:\n- 📖 Read and answer questions about your knowledge base\n- ✏️ Edit existing knowledge base documents\n- ➕ Create new knowledge base documents\n- 🔍 Search and analyze knowledge base content\n- 🌐 Access current information from the web\n- 🎯 Ensure content aligns with your bot's personality, tone, and rules\n\nI have full context about:\n- Your bot's personality and tone\n- Bot rules and guidelines\n- All knowledge base documents\n- Bot instructions\n- Web search for current information\n\nWhat would you like me to do?\n\nExamples:\n- "What information do we have about pricing?"\n- "Show me all documents about products"\n- "Edit document ID 5 to make it more professional"\n- "Create a new document about our return policy"\n- "Search the web for current market trends and add to knowledge base"\n- "Update pricing information with current data from the web"`,
            timestamp: new Date(),
        }]);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, suggestedEdits]);

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
        setSuggestedEdits([]);

        try {
            // Determine action type from user input
            let action = 'general';
            const lowerInput = currentInput.toLowerCase();
            if (lowerInput.includes('edit') || lowerInput.includes('update') || lowerInput.includes('modify')) {
                action = 'edit';
            } else if (lowerInput.includes('create') || lowerInput.includes('add') || lowerInput.includes('new document')) {
                action = 'create';
            } else if (lowerInput.includes('read') || lowerInput.includes('show') || lowerInput.includes('what') || lowerInput.includes('tell me')) {
                action = 'read';
            } else if (lowerInput.includes('search') || lowerInput.includes('find') || lowerInput.includes('query')) {
                action = 'query';
            }

            // Extract document ID if mentioned
            const docIdMatch = currentInput.match(/document\s*(?:id\s*)?(?:#)?\s*(\d+)/i);
            const documentId = docIdMatch ? parseInt(docIdMatch[1]) : undefined;

            const response = await fetch('/api/ai-knowledge-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userPrompt: currentInput,
                    conversationHistory: messages.map(m => ({
                        role: m.role,
                        content: m.content,
                    })),
                    action,
                    documentId,
                }),
            });

            const data = await response.json();

            if (data.success) {
                const assistantMessage: Message = {
                    role: 'assistant',
                    content: data.response || 'I\'ve processed your request.',
                    timestamp: new Date(),
                };

                setMessages(prev => [...prev, assistantMessage]);

                // Handle executed actions
                if (data.executedAction) {
                    if (data.executedAction.type === 'edit' && data.executedAction.success) {
                        setMessages(prev => [...prev, {
                            role: 'assistant',
                            content: `✅ Successfully updated document ID ${data.executedAction.documentId}!`,
                            timestamp: new Date(),
                        }]);
                    } else if (data.executedAction.type === 'create' && data.executedAction.success) {
                        setMessages(prev => [...prev, {
                            role: 'assistant',
                            content: `✅ Successfully created new document (ID: ${data.executedAction.documentId})!`,
                            timestamp: new Date(),
                        }]);
                    } else if (!data.executedAction.success) {
                        setMessages(prev => [...prev, {
                            role: 'assistant',
                            content: `❌ Failed to ${data.executedAction.type} document. Please try again.`,
                            timestamp: new Date(),
                        }]);
                    }
                }

                // Handle suggested edits
                if (data.suggestedEdits && data.suggestedEdits.length > 0) {
                    setSuggestedEdits(data.suggestedEdits);
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

    const handleApplyEdit = async (edit: typeof suggestedEdits[0]) => {
        try {
            setLoading(true);
            const response = await fetch('/api/ai-knowledge-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userPrompt: `Apply this edit to document ${edit.documentId}: ${edit.reason}`,
                    action: 'edit',
                    documentId: edit.documentId,
                    conversationHistory: messages.map(m => ({
                        role: m.role,
                        content: m.content,
                    })),
                }),
            });

            const data = await response.json();
            if (data.success && data.executedAction?.success) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `✅ Successfully applied edit to document ID ${edit.documentId}!`,
                    timestamp: new Date(),
                }]);
                setSuggestedEdits(prev => prev.filter(e => e.documentId !== edit.documentId));
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `❌ Failed to apply edit. Please try again.`,
                    timestamp: new Date(),
                }]);
            }
        } catch (error) {
            console.error('Error applying edit:', error);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Sorry, I encountered an error applying the edit. Please try again.',
                timestamp: new Date(),
            }]);
        } finally {
            setLoading(false);
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
                            <BookOpen size={20} className="text-white" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">AI Knowledge Base Assistant</h3>
                            <p className="text-xs text-gray-500">Read, edit, and manage your knowledge base</p>
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
                                    <span className="text-sm text-gray-600">Processing your request...</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {suggestedEdits.length > 0 && (
                        <div className="space-y-3">
                            {suggestedEdits.map((edit, index) => (
                                <div key={index} className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Edit size={18} className="text-blue-600" />
                                            <h4 className="font-semibold text-blue-900">
                                                Suggested Edit - Document ID {edit.documentId}
                                            </h4>
                                        </div>
                                        <button
                                            onClick={() => navigator.clipboard.writeText(edit.suggestedText)}
                                            className="p-1.5 hover:bg-blue-200 rounded-lg transition-colors"
                                            title="Copy to clipboard"
                                        >
                                            <Copy size={16} className="text-blue-700" />
                                        </button>
                                    </div>
                                    <p className="text-sm text-blue-800 mb-2">
                                        <strong>Reason:</strong> {edit.reason}
                                    </p>
                                    <div className="bg-white rounded-lg p-4 border border-blue-200 max-h-64 overflow-y-auto mb-3">
                                        <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">
                                            {edit.suggestedText}
                                        </pre>
                                    </div>
                                    <button
                                        onClick={() => handleApplyEdit(edit)}
                                        disabled={loading}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <Check size={16} />
                                        Apply Edit to Knowledge Base
                                    </button>
                                </div>
                            ))}
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
                            placeholder="Ask me about your knowledge base, request edits, or create new documents..."
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

