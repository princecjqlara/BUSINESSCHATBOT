'use client';

import { X, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Node } from '@xyflow/react';

interface PropertiesPanelProps {
    selectedNode: Node | null;
    onClose: () => void;
    onUpdate: (id: string, data: any) => void;
    onDelete: (id: string) => void;
}

export default function PropertiesPanel({ selectedNode, onClose, onUpdate, onDelete }: PropertiesPanelProps) {
    const [label, setLabel] = useState('');
    const [description, setDescription] = useState('');
    const [messageMode, setMessageMode] = useState('custom');
    const [messageText, setMessageText] = useState('');
    const [triggerStageId, setTriggerStageId] = useState('');
    const [stages, setStages] = useState<Array<{ id: string; name: string }>>([]);
    const [waitDuration, setWaitDuration] = useState('5');
    const [waitUnit, setWaitUnit] = useState('minutes');
    const [stopBotReason, setStopBotReason] = useState('');
    const [conditionType, setConditionType] = useState('has_replied');
    const [conditionRule, setConditionRule] = useState('');

    useEffect(() => {
        // Fetch pipeline stages
        fetch('/api/pipeline/stages')
            .then(res => res.json())
            .then(data => {
                // Ensure data is an array
                if (Array.isArray(data)) {
                    setStages(data);
                } else {
                    console.error('Stages API did not return an array:', data);
                    setStages([]);
                }
            })
            .catch(err => {
                console.error('Error fetching stages:', err);
                setStages([]);
            });
    }, []);

    useEffect(() => {
        if (selectedNode) {
            setLabel(selectedNode.data.label as string || '');
            setDescription(selectedNode.data.description as string || '');
            setMessageMode(selectedNode.data.messageMode as string || 'custom');
            setMessageText(selectedNode.data.messageText as string || '');
            setTriggerStageId(selectedNode.data.triggerStageId as string || '');
            setWaitDuration(selectedNode.data.duration as string || '5');
            setWaitUnit(selectedNode.data.unit as string || 'minutes');
            setStopBotReason(selectedNode.data.reason as string || '');
            setConditionType(selectedNode.data.conditionType as string || 'has_replied');
            setConditionRule(selectedNode.data.conditionRule as string || '');
        }
    }, [selectedNode]);

    if (!selectedNode) return null;

    const handleSave = () => {
        const updatedData = {
            ...selectedNode.data,
            label,
            description,
            messageMode,
            messageText,
            triggerStageId,
            duration: waitDuration,
            unit: waitUnit,
            reason: stopBotReason,
            conditionType,
            conditionRule,
        };
        onUpdate(selectedNode.id, updatedData);
    };

    return (
        <div className="absolute top-4 right-4 w-80 bg-white shadow-xl rounded-xl border border-gray-100 flex flex-col overflow-hidden z-10 animate-in slide-in-from-right-10 duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-semibold text-gray-800">Properties</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <X size={18} />
                </button>
            </div>

            <div className="p-4 space-y-4">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                    <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm font-medium capitalize text-gray-700">
                        {selectedNode.data.type as string}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
                    <input
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 text-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-200 text-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                    />
                </div>

                <div className="h-px bg-gray-100 my-2" />

                {/* Specific Fields */}

                {selectedNode.data.type === 'message' && (
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Message Mode</label>
                            <select
                                value={messageMode}
                                onChange={(e) => setMessageMode(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 text-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                            >
                                <option value="custom">Custom Message</option>
                                <option value="ai">AI-Generated</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                                {messageMode === 'ai' ? 'Message Prompt' : 'Message Text'}
                            </label>
                            <textarea
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                rows={4}
                                placeholder={messageMode === 'ai' ? 'Describe what the message should say...' : 'Type your message here...'}
                                className="w-full px-3 py-2 border border-gray-200 text-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                {messageMode === 'ai'
                                    ? 'AI will generate a personalized message based on conversation context'
                                    : 'This exact message will be sent to the customer'}
                            </p>
                        </div>
                    </div>
                )}

                {selectedNode.data.type === 'trigger' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Pipeline Stage Trigger</label>
                        <select
                            value={triggerStageId}
                            onChange={(e) => setTriggerStageId(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 text-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                        >
                            <option value="">Select a stage...</option>
                            {Array.isArray(stages) && stages.map((stage) => (
                                <option key={stage.id} value={stage.id}>
                                    {stage.name}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-1">
                            Workflow triggers when a lead enters this stage
                        </p>
                    </div>
                )}

                {selectedNode.data.type === 'wait' && (
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Duration</label>
                            <input
                                type="number"
                                value={waitDuration}
                                onChange={(e) => setWaitDuration(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 text-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                placeholder="5"
                                min="1"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
                            <select
                                value={waitUnit}
                                onChange={(e) => setWaitUnit(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 text-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                            >
                                <option value="minutes">Minutes</option>
                                <option value="hours">Hours</option>
                                <option value="days">Days</option>
                            </select>
                        </div>
                    </div>
                )}

                {selectedNode.data.type === 'stop_bot' && (
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Reason (Optional)</label>
                        <input
                            type="text"
                            value={stopBotReason}
                            onChange={(e) => setStopBotReason(e.target.value)}
                            placeholder="e.g. User opted out"
                            className="w-full px-3 py-2 border border-gray-200 text-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>
                )}

                {selectedNode.data.type === 'smart_condition' && (
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Condition Type</label>
                            <select
                                value={conditionType}
                                onChange={(e) => setConditionType(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 text-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                            >
                                <option value="has_replied">User Has Replied?</option>
                                <option value="ai_rule">Custom AI Rule</option>
                            </select>
                        </div>
                        {conditionType === 'ai_rule' && (
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Rule Detail</label>
                                <textarea
                                    value={conditionRule}
                                    onChange={(e) => setConditionRule(e.target.value)}
                                    rows={2}
                                    placeholder="e.g. Check if user is interested"
                                    className="w-full px-3 py-2 border border-gray-200 text-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-2">
                <button
                    onClick={handleSave}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                    <Save size={16} />
                    Save Changes
                </button>
                <button
                    onClick={() => onDelete(selectedNode.id)}
                    className="px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
}
