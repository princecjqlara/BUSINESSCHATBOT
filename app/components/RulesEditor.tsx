'use client';

import { useState, useEffect } from 'react';
import { Save, Bot, Plus, Trash2, GripVertical, ToggleLeft, ToggleRight, Clock, Sparkles, Target, ArrowUp, ArrowDown, Edit2 } from 'lucide-react';
import AIEditsPanel from './AIEditsPanel';
import FollowUpMessageTester from './FollowUpMessageTester';
import BotStyleAnalyzer from './BotStyleAnalyzer';
import BotConfigurationAIAnalyzer from './BotConfigurationAIAnalyzer';

interface Rule {
    id: string;
    rule: string;
    category: string;
    priority: number;
    enabled: boolean;
    edited_by_ai?: boolean;
    edited_by_ml_ai?: boolean; // True if edited by ML AI (different from regular AI)
    last_ai_edit_at?: string | null;
}

interface BotGoal {
    id: string;
    goal_name: string;
    goal_description: string | null;
    priority_order: number | null;
    is_active: boolean;
    is_optional: boolean;
    created_at?: string;
    updated_at?: string;
}

export default function RulesEditor() {
    const [botName, setBotName] = useState('');
    const [botTone, setBotTone] = useState('');
    const [humanTakeoverTimeout, setHumanTakeoverTimeout] = useState(5);
    const [enableBestTimeContact, setEnableBestTimeContact] = useState(false);
    const [enableMlChatbot, setEnableMlChatbot] = useState(false);
    const [enableAiKnowledgeManagement, setEnableAiKnowledgeManagement] = useState(false);
    const [enableAiAutonomousFollowup, setEnableAiAutonomousFollowup] = useState(false);
    const [maxSentencesPerMessage, setMaxSentencesPerMessage] = useState(3);
    const [aiDecidesMessageSplit, setAiDecidesMessageSplit] = useState(false);
    const [conversationFlow, setConversationFlow] = useState('');
    const [instructions, setInstructions] = useState('');
    const [rules, setRules] = useState<Rule[]>([]);
    const [newRule, setNewRule] = useState('');
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [botGoals, setBotGoals] = useState<BotGoal[]>([]);
    const [newGoalPrompt, setNewGoalPrompt] = useState('');
    const [newGoalIsOptional, setNewGoalIsOptional] = useState(false);
    const [editingGoal, setEditingGoal] = useState<BotGoal | null>(null);
    const [editingGoalPrompt, setEditingGoalPrompt] = useState('');
    const [editingGoalIsOptional, setEditingGoalIsOptional] = useState(false);
    const [showAIAnalyzer, setShowAIAnalyzer] = useState(false);

    useEffect(() => {
        fetchSettings();
        fetchRules();
        fetchInstructions();
        fetchBotGoals();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.botName) setBotName(data.botName);
            if (data.botTone) setBotTone(data.botTone);
            if (data.humanTakeoverTimeoutMinutes !== undefined) {
                setHumanTakeoverTimeout(data.humanTakeoverTimeoutMinutes);
            }
            if (data.enableBestTimeContact !== undefined) {
                setEnableBestTimeContact(data.enableBestTimeContact);
            }
            if (data.enableMlChatbot !== undefined) {
                setEnableMlChatbot(data.enableMlChatbot);
            }
            if (data.enableAiKnowledgeManagement !== undefined) {
                setEnableAiKnowledgeManagement(data.enableAiKnowledgeManagement);
            }
            if (data.enableAiAutonomousFollowup !== undefined) {
                setEnableAiAutonomousFollowup(data.enableAiAutonomousFollowup);
            }
            if (data.maxSentencesPerMessage !== undefined && data.maxSentencesPerMessage !== null) {
                const val = Number(data.maxSentencesPerMessage);
                if (val === -1) {
                    setAiDecidesMessageSplit(true);
                    setMaxSentencesPerMessage(3); // Default for display
                } else {
                    setAiDecidesMessageSplit(false);
                    setMaxSentencesPerMessage(val);
                }
            }
            if (data.conversationFlow !== undefined) {
                setConversationFlow(data.conversationFlow || '');
            }
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        }
    };

    const fetchRules = async () => {
        try {
            const res = await fetch('/api/rules');
            const data = await res.json();
            setRules(data.rules || []);
        } catch (error) {
            console.error('Failed to fetch rules:', error);
        }
    };

    const fetchInstructions = async () => {
        try {
            const res = await fetch('/api/instructions');
            const data = await res.json();
            setInstructions(data.instructions || '');
        } catch (error) {
            console.error('Failed to fetch instructions:', error);
        }
    };

    const fetchBotGoals = async () => {
        try {
            const res = await fetch('/api/bot-goals');
            const data = await res.json();
            setBotGoals(data.goals || []);
        } catch (error) {
            console.error('Failed to fetch bot goals:', error);
        }
    };

    const handleSaveSettings = async () => {
        setLoading(true);
        try {
            const settingsPayload = {
                botName,
                botTone,
                humanTakeoverTimeoutMinutes: humanTakeoverTimeout,
                enableBestTimeContact,
                enableMlChatbot,
                enableAiKnowledgeManagement,
                enableAiAutonomousFollowup,
                maxSentencesPerMessage: aiDecidesMessageSplit
                    ? -1  // -1 means AI decides
                    : (maxSentencesPerMessage !== null && maxSentencesPerMessage !== undefined
                        ? parseInt(String(maxSentencesPerMessage), 10)
                        : 3),
                conversationFlow
            };

            console.log('[RulesEditor] Saving settings with maxSentencesPerMessage:', settingsPayload.maxSentencesPerMessage);

            await Promise.all([
                fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settingsPayload),
                }).then(async (res) => {
                    const contentType = res.headers.get('content-type');
                    if (!res.ok) {
                        let errorData: any = {};
                        try {
                            if (contentType && contentType.includes('application/json')) {
                                errorData = await res.json();
                            } else {
                                const text = await res.text();
                                console.error('[RulesEditor] Non-JSON error response:', text);
                                errorData = { error: text || `HTTP ${res.status}: ${res.statusText}` };
                            }
                        } catch (e) {
                            console.error('[RulesEditor] Error parsing error response:', e);
                            errorData = { error: `HTTP ${res.status}: ${res.statusText}` };
                        }
                        console.error('[RulesEditor] Settings save error:', errorData, 'Status:', res.status);

                        // If it's a database column missing error, redirect to migration guide
                        if (errorData.error === 'Database column missing' || errorData.details?.includes('column does not exist')) {
                            const shouldRedirect = window.confirm(
                                'Database Migration Required\n\n' +
                                'The max_sentences_per_message column does not exist in your database.\n\n' +
                                'Click OK to open the migration guide, or Cancel to see the SQL in an alert.'
                            );

                            if (shouldRedirect) {
                                window.location.href = '/migration-guide';
                                throw new Error('Redirecting to migration guide...');
                            } else {
                                const sql = errorData.sql || 'ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS max_sentences_per_message INT DEFAULT 3;';
                                const instructions = errorData.instructions || [
                                    '1. Go to Supabase Dashboard → SQL Editor',
                                    '2. Copy and paste the SQL below',
                                    '3. Click "Run"',
                                    '4. Refresh this page and try again'
                                ];

                                const errorMsg = `Database Migration Required\n\n${errorData.details || errorData.error}\n\n${errorData.solution || ''}\n\nSQL to run:\n\n${sql}\n\nInstructions:\n${instructions.join('\n')}`;
                                alert(errorMsg);
                            }
                            throw new Error('Database column missing. Please run the migration.');
                        }

                        throw new Error(errorData.error || errorData.details || `Failed to save settings (${res.status})`);
                    }
                    const data = await res.json();
                    console.log('[RulesEditor] Settings saved successfully, maxSentencesPerMessage:', data.maxSentencesPerMessage);
                    // Update local state with saved value to ensure UI reflects what was saved
                    if (data.maxSentencesPerMessage !== undefined && data.maxSentencesPerMessage !== null) {
                        setMaxSentencesPerMessage(data.maxSentencesPerMessage);
                    }
                    return data;
                }),
                fetch('/api/instructions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instructions }),
                }).then(async (res) => {
                    if (!res.ok) {
                        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
                        throw new Error(errorData.error || 'Failed to save instructions');
                    }
                    return res.json();
                }),
            ]);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (error: any) {
            console.error('Failed to save:', error);
            // If it's a database column missing error, the alert was already shown
            // Otherwise, show a generic error message
            if (!error?.message?.includes('Database column missing')) {
                alert(`Failed to save settings: ${error?.message || 'Unknown error'}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleAddRule = async () => {
        if (!newRule.trim()) return;
        try {
            const res = await fetch('/api/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rule: newRule, priority: rules.length }),
            });
            const data = await res.json();
            if (data.success) {
                setRules([...rules, data.rule]);
                setNewRule('');
            }
        } catch (error) {
            console.error('Failed to add rule:', error);
        }
    };

    const handleDeleteRule = async (id: string) => {
        try {
            await fetch(`/api/rules?id=${id}`, { method: 'DELETE' });
            setRules(rules.filter(r => r.id !== id));
        } catch (error) {
            console.error('Failed to delete rule:', error);
        }
    };

    const handleToggleRule = async (id: string, enabled: boolean) => {
        try {
            await fetch('/api/rules', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, enabled: !enabled }),
            });
            setRules(rules.map(r => r.id === id ? { ...r, enabled: !enabled } : r));
        } catch (error) {
            console.error('Failed to toggle rule:', error);
        }
    };

    const handleAddGoal = async () => {
        if (!newGoalPrompt.trim()) return;
        try {
            const res = await fetch('/api/bot-goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    goalName: newGoalPrompt.trim(),
                    goalDescription: newGoalPrompt.trim(),
                    priorityOrder: botGoals.length,
                    isActive: true,
                    isOptional: newGoalIsOptional,
                }),
            });
            const data = await res.json();
            if (data.success) {
                await fetchBotGoals();
                setNewGoalPrompt('');
                setNewGoalIsOptional(false);
            }
        } catch (error) {
            console.error('Failed to add goal:', error);
        }
    };

    const handleDeleteGoal = async (id: string) => {
        if (!confirm('Are you sure you want to delete this goal?')) return;
        try {
            await fetch(`/api/bot-goals?id=${id}`, { method: 'DELETE' });
            await fetchBotGoals();
        } catch (error) {
            console.error('Failed to delete goal:', error);
        }
    };

    const handleToggleGoal = async (goal: BotGoal) => {
        try {
            await fetch('/api/bot-goals', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: goal.id,
                    isActive: !goal.is_active,
                }),
            });
            await fetchBotGoals();
        } catch (error) {
            console.error('Failed to toggle goal:', error);
        }
    };

    const handleToggleGoalOptional = async (goal: BotGoal) => {
        try {
            const newIsOptional = !goal.is_optional;
            // When making a goal required (not optional), also ensure it's active
            const updates: { id: string; isOptional: boolean; isActive?: boolean } = {
                id: goal.id,
                isOptional: newIsOptional,
            };
            if (!newIsOptional) {
                // Goal is becoming required, so activate it
                updates.isActive = true;
            }
            await fetch('/api/bot-goals', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            await fetchBotGoals();
        } catch (error) {
            console.error('Failed to toggle optional flag for goal:', error);
        }
    };

    const handleMoveGoal = async (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === botGoals.length - 1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        const goal = botGoals[index];
        const otherGoal = botGoals[newIndex];

        try {
            await Promise.all([
                fetch('/api/bot-goals', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: goal.id,
                        priorityOrder: otherGoal.priority_order,
                    }),
                }),
                fetch('/api/bot-goals', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: otherGoal.id,
                        priorityOrder: goal.priority_order,
                    }),
                }),
            ]);
            await fetchBotGoals();
        } catch (error) {
            console.error('Failed to move goal:', error);
        }
    };

    const handleEditGoal = (goal: BotGoal) => {
        setEditingGoal(goal);
        setEditingGoalPrompt(goal.goal_description || goal.goal_name);
        setEditingGoalIsOptional(goal.is_optional);
    };

    const handleSaveEditGoal = async () => {
        if (!editingGoal || !editingGoalPrompt.trim()) return;
        try {
            const res = await fetch('/api/bot-goals', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingGoal.id,
                    goalName: editingGoalPrompt.trim(),
                    goalDescription: editingGoalPrompt.trim(),
                    isOptional: editingGoalIsOptional,
                }),
            });
            const data = await res.json();
            if (data.success) {
                await fetchBotGoals();
                setEditingGoal(null);
                setEditingGoalPrompt('');
                setEditingGoalIsOptional(false);
            }
        } catch (error) {
            console.error('Failed to update goal:', error);
        }
    };

    const handleApplyAISuggestion = async (suggestion: any) => {
        try {
            // Handle different types of suggestions
            if (suggestion.target === 'conversation_flow') {
                if (suggestion.action === 'edit' && suggestion.newValue) {
                    setConversationFlow(suggestion.newValue);
                    await fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ conversationFlow: suggestion.newValue }),
                    });
                } else if (suggestion.action === 'remove') {
                    setConversationFlow('');
                    await fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ conversationFlow: '' }),
                    });
                } else if (suggestion.action === 'add' && suggestion.newValue) {
                    setConversationFlow(suggestion.newValue);
                    await fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ conversationFlow: suggestion.newValue }),
                    });
                }
            } else if (suggestion.target === 'conversation_style') {
                if (suggestion.action === 'edit' && suggestion.newValue) {
                    setInstructions(suggestion.newValue);
                    await fetch('/api/instructions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ instructions: suggestion.newValue }),
                    });
                } else if (suggestion.action === 'remove') {
                    setInstructions('');
                    await fetch('/api/instructions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ instructions: '' }),
                    });
                } else if (suggestion.action === 'add' && suggestion.newValue) {
                    setInstructions(suggestion.newValue);
                    await fetch('/api/instructions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ instructions: suggestion.newValue }),
                    });
                }
            } else if (suggestion.target === 'bot_rules' && suggestion.targetId) {
                if (suggestion.action === 'edit' && suggestion.newValue) {
                    await fetch('/api/rules', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: suggestion.targetId,
                            rule: suggestion.newValue,
                            edited_by_ai: true,
                            last_ai_edit_at: new Date().toISOString()
                        }),
                    });
                    await fetchRules();
                } else if (suggestion.action === 'remove') {
                    await fetch(`/api/rules?id=${suggestion.targetId}`, { method: 'DELETE' });
                    await fetchRules();
                } else if (suggestion.action === 'add' && suggestion.newValue) {
                    await fetch('/api/rules', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            rule: suggestion.newValue,
                            priority: rules.length,
                            edited_by_ai: true,
                            last_ai_edit_at: new Date().toISOString()
                        }),
                    });
                    await fetchRules();
                }
            } else if (suggestion.target === 'bot_goals' && suggestion.targetId) {
                if (suggestion.action === 'edit' && suggestion.newValue) {
                    await fetch('/api/bot-goals', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: suggestion.targetId,
                            goalName: suggestion.newValue,
                            goalDescription: suggestion.newValue,
                        }),
                    });
                    await fetchBotGoals();
                } else if (suggestion.action === 'remove') {
                    await fetch(`/api/bot-goals?id=${suggestion.targetId}`, { method: 'DELETE' });
                    await fetchBotGoals();
                } else if (suggestion.action === 'add' && suggestion.newValue) {
                    await fetch('/api/bot-goals', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            goalName: suggestion.newValue,
                            goalDescription: suggestion.newValue,
                            priorityOrder: botGoals.length,
                            isActive: true,
                        }),
                    });
                    await fetchBotGoals();
                }
            } else if (suggestion.target === 'tone_personality') {
                if (suggestion.action === 'edit' && suggestion.newValue) {
                    setBotTone(suggestion.newValue);
                    await fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ botTone: suggestion.newValue }),
                    });
                }
            } else if (suggestion.target === 'goal_ordering' && suggestion.suggestedOrder) {
                // Apply goal ordering
                for (const goalOrder of suggestion.suggestedOrder) {
                    await fetch('/api/bot-goals', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: goalOrder.id,
                            priorityOrder: goalOrder.newPriority,
                        }),
                    });
                }
                await fetchBotGoals();
            } else if (suggestion.suggestedOrder) {
                // Handle goal ordering from goalOrdering object
                for (const goalOrder of suggestion.suggestedOrder) {
                    await fetch('/api/bot-goals', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: goalOrder.id,
                            priorityOrder: goalOrder.newPriority,
                        }),
                    });
                }
                await fetchBotGoals();
            } else if (suggestion.improvedPrompt) {
                // Handle prompt improvements
                if (suggestion.target === 'conversation_flow') {
                    setConversationFlow(suggestion.improvedPrompt);
                    await fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ conversationFlow: suggestion.improvedPrompt }),
                    });
                } else if (suggestion.target === 'conversation_style') {
                    setInstructions(suggestion.improvedPrompt);
                    await fetch('/api/instructions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ instructions: suggestion.improvedPrompt }),
                    });
                } else if (suggestion.target === 'bot_goals' && suggestion.targetId) {
                    await fetch('/api/bot-goals', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: suggestion.targetId,
                            goalName: suggestion.improvedPrompt,
                            goalDescription: suggestion.improvedPrompt,
                        }),
                    });
                    await fetchBotGoals();
                }
            }
        } catch (error) {
            console.error('Failed to apply AI suggestion:', error);
            throw error;
        }
    };

    return (
        <div className="flex-1 bg-white flex flex-col h-full overflow-hidden font-sans">
            {/* Header */}
            <div className="h-16 border-b border-gray-100 flex items-center justify-between px-8 bg-white flex-shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                        <Bot size={20} />
                    </div>
                    <span className="text-lg font-medium text-gray-900 tracking-tight">Bot Configuration</span>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowAIAnalyzer(true)}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium transition-all active:scale-95 shadow-sm bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700"
                    >
                        <Sparkles size={18} />
                        AI Analyzer
                    </button>
                    <button
                        onClick={handleSaveSettings}
                        disabled={loading}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium transition-all active:scale-95 shadow-sm ${saved
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-gray-900 text-white hover:bg-black'
                            }`}
                    >
                        <Save size={18} />
                        {saved ? 'Saved Successfully' : loading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-white p-6 md:p-8 flex justify-center">
                <div className="w-full max-w-4xl space-y-8 pb-12">

                    {/* Bot Identity Card */}
                    <div className="bg-white rounded-[24px] p-8 border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="text-xl font-normal text-gray-900 mb-6 flex items-center gap-2">
                            Bot Identity
                        </h3>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700 ml-1">Bot Name</label>
                                <input
                                    type="text"
                                    value={botName}
                                    onChange={(e) => setBotName(e.target.value)}
                                    placeholder="e.g., WebNegosyo Assistant"
                                    className="w-full px-4 py-3 bg-gray-50 border-gray-100 border focus:bg-white rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder:text-gray-400"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700 ml-1">Tone & Personality</label>
                                <input
                                    type="text"
                                    value={botTone}
                                    onChange={(e) => setBotTone(e.target.value)}
                                    placeholder="e.g., Friendly, professional"
                                    className="w-full px-4 py-3 bg-gray-50 border-gray-100 border focus:bg-white rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder:text-gray-400"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Human Takeover Settings */}
                    <div className="bg-white rounded-[24px] p-8 border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                                <Clock size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-gray-900">Human Takeover</h3>
                                <p className="text-gray-500 text-sm mt-1">
                                    When you manually reply, the AI pauses for a set duration.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100 max-w-md">
                            <input
                                type="number"
                                min="1"
                                max="60"
                                value={humanTakeoverTimeout}
                                onChange={(e) => setHumanTakeoverTimeout(Math.max(1, Math.min(60, parseInt(e.target.value) || 5)))}
                                className="w-20 px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 text-center font-medium bg-white"
                            />
                            <span className="text-gray-700 font-medium">minutes before AI resumes</span>
                        </div>
                    </div>

                    {/* Message Length Settings */}
                    <div className="bg-white rounded-[24px] p-8 border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 bg-green-50 text-green-600 rounded-2xl">
                                <Bot size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-gray-900">Message Length Limit</h3>
                                <p className="text-gray-500 text-sm mt-1">
                                    Control how many sentences the AI can send per message. This helps keep responses concise and engaging.
                                </p>
                            </div>
                        </div>

                        {/* AI Decides Toggle */}
                        <div className="flex items-center justify-between bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-2xl border border-purple-100 mb-4">
                            <div className="flex-1">
                                <div className="font-medium text-gray-900 mb-1 flex items-center gap-2">
                                    <Sparkles size={16} className="text-purple-600" />
                                    Let AI Decide
                                </div>
                                <p className="text-sm text-gray-500">
                                    AI will intelligently decide whether to split long messages based on context, topic changes, and readability.
                                </p>
                            </div>
                            <button
                                onClick={() => setAiDecidesMessageSplit(!aiDecidesMessageSplit)}
                                className={`ml-4 p-2 rounded-lg transition-colors ${aiDecidesMessageSplit
                                    ? 'text-purple-600 bg-purple-100 hover:bg-purple-200'
                                    : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
                                    }`}
                                title={aiDecidesMessageSplit ? 'Disable AI-decides mode' : 'Enable AI-decides mode'}
                            >
                                {aiDecidesMessageSplit ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                            </button>
                        </div>

                        {/* Manual Sentence Limit - only show when AI Decides is OFF */}
                        {!aiDecidesMessageSplit && (
                            <>
                                <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100 max-w-md">
                                    <input
                                        type="number"
                                        min="0"
                                        max="20"
                                        step="1"
                                        value={maxSentencesPerMessage}
                                        onChange={(e) => {
                                            const inputValue = e.target.value;
                                            // Allow empty input while typing
                                            if (inputValue === '') {
                                                setMaxSentencesPerMessage(0);
                                                return;
                                            }
                                            const value = parseInt(inputValue, 10);
                                            // Allow values from 0 to 20, including 1
                                            if (!isNaN(value) && value >= 0 && value <= 20) {
                                                setMaxSentencesPerMessage(value);
                                            }
                                        }}
                                        onBlur={(e) => {
                                            // Ensure value is valid on blur
                                            const value = parseInt(e.target.value, 10);
                                            if (isNaN(value) || value < 0) {
                                                setMaxSentencesPerMessage(0);
                                            } else if (value > 20) {
                                                setMaxSentencesPerMessage(20);
                                            }
                                        }}
                                        className="w-20 px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900 text-center font-medium bg-white"
                                    />
                                    <span className="text-gray-700 font-medium">
                                        {maxSentencesPerMessage === 0
                                            ? 'sentences (no limit)'
                                            : maxSentencesPerMessage === 1
                                                ? 'sentence per message'
                                                : 'sentences per message'}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-2 ml-1">
                                    {maxSentencesPerMessage === 0
                                        ? 'No limit set - messages can be any length (not recommended for chat conversations)'
                                        : `AI responses will be limited to ${maxSentencesPerMessage} sentence${maxSentencesPerMessage === 1 ? '' : 's'} maximum. Set to 0 for no limit.`}
                                </p>
                            </>
                        )}

                        {aiDecidesMessageSplit && (
                            <p className="text-sm text-purple-700 bg-purple-50 p-3 rounded-xl border border-purple-100">
                                🤖 AI will analyze each response and decide the best way to split messages for optimal readability and engagement.
                            </p>
                        )}
                    </div>

                    {/* Best Time to Contact Settings */}
                    <div className="bg-white rounded-[24px] p-8 border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                                <Clock size={24} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-medium text-gray-900">Best Time to Contact</h3>
                                <p className="text-gray-500 text-sm mt-1">
                                    Schedule follow-up messages based on optimal contact times. The chatbot will analyze message history to determine when contacts are most likely to respond.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <div className="flex-1">
                                <div className="font-medium text-gray-900 mb-1">Enable Best Time Contact</div>
                                <p className="text-sm text-gray-500">
                                    When enabled, follow-up messages will be scheduled for optimal contact times instead of sending immediately.
                                </p>
                            </div>
                            <button
                                onClick={() => setEnableBestTimeContact(!enableBestTimeContact)}
                                className={`ml-4 p-2 rounded-lg transition-colors ${enableBestTimeContact
                                    ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                                    : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
                                    }`}
                                title={enableBestTimeContact ? 'Disable best time contact' : 'Enable best time contact'}
                            >
                                {enableBestTimeContact ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                            </button>
                        </div>
                    </div>

                    {/* ML Chatbot Settings */}
                    <div className="bg-white rounded-[24px] p-8 border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                                <Bot size={24} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-medium text-gray-900">ML-Powered Chatbot</h3>
                                <p className="text-gray-500 text-sm mt-1">
                                    Enable online learning to automatically optimize conversational strategies based on user behavior. The chatbot learns which strategies increase conversions and adapts continuously.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                <div className="flex-1">
                                    <div className="font-medium text-gray-900 mb-1">Enable ML Chatbot</div>
                                    <p className="text-sm text-gray-500">
                                        When enabled, the chatbot uses contextual bandits to select optimal strategies (qualification, discounts, recommendations, etc.) based on conversation context and learned performance.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setEnableMlChatbot(!enableMlChatbot)}
                                    className={`ml-4 p-2 rounded-lg transition-colors ${enableMlChatbot
                                        ? 'text-purple-600 bg-purple-50 hover:bg-purple-100'
                                        : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
                                        }`}
                                    title={enableMlChatbot ? 'Disable ML chatbot' : 'Enable ML chatbot'}
                                >
                                    {enableMlChatbot ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                                </button>
                            </div>

                            {enableMlChatbot && (
                                <div className="flex items-center justify-between bg-purple-50/50 p-4 rounded-2xl border border-purple-100">
                                    <div className="flex-1">
                                        <div className="font-medium text-gray-900 mb-1">AI Knowledge Base Management</div>
                                        <p className="text-sm text-gray-500">
                                            Allow the AI to automatically add, remove, and edit its own knowledge base, rules, personality, and conversation styles based on conversation patterns and performance.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setEnableAiKnowledgeManagement(!enableAiKnowledgeManagement)}
                                        className={`ml-4 p-2 rounded-lg transition-colors ${enableAiKnowledgeManagement
                                            ? 'text-purple-600 bg-purple-100 hover:bg-purple-200'
                                            : 'text-gray-400 bg-white hover:bg-gray-50'
                                            }`}
                                        title={enableAiKnowledgeManagement ? 'Disable AI knowledge management' : 'Enable AI knowledge management'}
                                    >
                                        {enableAiKnowledgeManagement ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                                    </button>
                                </div>
                            )}

                            {/* AI Autonomous Follow-up Toggle */}
                            <div className="flex items-center justify-between bg-gradient-to-r from-cyan-50 to-teal-50 p-4 rounded-2xl border border-cyan-100">
                                <div className="flex-1">
                                    <div className="font-medium text-gray-900 mb-1 flex items-center gap-2">
                                        <Sparkles size={16} className="text-cyan-600" />
                                        AI Autonomous Follow-up
                                    </div>
                                    <p className="text-sm text-gray-500">
                                        Enable the AI to think autonomously about conversations, proactively suggest next steps, and make intelligent follow-up decisions based on its own experience and context analysis.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setEnableAiAutonomousFollowup(!enableAiAutonomousFollowup)}
                                    className={`ml-4 p-2 rounded-lg transition-colors ${enableAiAutonomousFollowup
                                        ? 'text-cyan-600 bg-cyan-100 hover:bg-cyan-200'
                                        : 'text-gray-400 bg-white hover:bg-gray-50'
                                        }`}
                                    title={enableAiAutonomousFollowup ? 'Disable AI autonomous follow-up' : 'Enable AI autonomous follow-up'}
                                >
                                    {enableAiAutonomousFollowup ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Conversation Flow */}
                    <div className="bg-white rounded-[24px] p-8 border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                        <div className="mb-6">
                            <h3 className="text-xl font-normal text-gray-900 mb-2">Conversation Flow</h3>
                            <p className="text-gray-500 text-sm">
                                Define the overall structure and progression of conversations. This is different from Bot Goals below -
                                Flow describes the step-by-step journey (stages, decision points, conversation roadmap),
                                while Goals are specific objectives to achieve.
                            </p>
                        </div>
                        <div className="relative">
                            <textarea
                                value={conversationFlow}
                                onChange={(e) => setConversationFlow(e.target.value)}
                                placeholder="E.g., 1. Greet warmly and introduce yourself. 2. Ask about their business needs. 3. Present relevant solutions. 4. Address objections. 5. Close with next steps..."
                                className="w-full p-6 bg-blue-50/30 border border-blue-200/50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 transition-all text-gray-800 font-mono text-sm leading-relaxed resize-y min-h-[200px]"
                            />
                            <div className="absolute top-4 right-4 text-xs font-medium text-blue-600/50 bg-blue-100/50 px-2 py-1 rounded">
                                FLOW PROMPT
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-3 ml-1">
                            Use this to define the conversation roadmap, stages, or decision trees. This guides the overall structure,
                            while Bot Goals (below) define specific objectives to achieve during conversations.
                        </p>
                    </div>

                    {/* Bot Goals Section */}
                    <div className="bg-white rounded-[24px] border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                        <div className="p-6 border-b border-gray-100 bg-white flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                                    <Target size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-normal text-gray-900">Bot Goals</h3>
                                    <p className="text-sm text-gray-400 mt-1">Define goals the bot should work towards during conversations</p>
                                </div>
                            </div>
                            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-semibold tracking-wide">
                                {botGoals.filter(g => g.is_active).length} ACTIVE
                            </span>
                        </div>

                        {/* Add New Goal */}
                        <div className="p-6 bg-gray-50/50 border-b border-gray-100">
                            <div className="flex flex-col gap-3">
                                <div className="flex gap-3 items-center">
                                    <input
                                        type="text"
                                        value={newGoalPrompt}
                                        onChange={(e) => setNewGoalPrompt(e.target.value)}
                                        placeholder="Enter a goal prompt... (e.g., Qualify the lead by asking about their budget)"
                                        className="flex-1 px-5 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900 bg-white shadow-sm transition-all"
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddGoal()}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setNewGoalIsOptional(!newGoalIsOptional)}
                                        className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-2 ${newGoalIsOptional
                                            ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                                            }`}
                                        title={newGoalIsOptional ? 'Mark as required' : 'Mark as optional'}
                                    >
                                        {newGoalIsOptional ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                        <span>{newGoalIsOptional ? 'Optional goal' : 'Required goal'}</span>
                                    </button>
                                    <button
                                        onClick={handleAddGoal}
                                        className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 hover:shadow-lg transition-all active:scale-95 flex items-center gap-2 font-medium"
                                    >
                                        <Plus size={20} />
                                        Add Goal
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500">
                                    Use the switch to mark a goal as optional (nice-to-have) versus required.
                                </p>
                            </div>
                        </div>

                        {/* Goals List */}
                        <div className="divide-y divide-gray-50">
                            {botGoals.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Target size={24} className="text-gray-300" />
                                    </div>
                                    <p className="text-gray-500 font-medium">No goals added yet</p>
                                    <p className="text-sm text-gray-400 mt-1">Add goals above to guide your bot's objectives.</p>
                                </div>
                            ) : (
                                botGoals.map((goal, index) => (
                                    editingGoal?.id === goal.id ? (
                                        <div key={goal.id} className="p-5 bg-indigo-50/30 border-l-4 border-indigo-500">
                                            <div className="flex gap-3">
                                                <input
                                                    type="text"
                                                    value={editingGoalPrompt}
                                                    onChange={(e) => setEditingGoalPrompt(e.target.value)}
                                                    className="flex-1 px-4 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900 bg-white"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveEditGoal();
                                                        if (e.key === 'Escape') {
                                                            setEditingGoal(null);
                                                            setEditingGoalPrompt('');
                                                            setEditingGoalIsOptional(false);
                                                        }
                                                    }}
                                                    autoFocus
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingGoalIsOptional(!editingGoalIsOptional)}
                                                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all flex items-center gap-2 ${editingGoalIsOptional
                                                        ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                                                        }`}
                                                    title={editingGoalIsOptional ? 'Mark as required' : 'Mark as optional'}
                                                >
                                                    {editingGoalIsOptional ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                                    <span className="hidden sm:inline">{editingGoalIsOptional ? 'Optional' : 'Required'}</span>
                                                </button>
                                                <button
                                                    onClick={handleSaveEditGoal}
                                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingGoal(null);
                                                        setEditingGoalPrompt('');
                                                        setEditingGoalIsOptional(false);
                                                    }}
                                                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            key={goal.id}
                                            className={`group flex items-center gap-4 p-5 hover:bg-gray-50 transition-colors ${!goal.is_active ? 'opacity-60 bg-gray-50/50' : 'bg-white'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleMoveGoal(index, 'up')}
                                                    disabled={index === 0}
                                                    className={`p-1.5 rounded-lg transition-colors ${index === 0
                                                        ? 'text-gray-300 cursor-not-allowed'
                                                        : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                                                        }`}
                                                    title="Move up"
                                                >
                                                    <ArrowUp size={16} />
                                                </button>
                                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold">
                                                    {index + 1}
                                                </div>
                                                <button
                                                    onClick={() => handleMoveGoal(index, 'down')}
                                                    disabled={index === botGoals.length - 1}
                                                    className={`p-1.5 rounded-lg transition-colors ${index === botGoals.length - 1
                                                        ? 'text-gray-300 cursor-not-allowed'
                                                        : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                                                        }`}
                                                    title="Move down"
                                                >
                                                    <ArrowDown size={16} />
                                                </button>
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p className={`text-base ${goal.is_active ? 'text-gray-900' : 'text-gray-500 line-through'}`}>
                                                    {goal.goal_description || goal.goal_name}
                                                </p>
                                                <div className="mt-1 flex items-center gap-2">
                                                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${goal.is_optional
                                                        ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                                                        }`}>
                                                        {goal.is_optional ? 'Optional' : 'Required'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleEditGoal(goal)}
                                                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="Edit goal"
                                                >
                                                    <Edit2 size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleToggleGoalOptional(goal)}
                                                    className={`p-2 rounded-lg transition-colors ${goal.is_optional
                                                        ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                                                        : 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                                                        }`}
                                                    title={goal.is_optional ? 'Mark as required' : 'Mark as optional'}
                                                >
                                                    {goal.is_optional ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                                </button>
                                                <button
                                                    onClick={() => handleToggleGoal(goal)}
                                                    className={`p-2 rounded-lg transition-colors ${goal.is_active
                                                        ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                                                        : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
                                                        }`}
                                                    title={goal.is_active ? 'Disable goal' : 'Enable goal'}
                                                >
                                                    {goal.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteGoal(goal.id)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Delete goal"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                ))
                            )}
                        </div>
                    </div>

                    {/* Conversation Style Instructions */}
                    <div className="bg-white rounded-[24px] p-8 border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
                        <div className="mb-6">
                            <h3 className="text-xl font-normal text-gray-900 mb-2">Conversation Style Instructions</h3>
                            <p className="text-gray-500 text-sm">Define how the bot should converse, including tone and specific dos/don'ts.</p>
                        </div>
                        <div className="relative">
                            <textarea
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                placeholder="E.g., Talk like a real Filipino salesperson texting, not a script. NO multiple choice questions..."
                                className="w-full p-6 bg-yellow-50/30 border border-yellow-200/50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-yellow-400/20 focus:border-yellow-400 transition-all text-gray-800 font-mono text-sm leading-relaxed resize-y min-h-[200px]"
                            />
                            <div className="absolute top-4 right-4 text-xs font-medium text-yellow-600/50 bg-yellow-100/50 px-2 py-1 rounded">
                                SYSTEM PROMPT
                            </div>
                        </div>
                    </div>

                    {/* Rules Table */}
                    <div className="bg-white rounded-[24px] border border-gray-200/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                        <div className="p-6 border-b border-gray-100 bg-white flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-normal text-gray-900">Bot Rules</h3>
                                <p className="text-sm text-gray-400 mt-1">Specific rules checked before every response</p>
                            </div>
                            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-semibold tracking-wide">
                                {rules.filter(r => r.enabled).length} ACTIVE
                            </span>
                        </div>

                        {/* Add New Rule */}
                        <div className="p-6 bg-gray-50/50 border-b border-gray-100">
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={newRule}
                                    onChange={(e) => setNewRule(e.target.value)}
                                    placeholder="Type a new rule... (e.g., Never mention competitors)"
                                    className="flex-1 px-5 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-gray-900 bg-white shadow-sm transition-all"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddRule()}
                                />
                                <button
                                    onClick={handleAddRule}
                                    className="px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 hover:shadow-lg transition-all active:scale-95 flex items-center gap-2 font-medium"
                                >
                                    <Plus size={20} />
                                    Add
                                </button>
                            </div>
                        </div>

                        {/* Rules List */}
                        <div className="divide-y divide-gray-50">
                            {rules.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Bot size={24} className="text-gray-300" />
                                    </div>
                                    <p className="text-gray-500 font-medium">No rules added yet</p>
                                    <p className="text-sm text-gray-400 mt-1">Add rules above to guide your bot's behavior.</p>
                                </div>
                            ) : (
                                rules.map((rule, index) => (
                                    <div
                                        key={rule.id}
                                        className={`group flex items-center gap-4 p-5 hover:bg-gray-50 transition-colors ${!rule.enabled ? 'opacity-60 bg-gray-50/50' :
                                            rule.edited_by_ml_ai ? 'bg-blue-50/50 border-l-4 border-blue-500' : // ML AI edits - blue
                                                rule.edited_by_ai ? 'bg-purple-50/50 border-l-4 border-purple-400' : // Regular AI edits - purple
                                                    'bg-white'
                                            }`}
                                    >
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-400 text-xs font-bold">
                                            {index + 1}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                {rule.edited_by_ml_ai && (
                                                    <div title="Edited by ML AI">
                                                        <Bot size={14} className="text-blue-600 flex-shrink-0" />
                                                    </div>
                                                )}
                                                {rule.edited_by_ai && !rule.edited_by_ml_ai && (
                                                    <div title="Edited by AI">
                                                        <Bot size={14} className="text-purple-600 flex-shrink-0" />
                                                    </div>
                                                )}
                                                <p className={`text-base ${rule.enabled ? 'text-gray-900' : 'text-gray-500 line-through'}`}>
                                                    {rule.rule}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleToggleRule(rule.id, rule.enabled)}
                                                className={`p-2 rounded-lg transition-colors ${rule.enabled
                                                    ? 'text-teal-600 bg-teal-50 hover:bg-teal-100'
                                                    : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
                                                    }`}
                                                title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                                            >
                                                {rule.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteRule(rule.id)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* AI Edits Panel */}
                    {enableAiKnowledgeManagement && (
                        <div className="bg-white rounded-[24px] p-8 border border-purple-200/60 shadow-sm">
                            <div className="mb-4">
                                <h3 className="text-lg font-medium text-gray-900 mb-1">Recent AI Edits</h3>
                                <p className="text-sm text-gray-500">View and undo recent AI knowledge base changes</p>
                            </div>
                            <AIEditsPanel onUndo={() => {
                                fetchRules();
                                fetchSettings();
                            }} />
                        </div>
                    )}

                    {/* Follow-Up Message Tester */}
                    <FollowUpMessageTester botName={botName} botTone={botTone} />

                    {/* Bot Style Analyzer */}
                    <BotStyleAnalyzer onSuggestionApplied={() => {
                        // Refresh rules and instructions when suggestions are applied
                        fetchRules();
                        fetchInstructions();
                    }} />
                </div>
            </div>

            {/* AI Configuration Analyzer Modal */}
            {showAIAnalyzer && (
                <BotConfigurationAIAnalyzer
                    onClose={() => setShowAIAnalyzer(false)}
                    onApplySuggestion={handleApplyAISuggestion}
                    onRefresh={() => {
                        fetchSettings();
                        fetchRules();
                        fetchInstructions();
                        fetchBotGoals();
                    }}
                />
            )}
        </div>
    );
}
