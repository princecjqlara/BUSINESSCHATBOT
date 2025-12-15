'use client';

import { useState, useEffect, Suspense } from 'react';
import { ArrowLeft, Facebook, Trash2, CheckCircle, AlertCircle, Loader2, RefreshCw, Target, Plus, Edit2, GripVertical, X, ToggleLeft, ToggleRight } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageSelector from '@/app/components/PageSelector';

interface ConnectedPage {
    id: string;
    page_id: string;
    page_name: string;
    is_active: boolean;
    webhook_subscribed: boolean;
    profile_pic: string | null;
    created_at: string;
}

interface FacebookPageData {
    id: string;
    name: string;
    access_token: string;
    picture: string | null;
}

interface BotGoal {
    id: string;
    goal_name: string;
    goal_description: string | null;
    priority_order: number | null;
    is_active: boolean;
    is_optional: boolean;
    created_at: string;
    updated_at: string;
}

function SettingsContent() {
    const searchParams = useSearchParams();

    const [message, setMessage] = useState('');
    const [connectedPages, setConnectedPages] = useState<ConnectedPage[]>([]);
    const [loadingPages, setLoadingPages] = useState(true);
    const [syncingPageId, setSyncingPageId] = useState<string | null>(null);

    // Facebook OAuth state
    const [showPageSelector, setShowPageSelector] = useState(false);
    const [availablePages, setAvailablePages] = useState<FacebookPageData[]>([]);

    // Bot Goals state
    const [botGoals, setBotGoals] = useState<BotGoal[]>([]);
    const [loadingGoals, setLoadingGoals] = useState(true);
    const [showGoalModal, setShowGoalModal] = useState(false);
    const [editingGoal, setEditingGoal] = useState<BotGoal | null>(null);
    const [goalForm, setGoalForm] = useState<{ goalName: string; goalDescription: string; priorityOrder: number | null; isActive: boolean; isOptional: boolean }>({ goalName: '', goalDescription: '', priorityOrder: null, isActive: true, isOptional: false });

    // Handle OAuth callback results
    useEffect(() => {
        const success = searchParams.get('success');
        const error = searchParams.get('error');
        const facebookPagesParam = searchParams.get('facebook_pages');

        if (error) {
            setMessage(`Error: ${decodeURIComponent(error)}`);
        } else if (success && facebookPagesParam) {
            try {
                const pages = JSON.parse(decodeURIComponent(facebookPagesParam));
                setAvailablePages(pages);
                setShowPageSelector(true);
                // Clear URL params after processing
                window.history.replaceState({}, '', '/settings');
            } catch (e) {
                console.error('Failed to parse pages data:', e);
                setMessage('Failed to process Facebook pages data');
            }
        }
    }, [searchParams]);

    useEffect(() => {
        fetchConnectedPages();
        fetchBotGoals();
    }, []);

    const fetchConnectedPages = async () => {
        setLoadingPages(true);
        try {
            const res = await fetch('/api/facebook/pages');
            const data = await res.json();
            setConnectedPages(data.pages || []);
        } catch (error) {
            console.error('Failed to fetch connected pages:', error);
        } finally {
            setLoadingPages(false);
        }
    };

    const handleFacebookLogin = () => {
        // Redirect to Facebook OAuth
        window.location.href = '/api/auth/facebook/login';
    };

    const handleConnectPages = async (pages: FacebookPageData[]) => {
        const results: string[] = [];

        for (const page of pages) {
            try {
                const res = await fetch('/api/facebook/pages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pageId: page.id,
                        pageName: page.name,
                        pageAccessToken: page.access_token,
                        profilePic: page.picture,
                    }),
                });

                const data = await res.json();
                if (data.success) {
                    results.push(`${page.name}: Connected${data.webhookSubscribed ? ' & subscribed' : ''}`);
                } else {
                    results.push(`${page.name}: ${data.error || 'Failed'}`);
                }
            } catch (error) {
                results.push(`${page.name}: Error connecting`);
            }
        }

        setShowPageSelector(false);
        setAvailablePages([]);
        await fetchConnectedPages();
        setMessage(results.join('. '));
        setTimeout(() => setMessage(''), 5000);
    };

    const handleDisconnectPage = async (pageId: string, pageName: string) => {
        if (!confirm(`Are you sure you want to disconnect "${pageName}"?`)) {
            return;
        }

        try {
            const res = await fetch(`/api/facebook/pages?pageId=${pageId}`, {
                method: 'DELETE',
            });

            const data = await res.json();
            if (data.success) {
                setMessage(`"${pageName}" disconnected successfully`);
                await fetchConnectedPages();
            } else {
                setMessage(`Failed to disconnect: ${data.error}`);
            }
        } catch (error) {
            setMessage('Error disconnecting page');
        }
        setTimeout(() => setMessage(''), 3000);
    };

    const handleSyncPage = async (pageId: string, pageName: string) => {
        setSyncingPageId(pageId);
        setMessage(`Syncing contacts from ${pageName}...`);

        try {
            const res = await fetch('/api/facebook/pages/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageId }),
            });

            const data = await res.json();
            if (data.success) {
                setMessage(data.message || `Successfully synced ${data.synced || 0} contacts from ${pageName}`);
            } else {
                setMessage(`Sync failed: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            setMessage('Error syncing contacts');
        } finally {
            setSyncingPageId(null);
            setTimeout(() => setMessage(''), 5000);
        }
    };

    // Bot Goals functions
    const fetchBotGoals = async () => {
        setLoadingGoals(true);
        try {
            const res = await fetch('/api/bot-goals');
            const data = await res.json();
            setBotGoals(data.goals || []);
        } catch (error) {
            console.error('Failed to fetch bot goals:', error);
            setMessage('Failed to load bot goals');
        } finally {
            setLoadingGoals(false);
        }
    };

    const handleAddGoal = () => {
        setEditingGoal(null);
        setGoalForm({ goalName: '', goalDescription: '', priorityOrder: null, isActive: true, isOptional: false });
        setShowGoalModal(true);
    };

    const handleEditGoal = (goal: BotGoal) => {
        setEditingGoal(goal);
        setGoalForm({
            goalName: goal.goal_name,
            goalDescription: goal.goal_description || '',
            priorityOrder: goal.priority_order,
            isActive: goal.is_active,
            isOptional: goal.is_optional,
        });
        setShowGoalModal(true);
    };

    const handleSaveGoal = async () => {
        if (!goalForm.goalName.trim()) {
            setMessage('Goal name is required');
            setTimeout(() => setMessage(''), 3000);
            return;
        }

        try {
            if (editingGoal) {
                // Update existing goal
                const res = await fetch('/api/bot-goals', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: editingGoal.id,
                        goalName: goalForm.goalName,
                        goalDescription: goalForm.goalDescription,
                        priorityOrder: goalForm.priorityOrder,
                        isActive: goalForm.isActive,
                        isOptional: goalForm.isOptional,
                    }),
                });

                const data = await res.json();
                if (data.success) {
                    setMessage('Goal updated successfully');
                    await fetchBotGoals();
                    setShowGoalModal(false);
                } else {
                    setMessage(`Failed to update goal: ${data.error}`);
                }
            } else {
                // Create new goal
                const res = await fetch('/api/bot-goals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        goalName: goalForm.goalName,
                        goalDescription: goalForm.goalDescription,
                        priorityOrder: goalForm.priorityOrder,
                        isActive: goalForm.isActive,
                        isOptional: goalForm.isOptional,
                    }),
                });

                const data = await res.json();
                if (data.success) {
                    setMessage('Goal created successfully');
                    await fetchBotGoals();
                    setShowGoalModal(false);
                } else {
                    setMessage(`Failed to create goal: ${data.error}`);
                }
            }
        } catch (error) {
            setMessage('Error saving goal');
        }
        setTimeout(() => setMessage(''), 3000);
    };

    const handleDeleteGoal = async (goalId: string, goalName: string) => {
        if (!confirm(`Are you sure you want to delete "${goalName}"?`)) {
            return;
        }

        try {
            const res = await fetch(`/api/bot-goals?id=${goalId}`, {
                method: 'DELETE',
            });

            const data = await res.json();
            if (data.success) {
                setMessage('Goal deleted successfully');
                await fetchBotGoals();
            } else {
                setMessage(`Failed to delete goal: ${data.error}`);
            }
        } catch (error) {
            setMessage('Error deleting goal');
        }
        setTimeout(() => setMessage(''), 3000);
    };

    const handleToggleOptional = async (goal: BotGoal) => {
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
            const res = await fetch('/api/bot-goals', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            const data = await res.json();
            if (data.success) {
                await fetchBotGoals();
            } else {
                setMessage(data.error || 'Failed to update goal');
                setTimeout(() => setMessage(''), 3000);
            }
        } catch (error) {
            setMessage('Error updating goal');
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const handleUpdatePriority = async (goalId: string, newPriority: number | null) => {
        try {
            const res = await fetch('/api/bot-goals', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: goalId,
                    priorityOrder: newPriority,
                }),
            });

            const data = await res.json();
            if (!data.success) {
                console.error('Failed to update priority:', data.error);
            }
        } catch (error) {
            console.error('Failed to update priority:', error);
        }
    };

    const persistPriorities = async (goals: BotGoal[]) => {
        // Write priorities sequentially (0-based) to avoid null/no-op swaps
        await Promise.all(
            goals.map((goal, idx) => handleUpdatePriority(goal.id, idx))
        );
        await fetchBotGoals();
    };

    const moveGoal = async (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === botGoals.length - 1) return;

        const reordered = [...botGoals];
        const [moved] = reordered.splice(index, 1);
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        reordered.splice(newIndex, 0, moved);
        setBotGoals(reordered);
        await persistPriorities(reordered);
    };

    return (
        <div className="min-h-screen bg-white font-sans">
            <div className="max-w-5xl mx-auto p-8 lg:p-12 space-y-12">
                {/* Header Section */}
                <div className="flex items-center gap-6">
                    <Link
                        href="/"
                        className="p-3 hover:bg-gray-50 rounded-full text-gray-400 hover:text-gray-900 transition-colors"
                        aria-label="Go back"
                    >
                        <ArrowLeft size={24} />
                    </Link>
                    <div>
                        <h1 className="text-4xl font-light text-gray-900 tracking-tight">Settings</h1>
                        <p className="text-gray-500 mt-2 text-lg font-light">Manage your connected accounts</p>
                    </div>
                </div>

                {/* Message Display */}
                {message && (
                    <div className={`p-4 rounded-xl text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${message.includes('success') || message.includes('Connected')
                        ? 'bg-green-50 text-green-800'
                        : 'bg-red-50 text-red-800'
                        }`}>
                        {message.includes('success') || message.includes('Connected') ? (
                            <CheckCircle size={20} />
                        ) : (
                            <AlertCircle size={20} />
                        )}
                        {message}
                    </div>
                )}

                {/* Facebook Connection Card */}
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-start gap-5">
                            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
                                <Facebook size={32} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-normal text-gray-900">Facebook Pages</h2>
                                <p className="text-gray-500 mt-1 text-base font-light">
                                    Connect your pages to enable AI messaging automation
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleFacebookLogin}
                            className="flex items-center gap-2 px-8 py-3 bg-teal-600 text-white rounded-full hover:bg-black hover:shadow-lg transition-all font-medium text-sm tracking-wide active:scale-95"
                        >
                            <Facebook size={18} />
                            Connect New Page
                        </button>
                    </div>

                    {/* Connected Pages List */}
                    <div className="space-y-4">
                        {loadingPages ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                <Loader2 className="animate-spin mb-3" size={24} />
                                <span className="font-light text-sm">Loading your pages...</span>
                            </div>
                        ) : connectedPages.length === 0 ? (
                            <div className="text-center py-16 px-4 bg-gray-50/50 rounded-[32px] border border-dashed border-gray-200">
                                <div className="bg-white p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-sm border border-gray-100">
                                    <Facebook size={24} className="text-gray-300" />
                                </div>
                                <h3 className="text-gray-900 font-medium mb-1">No pages connected</h3>
                                <p className="text-gray-500 text-sm max-w-sm mx-auto font-light">
                                    Link your Facebook pages to start automating replies.
                                </p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {connectedPages.map((page) => (
                                    <div
                                        key={page.id}
                                        className="group flex flex-col sm:flex-row items-start sm:items-center gap-6 p-6 bg-white border border-gray-100 rounded-[24px] hover:shadow-lg transition-all duration-300 hover:border-gray-200"
                                    >
                                        {/* Page Picture */}
                                        <div className="relative">
                                            {page.profile_pic ? (
                                                <img
                                                    src={page.profile_pic}
                                                    alt={page.page_name}
                                                    className="w-16 h-16 rounded-2xl object-cover shadow-sm bg-gray-50"
                                                />
                                            ) : (
                                                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
                                                    <span className="text-xl font-bold text-gray-400">
                                                        {page.page_name.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                            {page.is_active && (
                                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-4 border-white rounded-full"></div>
                                            )}
                                        </div>

                                        {/* Page Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="font-semibold text-gray-900 text-xl truncate tracking-tight">
                                                    {page.page_name}
                                                </h3>
                                                <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-md font-mono">
                                                    {page.page_id}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3">
                                                {page.webhook_subscribed ? (
                                                    <span className="inline-flex items-center gap-1.5 text-sm text-green-700 font-medium">
                                                        <CheckCircle size={16} className="text-green-600" />
                                                        Active & Synced
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 text-sm text-amber-700 font-medium">
                                                        <AlertCircle size={16} className="text-amber-600" />
                                                        Setup Incomplete
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                                            <button
                                                onClick={() => handleSyncPage(page.page_id, page.page_name)}
                                                disabled={syncingPageId === page.page_id}
                                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {syncingPageId === page.page_id ? (
                                                    <>
                                                        <Loader2 size={18} className="animate-spin" />
                                                        <span className="sm:hidden">Syncing...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <RefreshCw size={18} />
                                                        <span className="sm:hidden">Sync</span>
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleDisconnectPage(page.page_id, page.page_name)}
                                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-all text-sm font-medium"
                                            >
                                                <Trash2 size={18} />
                                                <span className="sm:hidden">Disconnect</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Bot Goals Section */}
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-start gap-5">
                            <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl">
                                <Target size={32} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-normal text-gray-900">Bot Goals</h2>
                                <p className="text-gray-500 mt-1 text-base font-light">
                                    Define goals for the bot to achieve during conversations with leads
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleAddGoal}
                            className="flex items-center gap-2 px-8 py-3 bg-teal-600 text-white rounded-full hover:bg-black hover:shadow-lg transition-all font-medium text-sm tracking-wide active:scale-95"
                        >
                            <Plus size={18} />
                            Add Goal
                        </button>
                    </div>

                    {/* Goals List */}
                    <div className="space-y-4">
                        {loadingGoals ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                <Loader2 className="animate-spin mb-3" size={24} />
                                <span className="font-light text-sm">Loading goals...</span>
                            </div>
                        ) : botGoals.length === 0 ? (
                            <div className="text-center py-16 px-4 bg-gray-50/50 rounded-[32px] border border-dashed border-gray-200">
                                <div className="bg-white p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-sm border border-gray-100">
                                    <Target size={24} className="text-gray-300" />
                                </div>
                                <h3 className="text-gray-900 font-medium mb-1">No goals defined</h3>
                                <p className="text-gray-500 text-sm max-w-sm mx-auto font-light">
                                    Add goals to guide the bot's conversation strategy with leads.
                                </p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {botGoals.map((goal, index) => (
                                    <div
                                        key={goal.id}
                                        className={`group flex items-start gap-4 p-6 bg-white border rounded-[24px] transition-all duration-300 ${goal.is_active
                                                ? 'border-gray-100 hover:shadow-lg hover:border-gray-200'
                                                : 'border-gray-50 opacity-60'
                                            }`}
                                    >
                                        {/* Drag Handle */}
                                        <div className="flex flex-col gap-2 pt-1">
                                            <button
                                                onClick={() => moveGoal(index, 'up')}
                                                disabled={index === 0}
                                                className="text-gray-300 hover:text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                <GripVertical size={20} />
                                            </button>
                                        </div>

                                        {/* Goal Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="font-semibold text-gray-900 text-xl tracking-tight">
                                                    {goal.goal_name}
                                                </h3>
                                                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-md font-medium">
                                                    {goal.priority_order !== null && goal.priority_order !== undefined ? `Priority ${goal.priority_order + 1}` : 'No priority'}
                                                </span>
                                                {goal.is_optional && (
                                                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-md font-medium">
                                                        Optional
                                                    </span>
                                                )}
                                                {!goal.is_active && (
                                                    <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-md">
                                                        Inactive
                                                    </span>
                                                )}
                                            </div>
                                            {goal.goal_description && (
                                                <p className="text-gray-600 text-sm mt-1">{goal.goal_description}</p>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleToggleOptional(goal)}
                                                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all flex items-center gap-1 text-sm"
                                            >
                                                {goal.is_optional ? <ToggleRight size={18} className="text-blue-500" /> : <ToggleLeft size={18} />}
                                                <span className="hidden sm:inline">{goal.is_optional ? 'Optional' : 'Required'}</span>
                                            </button>
                                            <button
                                                onClick={() => handleEditGoal(goal)}
                                                className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-all"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteGoal(goal.id, goal.goal_name)}
                                                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Goal Modal */}
                {showGoalModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-6 shadow-xl">
                            <div className="flex items-center justify-between">
                                <h3 className="text-2xl font-semibold text-gray-900">
                                    {editingGoal ? 'Edit Goal' : 'Add Goal'}
                                </h3>
                                <button
                                    onClick={() => setShowGoalModal(false)}
                                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Goal Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={goalForm.goalName}
                                        onChange={(e) => setGoalForm({ ...goalForm, goalName: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        placeholder="e.g., Collect Email Address"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Description
                                    </label>
                                    <textarea
                                        value={goalForm.goalDescription}
                                        onChange={(e) => setGoalForm({ ...goalForm, goalDescription: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        placeholder="Describe what the bot should achieve with this goal"
                                        rows={3}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Priority Order <span className="text-gray-400 text-xs">(optional)</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={goalForm.priorityOrder ?? ''}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setGoalForm({
                                                ...goalForm,
                                                priorityOrder: value === '' ? null : parseInt(value, 10) || null
                                            });
                                        }}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        min="0"
                                        placeholder="Leave empty for no priority"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Lower numbers = higher priority. Goals are processed in priority order. Leave empty if no specific priority needed.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="isActive"
                                        checked={goalForm.isActive}
                                        onChange={(e) => setGoalForm({ ...goalForm, isActive: e.target.checked })}
                                        className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                                    />
                                    <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                                        Active (bot will pursue this goal)
                                    </label>
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="isOptional"
                                        checked={goalForm.isOptional}
                                        onChange={(e) => setGoalForm({ ...goalForm, isOptional: e.target.checked })}
                                        className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                                    />
                                    <label htmlFor="isOptional" className="text-sm font-medium text-gray-700">
                                        Optional (not mandatory - bot will try but won't fail if not achieved)
                                    </label>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setShowGoalModal(false)}
                                    className="px-6 py-2 text-gray-700 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveGoal}
                                    className="px-6 py-2 bg-teal-600 text-white rounded-full hover:bg-black transition-colors"
                                >
                                    {editingGoal ? 'Update' : 'Create'} Goal
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Page Selector Modal */}
                {showPageSelector && (
                    <PageSelector
                        pages={availablePages}
                        onConnect={handleConnectPages}
                        onClose={() => {
                            setShowPageSelector(false);
                            setAvailablePages([]);
                            window.history.replaceState({}, '', '/settings');
                        }}
                    />
                )}
            </div>
        </div>
    );
}

export default function SettingsPage() {
    return (
        <Suspense fallback={
            <div className="max-w-4xl mx-auto p-8 flex items-center justify-center">
                <Loader2 className="animate-spin mr-2" size={24} />
                <span>Loading settings...</span>
            </div>
        }>
            <SettingsContent />
        </Suspense>
    );
}
