'use client';

import { useState, useEffect } from 'react';
import {
    RefreshCw, Trash2, Plus, Edit2, Save, X, FileText,
    BookOpen, Target, Settings, AlertTriangle, CheckCircle,
    Database, Beaker
} from 'lucide-react';
import Header from '../../components/Header';

interface SandboxSettings {
    id: number;
    bot_name: string;
    bot_tone: string;
    bot_instructions: string | null;
    synced_from_production_at: string | null;
}

interface SandboxDocument {
    id: string;
    content: string;
    metadata: Record<string, any>;
    category_id: string | null;
    edited_by_ai: boolean;
    created_at: string;
}

interface SandboxRule {
    id: number;
    rule: string;
    category: string;
    priority: number;
    enabled: boolean;
    edited_by_ai: boolean;
}

interface SandboxGoal {
    id: string;
    goal_name: string;
    goal_description: string | null;
    priority_order: number | null;
    is_active: boolean;
    is_optional: boolean;
}

interface SandboxStatus {
    lastSync: string | null;
    counts: {
        documents: number;
        rules: number;
        goals: number;
        categories: number;
    };
}

export default function MLSandboxPage() {
    const [activeTab, setActiveTab] = useState<'settings' | 'documents' | 'rules' | 'goals'>('settings');
    const [settings, setSettings] = useState<SandboxSettings | null>(null);
    const [documents, setDocuments] = useState<SandboxDocument[]>([]);
    const [rules, setRules] = useState<SandboxRule[]>([]);
    const [goals, setGoals] = useState<SandboxGoal[]>([]);
    const [status, setStatus] = useState<SandboxStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Editing states
    const [editingSettings, setEditingSettings] = useState(false);
    const [editSettings, setEditSettings] = useState({ botName: '', botTone: '', botInstructions: '' });
    const [editingDocument, setEditingDocument] = useState<string | null>(null);
    const [newDocumentContent, setNewDocumentContent] = useState('');
    const [editingRule, setEditingRule] = useState<number | null>(null);
    const [newRuleContent, setNewRuleContent] = useState('');
    const [editingGoal, setEditingGoal] = useState<string | null>(null);
    const [newGoalName, setNewGoalName] = useState('');
    const [newGoalDescription, setNewGoalDescription] = useState('');

    useEffect(() => {
        fetchAllData();
    }, []);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [dataRes, statusRes] = await Promise.all([
                fetch('/api/ml-sandbox?type=all'),
                fetch('/api/ml-sandbox?type=status'),
            ]);

            if (dataRes.ok) {
                const data = await dataRes.json();
                setSettings(data.settings);
                setDocuments(data.documents || []);
                setRules(data.rules || []);
                setGoals(data.goals || []);
            }

            if (statusRes.ok) {
                const statusData = await statusRes.json();
                setStatus(statusData.status);
            }
        } catch (error) {
            console.error('Error fetching sandbox data:', error);
            showMessage('error', 'Failed to load sandbox data');
        }
        setLoading(false);
    };

    const showMessage = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 3000);
    };

    const handleSyncFromProduction = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/ml-sandbox', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync', type: 'all' }),
            });

            if (res.ok) {
                const data = await res.json();
                showMessage('success', data.message);
                await fetchAllData();
            } else {
                const errorData = await res.json().catch(() => ({}));
                showMessage('error', errorData.error || errorData.message || 'Failed to sync from production');
                console.error('Sync error details:', errorData);
            }
        } catch (error) {
            showMessage('error', 'Sync failed');
        }
        setSyncing(false);
    };

    const handleClearSandbox = async () => {
        if (!confirm('Are you sure you want to clear all sandbox data? This cannot be undone.')) {
            return;
        }

        try {
            const res = await fetch('/api/ml-sandbox', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clear', type: 'all' }),
            });

            if (res.ok) {
                showMessage('success', 'Sandbox cleared');
                await fetchAllData();
            } else {
                showMessage('error', 'Failed to clear sandbox');
            }
        } catch (error) {
            showMessage('error', 'Clear failed');
        }
    };

    const handleSaveSettings = async () => {
        try {
            const res = await fetch('/api/ml-sandbox', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    botName: editSettings.botName,
                    botTone: editSettings.botTone,
                    botInstructions: editSettings.botInstructions,
                }),
            });

            if (res.ok) {
                showMessage('success', 'Settings saved');
                setEditingSettings(false);
                await fetchAllData();
            } else {
                showMessage('error', 'Failed to save settings');
            }
        } catch (error) {
            showMessage('error', 'Save failed');
        }
    };

    const handleAddDocument = async () => {
        if (!newDocumentContent.trim()) return;

        try {
            const res = await fetch('/api/ml-sandbox/documents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newDocumentContent }),
            });

            if (res.ok) {
                showMessage('success', 'Document added');
                setNewDocumentContent('');
                await fetchAllData();
            } else {
                showMessage('error', 'Failed to add document');
            }
        } catch (error) {
            showMessage('error', 'Add failed');
        }
    };

    const handleDeleteDocument = async (id: string) => {
        if (!confirm('Delete this document?')) return;

        try {
            const res = await fetch(`/api/ml-sandbox/documents?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showMessage('success', 'Document deleted');
                await fetchAllData();
            }
        } catch (error) {
            showMessage('error', 'Delete failed');
        }
    };

    const handleAddRule = async () => {
        if (!newRuleContent.trim()) return;

        try {
            const res = await fetch('/api/ml-sandbox/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rule: newRuleContent }),
            });

            if (res.ok) {
                showMessage('success', 'Rule added');
                setNewRuleContent('');
                await fetchAllData();
            } else {
                showMessage('error', 'Failed to add rule');
            }
        } catch (error) {
            showMessage('error', 'Add failed');
        }
    };

    const handleDeleteRule = async (id: number) => {
        if (!confirm('Delete this rule?')) return;

        try {
            const res = await fetch(`/api/ml-sandbox/rules?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showMessage('success', 'Rule deleted');
                await fetchAllData();
            }
        } catch (error) {
            showMessage('error', 'Delete failed');
        }
    };

    const handleAddGoal = async () => {
        if (!newGoalName.trim()) return;

        try {
            const res = await fetch('/api/ml-sandbox/goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goalName: newGoalName, goalDescription: newGoalDescription }),
            });

            if (res.ok) {
                showMessage('success', 'Goal added');
                setNewGoalName('');
                setNewGoalDescription('');
                await fetchAllData();
            } else {
                showMessage('error', 'Failed to add goal');
            }
        } catch (error) {
            showMessage('error', 'Add failed');
        }
    };

    const handleDeleteGoal = async (id: string) => {
        if (!confirm('Delete this goal?')) return;

        try {
            const res = await fetch(`/api/ml-sandbox/goals?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showMessage('success', 'Goal deleted');
                await fetchAllData();
            }
        } catch (error) {
            showMessage('error', 'Delete failed');
        }
    };

    const cardStyle = {
        background: '#ffffff',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    };

    const buttonStyle = {
        padding: '8px 16px',
        borderRadius: '8px',
        border: 'none',
        cursor: 'pointer',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    };

    const inputStyle = {
        width: '100%',
        padding: '12px',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        color: '#1f2937',
        fontSize: '14px',
    };

    return (
        <div className="flex flex-col h-full">
            <Header />
            <div className="flex-1 overflow-auto bg-white">
                <main style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
                    {/* Page Title */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                <Beaker size={32} color="#0d9488" />
                                <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1f2937', margin: 0 }}>
                                    ML Sandbox
                                </h1>
                                <span style={{
                                    background: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)',
                                    color: '#fff',
                                    padding: '4px 12px',
                                    borderRadius: '20px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                }}>
                                    EXPERIMENTAL
                                </span>
                            </div>
                            <p style={{ color: '#6b7280', marginTop: '4px' }}>
                                Safe environment for AI learning experimentation. Not connected to Facebook.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={handleSyncFromProduction}
                                disabled={syncing}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${syncing ? 'bg-gray-200 text-gray-500' : 'bg-teal-600 text-white hover:bg-teal-700'}`}
                            >
                                <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                                {syncing ? 'Syncing...' : 'Sync from Production'}
                            </button>
                            <button
                                onClick={handleClearSandbox}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                            >
                                <Trash2 size={16} />
                                Clear Sandbox
                            </button>
                        </div>
                    </div>

                    {/* Message Toast */}
                    {message && (
                        <div style={{
                            position: 'fixed',
                            top: '20px',
                            right: '20px',
                            padding: '12px 20px',
                            borderRadius: '8px',
                            background: message.type === 'success' ? '#22c55e' : '#dc2626',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            zIndex: 1000,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        }}>
                            {message.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                            {message.text}
                        </div>
                    )}

                    {/* Status Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '16px',
                        marginBottom: '24px'
                    }}>
                        <div style={cardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <FileText size={16} color="#0d9488" />
                                <span style={{ color: '#6b7280', fontSize: '14px' }}>Documents</span>
                            </div>
                            <p style={{ color: '#1f2937', fontSize: '24px', fontWeight: 600, margin: 0 }}>
                                {status?.counts?.documents || 0}
                            </p>
                        </div>
                        <div style={cardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <BookOpen size={16} color="#0d9488" />
                                <span style={{ color: '#6b7280', fontSize: '14px' }}>Rules</span>
                            </div>
                            <p style={{ color: '#1f2937', fontSize: '24px', fontWeight: 600, margin: 0 }}>
                                {status?.counts?.rules || 0}
                            </p>
                        </div>
                        <div style={cardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <Target size={16} color="#0d9488" />
                                <span style={{ color: '#6b7280', fontSize: '14px' }}>Goals</span>
                            </div>
                            <p style={{ color: '#1f2937', fontSize: '24px', fontWeight: 600, margin: 0 }}>
                                {status?.counts?.goals || 0}
                            </p>
                        </div>
                        <div style={cardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <Database size={16} color="#0d9488" />
                                <span style={{ color: '#6b7280', fontSize: '14px' }}>Last Sync</span>
                            </div>
                            <p style={{ color: '#1f2937', fontSize: '14px', margin: 0 }}>
                                {status?.lastSync
                                    ? new Date(status.lastSync).toLocaleDateString('en-PH', {
                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                    })
                                    : 'Never'
                                }
                            </p>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="h-12 bg-white border-b border-gray-200 flex items-center gap-1 mb-6">
                        {(['settings', 'documents', 'rules', 'goals'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${activeTab === tab
                                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                            Loading sandbox data...
                        </div>
                    ) : (
                        <>
                            {/* Settings Tab */}
                            {activeTab === 'settings' && (
                                <div style={cardStyle}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                        <h3 style={{ color: '#1f2937', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Settings size={20} color="#0d9488" />
                                            Bot Settings (Sandbox)
                                        </h3>
                                        {!editingSettings ? (
                                            <button
                                                onClick={() => {
                                                    setEditSettings({
                                                        botName: settings?.bot_name || '',
                                                        botTone: settings?.bot_tone || '',
                                                        botInstructions: settings?.bot_instructions || '',
                                                    });
                                                    setEditingSettings(true);
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors"
                                            >
                                                <Edit2 size={14} /> Edit
                                            </button>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button onClick={handleSaveSettings} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                                                    <Save size={14} /> Save
                                                </button>
                                                <button onClick={() => setEditingSettings(false)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors">
                                                    <X size={14} /> Cancel
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {editingSettings ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <div>
                                                <label style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px', display: 'block' }}>Bot Name</label>
                                                <input
                                                    type="text"
                                                    value={editSettings.botName}
                                                    onChange={(e) => setEditSettings({ ...editSettings, botName: e.target.value })}
                                                    style={inputStyle}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px', display: 'block' }}>Bot Tone</label>
                                                <input
                                                    type="text"
                                                    value={editSettings.botTone}
                                                    onChange={(e) => setEditSettings({ ...editSettings, botTone: e.target.value })}
                                                    style={inputStyle}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px', display: 'block' }}>Bot Instructions</label>
                                                <textarea
                                                    value={editSettings.botInstructions}
                                                    onChange={(e) => setEditSettings({ ...editSettings, botInstructions: e.target.value })}
                                                    style={{ ...inputStyle, minHeight: '150px', resize: 'vertical' }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <div>
                                                <span style={{ color: '#6b7280', fontSize: '14px' }}>Bot Name:</span>
                                                <p style={{ color: '#1f2937', margin: '4px 0 0 0' }}>{settings?.bot_name || 'Not set'}</p>
                                            </div>
                                            <div>
                                                <span style={{ color: '#6b7280', fontSize: '14px' }}>Bot Tone:</span>
                                                <p style={{ color: '#1f2937', margin: '4px 0 0 0' }}>{settings?.bot_tone || 'Not set'}</p>
                                            </div>
                                            <div>
                                                <span style={{ color: '#6b7280', fontSize: '14px' }}>Bot Instructions:</span>
                                                <p style={{ color: '#1f2937', margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>
                                                    {settings?.bot_instructions || 'No instructions set'}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Documents Tab */}
                            {activeTab === 'documents' && (
                                <div style={cardStyle}>
                                    <h3 style={{ color: '#1f2937', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <FileText size={20} color="#0d9488" />
                                        Knowledge Documents (Sandbox)
                                    </h3>

                                    {/* Add Document */}
                                    <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
                                        <textarea
                                            placeholder="Add new document content..."
                                            value={newDocumentContent}
                                            onChange={(e) => setNewDocumentContent(e.target.value)}
                                            style={{ ...inputStyle, flex: 1, minHeight: '80px' }}
                                        />
                                        <button onClick={handleAddDocument} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors h-fit">
                                            <Plus size={16} /> Add
                                        </button>
                                    </div>

                                    {/* Documents List */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {documents.length === 0 ? (
                                            <p style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
                                                No documents in sandbox. Sync from production or add new ones.
                                            </p>
                                        ) : (
                                            documents.map((doc) => (
                                                <div
                                                    key={doc.id}
                                                    style={{
                                                        background: '#f9fafb',
                                                        borderRadius: '8px',
                                                        padding: '16px',
                                                        border: doc.edited_by_ai ? '1px solid #0d9488' : '1px solid #e5e7eb',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <p style={{ color: '#1f2937', margin: 0, flex: 1, whiteSpace: 'pre-wrap', fontSize: '14px' }}>
                                                            {doc.content.substring(0, 300)}{doc.content.length > 300 ? '...' : ''}
                                                        </p>
                                                        <button
                                                            onClick={() => handleDeleteDocument(doc.id)}
                                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626', marginLeft: '12px' }}
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                    {doc.edited_by_ai && (
                                                        <span style={{ fontSize: '11px', color: '#0d9488', marginTop: '8px', display: 'block' }}>
                                                            ✨ Edited by AI
                                                        </span>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Rules Tab */}
                            {activeTab === 'rules' && (
                                <div style={cardStyle}>
                                    <h3 style={{ color: '#1f2937', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <BookOpen size={20} color="#0d9488" />
                                        Bot Rules (Sandbox)
                                    </h3>

                                    {/* Add Rule */}
                                    <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
                                        <input
                                            type="text"
                                            placeholder="Add new rule..."
                                            value={newRuleContent}
                                            onChange={(e) => setNewRuleContent(e.target.value)}
                                            style={{ ...inputStyle, flex: 1 }}
                                        />
                                        <button onClick={handleAddRule} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                                            <Plus size={16} /> Add
                                        </button>
                                    </div>

                                    {/* Rules List */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {rules.length === 0 ? (
                                            <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>
                                                No rules in sandbox. Sync from production or add new ones.
                                            </p>
                                        ) : (
                                            rules.map((rule) => (
                                                <div
                                                    key={rule.id}
                                                    style={{
                                                        background: '#f9fafb',
                                                        borderRadius: '8px',
                                                        padding: '12px 16px',
                                                        border: rule.edited_by_ai ? '1px solid #0d9488' : '1px solid #e5e7eb',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                    }}
                                                >
                                                    <div style={{ flex: 1 }}>
                                                        <p style={{ color: '#1f2937', margin: 0, fontSize: '14px' }}>{rule.rule}</p>
                                                        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                                                            <span style={{ fontSize: '12px', color: '#6b7280' }}>
                                                                Category: {rule.category}
                                                            </span>
                                                            <span style={{ fontSize: '12px', color: '#6b7280' }}>
                                                                Priority: {rule.priority}
                                                            </span>
                                                            {rule.edited_by_ai && (
                                                                <span style={{ fontSize: '12px', color: '#0d9488' }}>✨ AI Edited</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteRule(rule.id)}
                                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626' }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Goals Tab */}
                            {activeTab === 'goals' && (
                                <div style={cardStyle}>
                                    <h3 style={{ color: '#fff', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Target size={20} />
                                        Bot Goals (Sandbox)
                                    </h3>

                                    {/* Add Goal */}
                                    <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                        <input
                                            type="text"
                                            placeholder="Goal name..."
                                            value={newGoalName}
                                            onChange={(e) => setNewGoalName(e.target.value)}
                                            style={{ ...inputStyle, flex: 1, minWidth: '200px' }}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Description (optional)..."
                                            value={newGoalDescription}
                                            onChange={(e) => setNewGoalDescription(e.target.value)}
                                            style={{ ...inputStyle, flex: 2, minWidth: '200px' }}
                                        />
                                        <button onClick={handleAddGoal} style={{ ...buttonStyle, background: '#22c55e', color: '#fff' }}>
                                            <Plus size={16} /> Add
                                        </button>
                                    </div>

                                    {/* Goals List */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {goals.length === 0 ? (
                                            <p style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
                                                No goals in sandbox. Sync from production or add new ones.
                                            </p>
                                        ) : (
                                            goals.map((goal) => (
                                                <div
                                                    key={goal.id}
                                                    style={{
                                                        background: '#0f172a',
                                                        borderRadius: '8px',
                                                        padding: '12px 16px',
                                                        border: goal.is_active ? '1px solid #22c55e' : '1px solid #334155',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                    }}
                                                >
                                                    <div style={{ flex: 1 }}>
                                                        <p style={{ color: '#fff', margin: 0, fontSize: '14px', fontWeight: 500 }}>
                                                            {goal.goal_name}
                                                        </p>
                                                        {goal.goal_description && (
                                                            <p style={{ color: '#94a3b8', margin: '4px 0 0 0', fontSize: '13px' }}>
                                                                {goal.goal_description}
                                                            </p>
                                                        )}
                                                        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                                                            <span style={{ fontSize: '12px', color: goal.is_active ? '#22c55e' : '#64748b' }}>
                                                                {goal.is_active ? '● Active' : '○ Inactive'}
                                                            </span>
                                                            {goal.is_optional && (
                                                                <span style={{ fontSize: '12px', color: '#eab308' }}>Optional</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteGoal(goal.id)}
                                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626' }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Info Banner */}
                    <div style={{
                        background: 'linear-gradient(135deg, #1e3a5f 0%, #1e293b 100%)',
                        borderRadius: '12px',
                        padding: '20px',
                        border: '1px solid #334155',
                        marginTop: '24px',
                    }}>
                        <h4 style={{ color: '#fff', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertTriangle size={18} color="#eab308" />
                            About ML Sandbox
                        </h4>
                        <ul style={{ color: '#94a3b8', margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
                            <li>This is an <strong>isolated environment</strong> for AI learning experimentation</li>
                            <li>Changes here do <strong>NOT affect your live Facebook bot</strong></li>
                            <li>AI will edit sandbox data instead of production when experimenting</li>
                            <li>Use "Sync from Production" to pull your latest live settings</li>
                            <li>Review AI changes here before applying them to production</li>
                        </ul>
                    </div>
                </main>
            </div>
        </div>
    );
}
