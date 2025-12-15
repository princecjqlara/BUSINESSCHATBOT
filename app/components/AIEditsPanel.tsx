'use client';

import { useState, useEffect } from 'react';
import { Bot, Undo2, Clock, AlertCircle, CheckCircle2, X } from 'lucide-react';

interface AIEdit {
    id: string;
    change_type: 'add' | 'update' | 'delete';
    entity_type: 'document' | 'rule' | 'instruction' | 'personality';
    entity_id?: string;
    old_value?: any;
    new_value?: any;
    reason: string;
    confidence_score: number;
    created_at: string;
    model_used?: string;
    undone: boolean;
}

interface AIEditsPanelProps {
    onUndo?: (changeId: string) => void;
}

export default function AIEditsPanel({ onUndo }: AIEditsPanelProps) {
    const [edits, setEdits] = useState<AIEdit[]>([]);
    const [loading, setLoading] = useState(true);
    const [undoing, setUndoing] = useState<string | null>(null);

    useEffect(() => {
        fetchRecentEdits();
    }, []);

    const fetchRecentEdits = async () => {
        try {
            const res = await fetch('/api/ml/knowledge-changes?limit=3');
            const data = await res.json();
            setEdits(data.changes || []);
        } catch (error) {
            console.error('Failed to fetch AI edits:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUndo = async (changeId: string) => {
        setUndoing(changeId);
        try {
            const res = await fetch('/api/ml/knowledge-changes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ changeId }),
            });

            if (res.ok) {
                // Refresh edits
                await fetchRecentEdits();
                if (onUndo) onUndo(changeId);
            } else {
                alert('Failed to undo change');
            }
        } catch (error) {
            console.error('Failed to undo:', error);
            alert('Failed to undo change');
        } finally {
            setUndoing(null);
        }
    };

    const getChangeTypeLabel = (type: string) => {
        switch (type) {
            case 'add': return 'Added';
            case 'update': return 'Updated';
            case 'delete': return 'Deleted';
            default: return type;
        }
    };

    const getEntityTypeLabel = (type: string) => {
        switch (type) {
            case 'document': return 'Document';
            case 'rule': return 'Rule';
            case 'instruction': return 'Instruction';
            case 'personality': return 'Personality';
            default: return type;
        }
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    if (loading) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 text-gray-500">
                    <Bot size={16} className="animate-pulse" />
                    <span className="text-sm">Loading AI edits...</span>
                </div>
            </div>
        );
    }

    if (edits.length === 0) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 text-gray-500">
                    <Bot size={16} />
                    <span className="text-sm">No recent AI edits</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg border border-blue-200 shadow-sm">
            <div className="p-3 border-b border-gray-100 bg-blue-50/30">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bot size={16} className="text-blue-600" />
                        <span className="text-sm font-medium text-gray-900">Recent ML AI Edits</span>
                    </div>
                    <span className="text-xs text-gray-500 bg-blue-100 px-2 py-0.5 rounded-full">
                        {edits.length}
                    </span>
                </div>
            </div>

            <div className="divide-y divide-gray-100">
                {edits.map((edit) => (
                    <div
                        key={edit.id}
                        className="p-3 hover:bg-gray-50 transition-colors"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                        edit.change_type === 'add' ? 'bg-green-100 text-green-700' :
                                        edit.change_type === 'update' ? 'bg-blue-100 text-blue-700' :
                                        'bg-red-100 text-red-700'
                                    }`}>
                                        {getChangeTypeLabel(edit.change_type)}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {getEntityTypeLabel(edit.entity_type)}
                                    </span>
                                    {edit.confidence_score >= 0.8 && (
                                        <span title="High confidence">
                                            <CheckCircle2 size={12} className="text-green-600" />
                                        </span>
                                    )}
                                </div>

                                {edit.reason && (
                                    <p className="text-xs text-gray-600 mb-1 line-clamp-2">
                                        {edit.reason}
                                    </p>
                                )}

                                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                    <div className="flex items-center gap-1">
                                        <Clock size={10} />
                                        <span>{formatTime(edit.created_at)}</span>
                                    </div>
                                    {edit.model_used && (
                                        <span className="truncate max-w-[120px]" title={edit.model_used}>
                                            {edit.model_used.split('/').pop()?.substring(0, 15)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {!edit.undone && (
                                <button
                                    onClick={() => handleUndo(edit.id)}
                                    disabled={undoing === edit.id}
                                    className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                    title="Undo this change"
                                >
                                    {undoing === edit.id ? (
                                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-300 border-t-red-600" />
                                    ) : (
                                        <Undo2 size={14} />
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

