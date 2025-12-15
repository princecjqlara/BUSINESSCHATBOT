'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Paperclip, RotateCcw, ThumbsUp, ThumbsDown, RefreshCw, Plus, X, Loader2 } from 'lucide-react';
import { extractMediaUrls, isMediaUrl } from '@/app/lib/mediaUtils';

interface Message {
    role: 'user' | 'bot';
    content: string;
    messageIndex?: number; // Track message index for rating
    rating?: 'like' | 'dislike' | null; // Track user rating
    regenerating?: boolean; // Track if regenerating
    mediaUrls?: string[]; // Media attachments (images, videos, files)
}

interface ChatPreviewProps {
    previewDocumentContent?: string; // Optional preview content from AI assistant
    onDocumentsEdited?: (documentIds: string[]) => void; // Callback when documents are edited by auto-improvement
}

export default function ChatPreview({ previewDocumentContent, onDocumentsEdited }: ChatPreviewProps = {} as ChatPreviewProps) {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'bot', content: "Hi, I'm TestBot! How can I help with your documents?", messageIndex: 0 }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messageCounter, setMessageCounter] = useState(1); // Track message indices
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [showAddMediaModal, setShowAddMediaModal] = useState(false);
    const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | null>(null);
    const [documents, setDocuments] = useState<Array<{ id: number; name: string; text: string }>>([]);
    const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
    const [addingMedia, setAddingMedia] = useState(false);

    // Generate a NEW session ID each time the component mounts
    // This prevents old conversation history from affecting new chats
    useEffect(() => {
        const newId = `web_test_${Date.now()}`;
        setSessionId(newId);
        console.log('[ChatPreview] New test session:', newId);
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Fetch documents when modal opens
    useEffect(() => {
        if (showAddMediaModal) {
            fetch('/api/knowledge')
                .then(res => res.json())
                .then(data => {
                    // Get unique documents by name (since documents are chunked)
                    const uniqueDocs = new Map<number, { id: number; name: string; text: string }>();
                    data.forEach((doc: any) => {
                        if (!uniqueDocs.has(doc.id)) {
                            uniqueDocs.set(doc.id, {
                                id: doc.id,
                                name: doc.name || 'Untitled Document',
                                text: doc.text || ''
                            });
                        }
                    });
                    setDocuments(Array.from(uniqueDocs.values()));
                })
                .catch(err => {
                    console.error('Error fetching documents:', err);
                    setDocuments([]);
                });
        }
    }, [showAddMediaModal]);

    // Clear chat and start fresh
    const handleClearChat = () => {
        const newId = `web_test_${Date.now()}`;
        setSessionId(newId);
        setMessages([
            { role: 'bot', content: "Chat cleared! I'm ready for fresh questions. 😊", messageIndex: 0 }
        ]);
        setMessageCounter(1);
        console.log('[ChatPreview] Chat cleared, new session:', newId);
    };

    const handleRateMessage = async (messageIndex: number, rating: 'like' | 'dislike') => {
        console.log('[Rating] Attempting to rate message:', { 
            messageIndex, 
            totalMessages: messages.length, 
            allMessages: messages.map(m => ({ role: m.role, index: m.messageIndex, hasIndex: m.messageIndex !== undefined }))
        });
        
        // Find the message - make sure we're getting the right one
        const message = messages.find(m => m.messageIndex === messageIndex && m.role === 'bot');
        if (!message) {
            // Try to find any message with this index for debugging
            const anyMessage = messages.find(m => m.messageIndex === messageIndex);
            console.error('[Rating] Bot message not found:', { 
                messageIndex, 
                foundMessage: anyMessage ? { role: anyMessage.role, index: anyMessage.messageIndex } : null,
                availableBotMessages: messages.filter(m => m.role === 'bot').map(m => ({ index: m.messageIndex, content: m.content.substring(0, 30) }))
            });
            return;
        }
        
        if (message.role !== 'bot') {
            console.error('[Rating] Message is not a bot message:', { messageIndex, role: message.role });
            return;
        }

        if (!sessionId) {
            console.error('[Rating] No session ID available');
            return;
        }

        console.log('[Rating] Rating message:', { messageIndex, rating, hasContent: !!message.content });

        // Update UI immediately
        setMessages(prev => prev.map(m => 
            m.messageIndex === messageIndex ? { ...m, rating } : m
        ));

        try {
            // Get conversation context (last few messages)
            const contextMessages = messages
                .filter(m => m.messageIndex !== undefined && m.messageIndex <= messageIndex)
                .slice(-10) // Last 10 messages for context
                .map(m => ({ role: m.role, content: m.content }));

            // Find the user message that prompted this bot response
            const userMessage = messages
                .filter(m => m.role === 'user' && m.messageIndex !== undefined && m.messageIndex < messageIndex)
                .pop()?.content || '';

            console.log('[Rating] Sending rating to API:', {
                sessionId,
                messageIndex,
                rating,
                userMessageLength: userMessage.length,
                botMessageLength: message.content.length,
                contextMessagesCount: contextMessages.length
            });

            const response = await fetch('/api/message-rating', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    messageIndex,
                    userMessage,
                    botMessage: message.content,
                    rating,
                    conversationContext: contextMessages,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            console.log('[Rating] API response:', data);
            
            if (data.success && rating === 'like' && data.improvementsApplied) {
                // Show success message
                console.log('[Rating] ✅ Auto-improvements applied:', data.improvements);
                
                // Notify parent about edited documents if callback is provided
                if (onDocumentsEdited && data.improvements?.documentsCount > 0) {
                    // Pass the document IDs to highlight them
                    const documentIds = data.improvements.modifiedDocumentIds || [];
                    onDocumentsEdited(documentIds);
                }
                
                const improvementsText = [
                    data.improvements.documentsCount > 0 ? `${data.improvements.documentsCount} document(s)` : null,
                    data.improvements.rulesCount > 0 ? `${data.improvements.rulesCount} rule(s)` : null,
                    data.improvements.instructionsUpdated ? 'instructions' : null,
                ].filter(Boolean).join(', ');
                
                alert(`✅ Great! I've learned from this response and updated: ${improvementsText}. The changes are highlighted in your knowledge base.`);
            } else if (data.success && rating === 'like' && !data.improvementsApplied) {
                console.log('[Rating] Rating saved, but no improvements were needed');
            } else if (data.success) {
                console.log('[Rating] Rating saved successfully');
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (error) {
            console.error('[Rating] Failed to rate message:', error);
            // Revert UI change on error
            setMessages(prev => prev.map(m => 
                m.messageIndex === messageIndex ? { ...m, rating: null } : m
            ));
            alert(`Failed to save rating: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    const handleRegenerate = async (messageIndex: number) => {
        console.log('[Regenerate] Attempting to regenerate:', { 
            messageIndex, 
            totalMessages: messages.length,
            allMessages: messages.map(m => ({ role: m.role, index: m.messageIndex }))
        });
        
        // Find the bot message with this index
        const message = messages.find(m => m.messageIndex === messageIndex && m.role === 'bot');
        if (!message) {
            // Try to find any message with this index for debugging
            const anyMessage = messages.find(m => m.messageIndex === messageIndex);
            console.error('[Regenerate] Bot message not found:', { 
                messageIndex, 
                foundMessage: anyMessage ? { role: anyMessage.role, index: anyMessage.messageIndex } : null,
                availableBotMessages: messages.filter(m => m.role === 'bot').map(m => ({ index: m.messageIndex, content: m.content.substring(0, 30) }))
            });
            return;
        }
        
        if (message.role !== 'bot') {
            console.error('[Regenerate] Message is not a bot message:', { messageIndex, role: message.role });
            return;
        }

        // Find the user message that prompted this response
        // Get all messages before this bot message, find the last user message
        const messagesBefore = messages.filter(m => 
            m.messageIndex !== undefined && m.messageIndex < messageIndex
        );
        let userMessage = messagesBefore
            .filter(m => m.role === 'user')
            .pop()?.content || '';

        // If no user message found and this is the initial bot message (index 0),
        // we can't regenerate it without a user prompt
        if (!userMessage) {
            // Check if this is the initial greeting message
            if (messageIndex === 0) {
                console.error('[Regenerate] Cannot regenerate initial greeting message without a user prompt');
                alert('Cannot regenerate the initial greeting. Please send a message first.');
                return;
            }
            
            // Try to find the user message by looking at the conversation flow
            // Sometimes messages might be out of order, so find the most recent user message
            const allUserMessages = messages.filter(m => m.role === 'user');
            if (allUserMessages.length > 0) {
                // Use the last user message as a fallback
                userMessage = allUserMessages[allUserMessages.length - 1].content;
                console.log('[Regenerate] Using last user message as fallback:', userMessage.substring(0, 50));
            } else {
                console.error('[Regenerate] No user message found before bot message:', messageIndex);
                alert('Cannot regenerate: No user message found to regenerate from.');
                return;
            }
        }

        console.log('[Regenerate] Regenerating response for:', { messageIndex, userMessage: userMessage.substring(0, 50) });

        // Mark as regenerating
        setMessages(prev => prev.map(m => 
            m.messageIndex === messageIndex ? { ...m, regenerating: true } : m
        ));

        setLoading(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: userMessage, 
                    sessionId,
                    previewDocumentContent: previewDocumentContent || undefined,
                }),
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            const botReplies = Array.isArray(data.reply) ? data.reply : [data.reply];
            const mediaUrls = Array.isArray(data.mediaUrls) ? data.mediaUrls : [];
            
            console.log('[Regenerate] Got new response:', { replyCount: botReplies.length, mediaUrlsCount: mediaUrls.length });
            
            // Remove old message(s) and replace with new ones
            setMessages(prev => {
                // Find the message to regenerate by messageIndex
                const messageToRegenerate = prev.find(m => m.messageIndex === messageIndex && m.role === 'bot');
                if (!messageToRegenerate) {
                    console.error('[Regenerate] Message not found');
                    return prev;
                }

                // Find all consecutive bot messages starting from messageIndex to remove
                // We need to find by messageIndex, not by object reference
                const messagesToRemoveIndices = new Set<number>();
                let currentIndex = messageIndex;
                
                // Find all bot messages that are part of this response (consecutive indices)
                for (const msg of prev) {
                    if (msg.role === 'bot' && msg.messageIndex === currentIndex) {
                        messagesToRemoveIndices.add(currentIndex);
                        currentIndex++;
                    } else if (msg.messageIndex !== undefined && msg.messageIndex < currentIndex) {
                        // Skip messages before our target
                        continue;
                    } else if (msg.messageIndex !== undefined && msg.messageIndex > currentIndex) {
                        // We've passed the consecutive messages, stop
                        break;
                    }
                }

                console.log('[Regenerate] Removing', messagesToRemoveIndices.size, 'old message(s) with indices:', Array.from(messagesToRemoveIndices));

                // Remove the old messages by filtering out those with matching indices
                const filtered = prev.filter(msg => 
                    !(msg.role === 'bot' && msg.messageIndex !== undefined && messagesToRemoveIndices.has(msg.messageIndex))
                );

                // Find where to insert new messages (after the user message that prompted this)
                const userMsgIdx = filtered.findIndex(m => 
                    m.role === 'user' && 
                    m.messageIndex !== undefined && 
                    m.messageIndex < messageIndex
                );

                // Extract media URLs from message text and combine with API mediaUrls
                const newMessages = botReplies.map((reply: string, index: number) => {
                    // Extract media URLs from this message's text
                    const textMediaUrls = extractMediaUrls(reply);
                    
                    // Combine API mediaUrls (from documents) with text mediaUrls
                    const combinedMediaUrls = index === 0 
                        ? [...new Set([...mediaUrls, ...textMediaUrls])] // Deduplicate
                        : [...new Set(textMediaUrls)];
                    
                    // Remove media URLs from text content
                    let cleanedContent = reply;
                    textMediaUrls.forEach(url => {
                        cleanedContent = cleanedContent.replace(url, '').trim();
                    });
                    
                    return {
                        role: 'bot' as const,
                        content: cleanedContent || reply, // Keep original if all content was URLs
                        messageIndex: messageIndex + index,
                        rating: null,
                        regenerating: false,
                        // Attach all media URLs (from API and from text)
                        mediaUrls: combinedMediaUrls.length > 0 ? combinedMediaUrls : undefined,
                    };
                });

                if (userMsgIdx !== -1) {
                    // Insert after the user message
                    const before = filtered.slice(0, userMsgIdx + 1);
                    const after = filtered.slice(userMsgIdx + 1);
                    return [...before, ...newMessages, ...after];
                } else {
                    // Fallback: append at the end
                    return [...filtered, ...newMessages];
                }
            });
        } catch (error) {
            console.error('[Regenerate] Failed to regenerate:', error);
            setMessages(prev => prev.map(m => 
                m.messageIndex === messageIndex ? { ...m, regenerating: false } : m
            ));
            alert('Failed to regenerate response. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

            const userMessage = input;
        setInput('');
        // User messages get their own index, then bot replies will get the next indices
        const userMsgIndex = messageCounter;
        const nextCounter = messageCounter + 1;
        setMessageCounter(nextCounter);
        setMessages((prev) => [...prev, { role: 'user', content: userMessage, messageIndex: userMsgIndex }]);
        setLoading(true);
        
        console.log('[ChatPreview] User message added:', { messageIndex: userMsgIndex, nextCounter, currentMessagesCount: messages.length });

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: userMessage, 
                    sessionId,
                    previewDocumentContent: previewDocumentContent || undefined, // Include preview content if available
                }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                throw new Error(errorData.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            console.log('[ChatPreview] API response:', { 
                hasReply: !!data.reply, 
                replyType: typeof data.reply,
                isArray: Array.isArray(data.reply),
                replyLength: Array.isArray(data.reply) ? data.reply.length : (data.reply ? 1 : 0),
                mediaUrlsCount: data.mediaUrls?.length || 0
            });
            
            // Handle both single string and array of messages
            if (!data.reply) {
                throw new Error('No reply received from server');
            }
            
            const botReplies = Array.isArray(data.reply) ? data.reply : [data.reply];
            
            // Filter out empty replies
            const validReplies = botReplies.filter((reply: string) => reply && reply.trim().length > 0);
            
            if (validReplies.length === 0) {
                throw new Error('Received empty reply from server');
            }
            
            // Extract mediaUrls from response
            const mediaUrls = Array.isArray(data.mediaUrls) ? data.mediaUrls : [];
            
            // Calculate bot message indices before adding them
            // Bot messages should start from nextCounter (which is messageCounter + 1 after user message)
            // We use nextCounter because messageCounter was already incremented when user message was added
            const startBotIndex = nextCounter; // Use nextCounter, not messageCounter (which might be stale)
            console.log('[ChatPreview] Adding bot replies:', { 
                startBotIndex, 
                replyCount: validReplies.length,
                mediaUrlsCount: mediaUrls.length,
                userMsgIndex,
                nextCounter,
                messageCounter // This is the old value before increment
            });
            
            // Extract media URLs from message text and combine with API mediaUrls
            const allBotMessages = validReplies.map((reply: string, index: number) => {
                // Extract media URLs from this message's text
                const textMediaUrls = extractMediaUrls(reply);
                
                // Combine API mediaUrls (from documents) with text mediaUrls
                const combinedMediaUrls = index === 0 
                    ? [...new Set([...mediaUrls, ...textMediaUrls])] // Deduplicate
                    : [...new Set(textMediaUrls)];
                
                // Remove media URLs from text content (replace with placeholder or remove)
                let cleanedContent = reply;
                textMediaUrls.forEach(url => {
                    // Remove the URL from text, optionally replace with a short indicator
                    cleanedContent = cleanedContent.replace(url, '').trim();
                });
                
                return {
                    role: 'bot' as const,
                    content: cleanedContent || reply, // Keep original if all content was URLs
                    messageIndex: startBotIndex + index,
                    rating: null,
                    regenerating: false,
                    // Attach all media URLs (from API and from text)
                    mediaUrls: combinedMediaUrls.length > 0 ? combinedMediaUrls : undefined,
                };
            });
            
            // Add all messages immediately to state (no duplicates)
            // Use functional update to ensure we're working with the latest state
            setMessages((prevMsgs) => {
                console.log('[ChatPreview] setMessages called:', {
                    prevMsgsCount: prevMsgs.length,
                    newMessagesCount: allBotMessages.length,
                    prevMsgIndices: prevMsgs.map((m: Message) => ({ role: m.role, index: m.messageIndex, content: m.content.substring(0, 30) })),
                    newMsgIndices: allBotMessages.map((m: Message) => ({ role: m.role, index: m.messageIndex, content: m.content.substring(0, 30) }))
                });
                
                // Check for duplicates by messageIndex only (more reliable than content comparison)
                // During Fast Refresh, React may re-render, but the state should already have the messages
                const existingIndices = new Set(prevMsgs.map((m: Message) => m.messageIndex));
                const newMessages = allBotMessages.filter((m: Message) => !existingIndices.has(m.messageIndex));
                
                if (newMessages.length === 0) {
                    // All messages already exist - this can happen during Fast Refresh
                    console.log('[ChatPreview] All messages already exist, returning previous state');
                    return prevMsgs;
                }
                
                if (newMessages.length !== allBotMessages.length) {
                    console.log('[ChatPreview] Some messages already existed (likely Fast Refresh), adding only new ones:', {
                        total: allBotMessages.length,
                        new: newMessages.length,
                        existing: allBotMessages.length - newMessages.length
                    });
                }
                
                const updated = [...prevMsgs, ...newMessages];
                console.log('[ChatPreview] Messages updated successfully:', {
                    totalMessages: updated.length,
                    lastMessage: updated[updated.length - 1] ? {
                        role: updated[updated.length - 1].role,
                        index: updated[updated.length - 1].messageIndex,
                        contentPreview: updated[updated.length - 1].content.substring(0, 50)
                    } : null
                });
                
                return updated;
            });
            
            // Update message counter
            const newCounter = startBotIndex + validReplies.length;
            setMessageCounter(newCounter);
            console.log('[ChatPreview] Added bot messages:', { 
                count: validReplies.length, 
                startIndex: startBotIndex, 
                endIndex: newCounter - 1,
                newCounter 
            });

            // Store session ID if returned
            if (data.sessionId && !sessionId) {
                setSessionId(data.sessionId);
            }
        } catch (error) {
            console.error('[ChatPreview] Chat error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Sorry, I encountered an error. Please try again.';
            setMessages((prev) => [...prev, { 
                role: 'bot', 
                content: errorMessage,
                messageIndex: messageCounter,
                rating: null,
                regenerating: false,
            }]);
            setMessageCounter(prev => prev + 1);
            alert(`Error: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    };

    const handleAddMediaToDocument = async () => {
        if (!selectedMediaUrl || !selectedDocumentId) {
            return;
        }

        setAddingMedia(true);
        try {
            const res = await fetch('/api/knowledge/add-media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    documentId: selectedDocumentId,
                    mediaUrl: selectedMediaUrl,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to add media to document');
            }

            alert('✅ Media URL added to document! The chatbot will now send it as an attachment when referencing this document.');
            setShowAddMediaModal(false);
            setSelectedMediaUrl(null);
            setSelectedDocumentId(null);
        } catch (error) {
            console.error('Error adding media to document:', error);
            alert(`Failed to add media: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setAddingMedia(false);
        }
    };

    // Render message content (media URLs are now extracted and shown as attachments separately)
    const renderMessageContent = (content: string) => {
        // Media URLs are now extracted and displayed as attachments, so just render the text
        return <div className="whitespace-pre-wrap break-words leading-relaxed text-gray-800 text-left">{content.trim()}</div>;
    };

    return (
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-full flex-shrink-0">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                <Bot className="text-teal-600" size={20} />
                <h2 className="font-semibold text-gray-800 flex-1">TestBot</h2>
                <button
                    onClick={handleClearChat}
                    className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors"
                    title="Clear chat & start fresh"
                >
                    <RotateCcw size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/50">
                <div className="text-center text-xs text-gray-400 my-2">Today</div>

                {messages.map((msg, idx) => {
                    // Use a unique key that combines role and index to avoid conflicts
                    // Since user and bot messages can share messageIndex, we need role in the key
                    const messageKey = msg.messageIndex !== undefined 
                        ? `${msg.role}-${msg.messageIndex}-${idx}` 
                        : `${msg.role}-${idx}`;
                    
                    return (
                        <div
                            key={messageKey}
                            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-gray-200' : 'bg-teal-600 text-white'
                                }`}>
                                {msg.role === 'user' ? 'U' : <Bot size={16} />}
                            </div>

                            <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'flex flex-col gap-2'}`}>
                                <div className={`p-3 rounded-2xl text-sm shadow-sm ${msg.role === 'user'
                                    ? 'bg-white text-gray-800 rounded-tr-none border border-gray-100'
                                    : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'
                                    }`}>
                                    {renderMessageContent(msg.content)}
                                    {/* Render media attachments */}
                                    {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            {msg.mediaUrls.map((url, idx) => {
                                                const urlLower = url.toLowerCase();
                                                const isImage = urlLower.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|tiff|tif)$/);
                                                const isVideo = urlLower.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v|3gp|ogv)$/);
                                                
                                                if (isImage) {
                                                    return (
                                                        <div key={idx} className="rounded-lg overflow-hidden border border-gray-200 relative group">
                                                            <img 
                                                                src={url} 
                                                                alt={`Media attachment ${idx + 1}`}
                                                                className="max-w-full h-auto"
                                                                onError={(e) => {
                                                                    // Fallback to link if image fails to load
                                                                    const target = e.target as HTMLImageElement;
                                                                    const parent = target.parentElement;
                                                                    if (parent) {
                                                                        target.style.display = 'none';
                                                                        const link = document.createElement('a');
                                                                        link.href = url;
                                                                        link.textContent = url;
                                                                        link.className = 'text-blue-600 hover:underline break-all text-xs p-2 block';
                                                                        link.target = '_blank';
                                                                        link.rel = 'noopener noreferrer';
                                                                        parent.appendChild(link);
                                                                    }
                                                                }}
                                                            />
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedMediaUrl(url);
                                                                    setShowAddMediaModal(true);
                                                                }}
                                                                className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-white rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                                                title="Add to Document"
                                                            >
                                                                <Plus size={14} className="text-teal-600" />
                                                            </button>
                                                        </div>
                                                    );
                                                } else if (isVideo) {
                                                    return (
                                                        <div key={idx} className="rounded-lg overflow-hidden border border-gray-200 relative group">
                                                            <video 
                                                                src={url} 
                                                                controls
                                                                className="max-w-full h-auto"
                                                                onError={(e) => {
                                                                    // Fallback to link if video fails to load
                                                                    const target = e.target as HTMLVideoElement;
                                                                    const parent = target.parentElement;
                                                                    if (parent) {
                                                                        target.style.display = 'none';
                                                                        const link = document.createElement('a');
                                                                        link.href = url;
                                                                        link.textContent = url;
                                                                        link.className = 'text-blue-600 hover:underline break-all text-xs p-2 block';
                                                                        link.target = '_blank';
                                                                        link.rel = 'noopener noreferrer';
                                                                        parent.appendChild(link);
                                                                    }
                                                                }}
                                                            >
                                                                Your browser does not support the video tag.
                                                            </video>
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedMediaUrl(url);
                                                                    setShowAddMediaModal(true);
                                                                }}
                                                                className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-white rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                                                title="Add to Document"
                                                            >
                                                                <Plus size={14} className="text-teal-600" />
                                                            </button>
                                                        </div>
                                                    );
                                                } else {
                                                    // For other file types, show as a clickable link with add button
                                                    return (
                                                        <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors group">
                                                            <a 
                                                                href={url} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="flex-1 text-blue-600 hover:underline break-all text-xs"
                                                            >
                                                                📎 {url}
                                                            </a>
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedMediaUrl(url);
                                                                    setShowAddMediaModal(true);
                                                                }}
                                                                className="p-1 text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                                title="Add to Document"
                                                            >
                                                                <Plus size={14} />
                                                            </button>
                                                        </div>
                                                    );
                                                }
                                            })}
                                        </div>
                                    )}
                                </div>
                                {msg.role === 'bot' && msg.messageIndex !== undefined && (
                                    <div className="flex items-center gap-2 ml-1">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                console.log('[Rating Button] Clicked:', { messageIndex: msg.messageIndex, role: msg.role });
                                                handleRateMessage(msg.messageIndex!, 'like');
                                            }}
                                            className={`p-1.5 rounded-lg transition-colors ${
                                                msg.rating === 'like'
                                                    ? 'bg-green-100 text-green-600'
                                                    : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                                            }`}
                                            title="I like this response"
                                        >
                                            <ThumbsUp size={14} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                console.log('[Rating Button] Clicked:', { messageIndex: msg.messageIndex, role: msg.role });
                                                handleRateMessage(msg.messageIndex!, 'dislike');
                                            }}
                                            className={`p-1.5 rounded-lg transition-colors ${
                                                msg.rating === 'dislike'
                                                    ? 'bg-red-100 text-red-600'
                                                    : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                                            }`}
                                            title="I don't like this response"
                                        >
                                            <ThumbsDown size={14} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                console.log('[Regenerate Button] Clicked:', { messageIndex: msg.messageIndex, role: msg.role });
                                                handleRegenerate(msg.messageIndex!);
                                            }}
                                            disabled={msg.regenerating || loading}
                                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Get a new response"
                                        >
                                            <RefreshCw size={14} className={msg.regenerating ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {loading && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center flex-shrink-0">
                            <Bot size={16} />
                        </div>
                        <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm">
                            <div className="flex gap-1">
                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-75"></div>
                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-150"></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-gray-100">
                <form onSubmit={handleSubmit} className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question..."
                        className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-700"
                        disabled={loading}
                    />
                    <div className="absolute right-2 top-1.5 flex items-center gap-1">
                        <button type="button" className="p-1.5 text-gray-400 hover:text-gray-600">
                            <Paperclip size={18} />
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !input.trim()}
                            className="p-1.5 text-teal-600 hover:text-teal-700 disabled:text-gray-300"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </form>
            </div>

            {/* Add Media to Document Modal */}
            {showAddMediaModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-teal-50 to-cyan-50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                                    <Plus size={20} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">Add Media to Document</h3>
                                    <p className="text-xs text-gray-500">Select a document to add this media URL</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setShowAddMediaModal(false);
                                    setSelectedMediaUrl(null);
                                    setSelectedDocumentId(null);
                                }}
                                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                <X size={20} className="text-gray-600" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">Media URL:</label>
                                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    <p className="text-sm text-gray-600 break-all">{selectedMediaUrl}</p>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">Select Document:</label>
                                {documents.length === 0 ? (
                                    <div className="p-4 text-center text-gray-400 text-sm">
                                        <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                                        Loading documents...
                                    </div>
                                ) : (
                                    <select
                                        value={selectedDocumentId || ''}
                                        onChange={(e) => setSelectedDocumentId(Number(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                                    >
                                        <option value="">-- Select a document --</option>
                                        {documents.map(doc => (
                                            <option key={doc.id} value={doc.id}>
                                                {doc.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-xs text-blue-800">
                                    💡 <strong>Tip:</strong> Once added, the chatbot will send this media as an attachment (not a link) when referencing this document.
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowAddMediaModal(false);
                                    setSelectedMediaUrl(null);
                                    setSelectedDocumentId(null);
                                }}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors text-sm"
                                disabled={addingMedia}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddMediaToDocument}
                                disabled={!selectedDocumentId || addingMedia}
                                className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {addingMedia ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Adding...
                                    </>
                                ) : (
                                    <>
                                        <Plus size={16} />
                                        Add to Document
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
