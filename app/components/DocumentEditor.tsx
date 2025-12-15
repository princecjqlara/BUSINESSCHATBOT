'use client';

import { useState, useEffect } from 'react';
import { Save, Check, Loader2, Sparkles, Image, X, Plus, Upload, Link2 } from 'lucide-react';
import DocumentAIAssistant from './DocumentAIAssistant';

interface DocumentEditorProps {
    initialText?: string;
    initialName?: string;
    initialMediaUrls?: string[];
    onSave: (text: string, name: string, mediaUrls?: string[]) => Promise<void>;
    onPreviewContentChange?: (content: string | undefined) => void; // Callback to notify parent of preview content
}

export default function DocumentEditor({ initialText = '', initialName = '', initialMediaUrls = [], onSave, onPreviewContentChange }: DocumentEditorProps) {
    const [text, setText] = useState(initialText);
    const [title, setTitle] = useState(initialName || 'Untitled Document');
    const [mediaUrls, setMediaUrls] = useState<string[]>(initialMediaUrls || []);
    const [pendingMediaUrls, setPendingMediaUrls] = useState<string[]>([]); // Newly uploaded files waiting to be attached
    const [newMediaUrl, setNewMediaUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showAIAssistant, setShowAIAssistant] = useState(false);
    const [showMediaModal, setShowMediaModal] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        setText(initialText);
        // Clear preview content when document changes
        if (onPreviewContentChange) {
            onPreviewContentChange(undefined);
        }
    }, [initialText, onPreviewContentChange]);

    useEffect(() => {
        if (initialName) {
            setTitle(initialName);
        }
    }, [initialName]);

    useEffect(() => {
        setMediaUrls(initialMediaUrls || []);
    }, [initialMediaUrls]);

    const handleSave = async () => {
        if (saving || !text.trim()) return; // Prevent multiple clicks

        setSaving(true);
        setSaved(false);

        try {
            await onSave(text, title.trim() || 'Untitled Document', mediaUrls);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (error) {
            console.error('Save failed:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleAddMediaUrl = () => {
        if (newMediaUrl.trim() && !mediaUrls.includes(newMediaUrl.trim())) {
            setMediaUrls([...mediaUrls, newMediaUrl.trim()]);
            setNewMediaUrl('');
        }
    };

    const handleRemoveMediaUrl = (index: number) => {
        setMediaUrls(mediaUrls.filter((_, i) => i !== index));
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file size (100MB max)
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (file.size > maxSize) {
            alert(`File is too large. Maximum file size is ${maxSize / (1024 * 1024)}MB.`);
            e.target.value = '';
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'documents'); // Use documents folder for document media

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();
            
            if (!res.ok) {
                const errorMessage = data.error || data.details || 'Failed to upload file';
                alert(`Upload failed: ${errorMessage}`);
                return;
            }

            if (data.success && data.url) {
                // Stage the uploaded URL for explicit attachment
                setPendingMediaUrls((prev) => prev.includes(data.url) ? prev : [...prev, data.url]);
            } else {
                alert('Upload failed: No URL returned from server.');
            }
        } catch (error: any) {
            console.error('Upload error:', error);
            const errorMessage = error.message || 'Failed to upload file. Please check your connection and try again.';
            alert(`Upload error: ${errorMessage}`);
        } finally {
            setUploading(false);
            // Reset file input
            e.target.value = '';
        }
    };

    const handleAttachPendingUrl = (url: string) => {
        setMediaUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
        setPendingMediaUrls((prev) => prev.filter((item) => item !== url));
    };

    const handleDiscardPendingUrl = (url: string) => {
        setPendingMediaUrls((prev) => prev.filter((item) => item !== url));
    };

    const handleApplyAISuggestion = (editedText: string) => {
        setText(editedText);
        setShowAIAssistant(false);
    };

    return (
        <div className="flex-1 bg-gray-100 flex flex-col h-full overflow-hidden relative">
            <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="font-medium text-gray-700 focus:outline-none hover:bg-gray-50 px-2 py-1 rounded"
                />
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowAIAssistant(true)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700"
                        title="Open AI Assistant"
                    >
                        <Sparkles size={16} />
                        AI Assistant
                    </button>
                    <button
                        onClick={() => setShowMediaModal(true)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-700 hover:to-cyan-700"
                        title="Manage Media Attachments"
                    >
                        <Image size={16} />
                        Media
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || saved || !text.trim()}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${saved
                                ? 'bg-green-600 text-white'
                                : saving
                                    ? 'bg-teal-400 text-white cursor-not-allowed'
                                    : 'bg-teal-600 text-white hover:bg-teal-700'
                            } disabled:opacity-70`}
                    >
                        {saved ? (
                            <>
                                <Check size={16} />
                                Saved!
                            </>
                        ) : saving ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save size={16} />
                                Save
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 flex justify-center">
                <div className="w-full max-w-[816px] min-h-[1056px] bg-white shadow-sm border border-gray-200 p-12 mb-8">
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Type your knowledge here..."
                        className="w-full h-full resize-none focus:outline-none text-gray-800 leading-relaxed"
                        style={{ minHeight: '800px' }}
                    />
                </div>
            </div>

            {showAIAssistant && (
                <DocumentAIAssistant
                    documentText={text}
                    documentName={title}
                    onApplySuggestion={handleApplyAISuggestion}
                    onClose={() => {
                        setShowAIAssistant(false);
                        // Clear preview content when assistant is closed
                        if (onPreviewContentChange) {
                            onPreviewContentChange(undefined);
                        }
                    }}
                    onPreviewContentChange={onPreviewContentChange}
                />
            )}

            {showMediaModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-teal-50 to-cyan-50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                                    <Image size={20} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">Media Attachments</h3>
                                    <p className="text-xs text-gray-500">Add images, videos, or files to this document</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowMediaModal(false)}
                                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                <X size={20} className="text-gray-600" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            <div>
                                <p className="text-sm text-gray-600 mb-4">
                                    Add image, video, or file URLs by pasting a link or uploading a file. After upload, click "Attach to document" so the chatbot can send these when referencing this document.
                                </p>
                                
                                {/* Add Media URL Input */}
                                <div className="flex gap-2 mb-4">
                                    <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500">
                                        <Link2 size={16} className="text-gray-400" />
                                        <input
                                            type="url"
                                            value={newMediaUrl}
                                            onChange={(e) => setNewMediaUrl(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleAddMediaUrl();
                                                }
                                            }}
                                            placeholder="https://example.com/image.jpg"
                                            className="flex-1 focus:outline-none text-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={handleAddMediaUrl}
                                        disabled={!newMediaUrl.trim()}
                                        className="px-3 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-sm"
                                    >
                                        <Plus size={16} />
                                        Add URL
                                    </button>
                                    <label className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 cursor-pointer flex items-center gap-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                        {uploading ? (
                                            <>
                                                <Loader2 size={16} className="animate-spin" />
                                                Uploading...
                                            </>
                                        ) : (
                                            <>
                                                <Upload size={16} />
                                                Upload
                                            </>
                                        )}
                                        <input
                                            type="file"
                                            onChange={handleFileUpload}
                                            disabled={uploading}
                                            className="hidden"
                                            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.odt,.ods,.odp"
                                        />
                                    </label>
                                </div>
                                
                                {/* Media URLs List */}
                                {mediaUrls.length > 0 ? (
                                    <div className="space-y-2">
                                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                            Attached Media ({mediaUrls.length})
                                        </h4>
                                        {mediaUrls.map((url, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                                            >
                                                <Image size={16} className="text-gray-400 flex-shrink-0" />
                                                <a
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-1 text-sm text-teal-600 hover:text-teal-700 truncate"
                                                >
                                                    {url}
                                                </a>
                                                <button
                                                    onClick={() => handleRemoveMediaUrl(index)}
                                                    className="p-1.5 hover:bg-red-100 rounded text-red-600 flex-shrink-0 transition-colors"
                                                    title="Remove"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-gray-400">
                                        <Image size={48} className="mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">No media attachments yet</p>
                                        <p className="text-xs mt-1">Upload a file or add a URL to get started</p>
                                    </div>
                                )}

                                {/* Pending uploads waiting to be attached */}
                                {pendingMediaUrls.length > 0 && (
                                    <div className="mt-6 space-y-2">
                                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                            Pending Uploads (attach to document)
                                        </h4>
                                        {pendingMediaUrls.map((url) => (
                                            <div
                                                key={url}
                                                className="flex items-center gap-2 p-3 bg-white rounded-lg border border-dashed border-teal-300 shadow-sm"
                                            >
                                                <Image size={16} className="text-teal-500 flex-shrink-0" />
                                                <a
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-1 text-sm text-teal-700 hover:text-teal-800 truncate"
                                                >
                                                    {url}
                                                </a>
                                                <button
                                                    onClick={() => handleAttachPendingUrl(url)}
                                                    className="px-3 py-1.5 bg-teal-600 text-white rounded-md hover:bg-teal-700 text-sm flex items-center gap-1"
                                                >
                                                    Attach to document
                                                </button>
                                                <button
                                                    onClick={() => handleDiscardPendingUrl(url)}
                                                    className="p-1.5 hover:bg-red-100 rounded text-red-600 flex-shrink-0 transition-colors"
                                                    title="Discard"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
                            <button
                                onClick={() => setShowMediaModal(false)}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors text-sm"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
