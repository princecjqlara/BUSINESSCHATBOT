'use client';

import { useState, useEffect } from 'react';
import KnowledgeBaseAIAssistant from '@/app/components/KnowledgeBaseAIAssistant';
import { Sparkles } from 'lucide-react';

export default function MigrationGuide() {
    const [columnExists, setColumnExists] = useState<boolean | null>(null);
    const [checking, setChecking] = useState(true);
    const [showAIAssistant, setShowAIAssistant] = useState(false);

    useEffect(() => {
        checkColumn();
    }, []);

    const checkColumn = async () => {
        try {
            const res = await fetch('/api/settings/test-connection');
            const data = await res.json();
            setColumnExists(data.hasMaxSentencesColumn || false);
        } catch (error) {
            console.error('Error checking column:', error);
            setColumnExists(false);
        } finally {
            setChecking(false);
        }
    };

    const migrationSQL = `ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS max_sentences_per_message INT DEFAULT 3;

COMMENT ON COLUMN bot_settings.max_sentences_per_message IS 'Maximum number of sentences the AI can send per message. Default is 3. Set to 0 or NULL for no limit.';`;

    if (checking) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Checking database status...</p>
                </div>
            </div>
        );
    }

    if (columnExists) {
        return (
            <div>
                <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                    <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
                        <div className="text-center">
                            <div className="text-green-600 text-5xl mb-4">✓</div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">Migration Complete!</h1>
                            <p className="text-gray-600 mb-6">The max_sentences_per_message column exists in your database.</p>
                            <div className="flex gap-3 justify-center">
                                <a
                                    href="/rules"
                                    className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
                                >
                                    Go to Rules Editor
                                </a>
                                <button
                                    onClick={() => setShowAIAssistant(true)}
                                    className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-2 rounded-lg hover:from-purple-700 hover:to-blue-700 transition"
                                >
                                    <Sparkles size={18} />
                                    AI Knowledge Assistant
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                {showAIAssistant && (
                    <KnowledgeBaseAIAssistant onClose={() => setShowAIAssistant(false)} />
                )}
            </div>
        );
    }

    return (
        <div>
            <div className="min-h-screen bg-gray-50 py-12 px-4">
                <div className="max-w-3xl mx-auto">
                    <div className="bg-white rounded-lg shadow-lg p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div className="text-center flex-1">
                                <div className="text-yellow-600 text-5xl mb-4">⚠</div>
                                <h1 className="text-2xl font-bold text-gray-900 mb-2">Database Migration Required</h1>
                                <p className="text-gray-600">
                                    The <code className="bg-gray-100 px-2 py-1 rounded">max_sentences_per_message</code> column does not exist in your database.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowAIAssistant(true)}
                                className="ml-4 inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-purple-700 hover:to-blue-700 transition shadow-md"
                                title="Open AI Knowledge Base Assistant"
                            >
                                <Sparkles size={18} />
                                <span className="hidden sm:inline">AI Assistant</span>
                            </button>
                        </div>

                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                        <p className="text-yellow-800">
                            <strong>Action Required:</strong> Run the SQL migration below in your Supabase SQL Editor.
                        </p>
                    </div>

                    <div className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-3">Step 1: Copy the SQL</h2>
                        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                            <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">
                                {migrationSQL}
                            </pre>
                        </div>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(migrationSQL);
                                alert('SQL copied to clipboard!');
                            }}
                            className="mt-3 bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-700 transition"
                        >
                            Copy SQL to Clipboard
                        </button>
                    </div>

                    <div className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-3">Step 2: Run in Supabase SQL Editor</h2>
                        <ol className="list-decimal list-inside space-y-2 text-gray-700">
                            <li>Go to your <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Supabase Dashboard</a></li>
                            <li>Navigate to <strong>SQL Editor</strong> (or go directly to: <code className="bg-gray-100 px-1 rounded">https://supabase.com/dashboard/project/_/sql/new</code>)</li>
                            <li>Paste the SQL from Step 1</li>
                            <li>Click <strong>"Run"</strong> or press <kbd className="bg-gray-200 px-2 py-1 rounded">Ctrl+Enter</kbd></li>
                            <li>Wait for confirmation that the migration completed</li>
                        </ol>
                    </div>

                    <div className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-3">Step 3: Verify</h2>
                        <p className="text-gray-700 mb-4">After running the migration, click the button below to verify:</p>
                        <button
                            onClick={checkColumn}
                            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
                        >
                            Check Migration Status
                        </button>
                    </div>

                    <div className="border-t pt-6 mt-6">
                        <p className="text-sm text-gray-500">
                            <strong>Note:</strong> This migration adds a column to store the maximum number of sentences per message setting. 
                            The default value is 3, but you can change it in the Rules Editor after the migration is complete.
                        </p>
                    </div>
                </div>
            </div>
            </div>
            {showAIAssistant && (
                <KnowledgeBaseAIAssistant onClose={() => setShowAIAssistant(false)} />
            )}
        </div>
    );
}


