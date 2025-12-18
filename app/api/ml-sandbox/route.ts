/**
 * ML Sandbox API
 * Main endpoint for managing sandbox data
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - Fetch all sandbox data
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type') || 'all';

        switch (type) {
            case 'settings':
                return await getSandboxSettings();
            case 'documents':
                return await getSandboxDocuments();
            case 'rules':
                return await getSandboxRules();
            case 'goals':
                return await getSandboxGoals();
            case 'categories':
                return await getSandboxCategories();
            case 'status':
                return await getSandboxStatus();
            case 'all':
            default:
                return await getAllSandboxData();
        }
    } catch (error) {
        console.error('[ML Sandbox] GET Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Sync from production to sandbox
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action, type } = body;

        if (action === 'sync') {
            return await syncFromProduction(type || 'all');
        } else if (action === 'clear') {
            return await clearSandbox(type || 'all');
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('[ML Sandbox] POST Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PUT - Update sandbox settings
export async function PUT(req: Request) {
    try {
        const body = await req.json();

        const { error } = await supabase
            .from('ml_sandbox_bot_settings')
            .update({
                bot_name: body.botName,
                bot_tone: body.botTone,
                bot_instructions: body.botInstructions,
                conversation_flow: body.conversationFlow,
                max_sentences: body.maxSentences,
                enable_ml_chatbot: body.enableMlChatbot,
                enable_ai_knowledge_management: body.enableAiKnowledgeManagement,
                updated_at: new Date().toISOString(),
            })
            .eq('id', 1);

        if (error) {
            console.error('[ML Sandbox] Update settings error:', error);
            return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Sandbox settings updated' });
    } catch (error) {
        console.error('[ML Sandbox] PUT Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getSandboxSettings() {
    const { data, error } = await supabase
        .from('ml_sandbox_bot_settings')
        .select('*')
        .limit(1)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('[ML Sandbox] Get settings error:', error);
    }

    return NextResponse.json({ settings: data || null });
}

async function getSandboxDocuments() {
    const { data, error } = await supabase
        .from('ml_sandbox_documents')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[ML Sandbox] Get documents error:', error);
    }

    return NextResponse.json({ documents: data || [] });
}

async function getSandboxRules() {
    const { data, error } = await supabase
        .from('ml_sandbox_bot_rules')
        .select('*')
        .order('priority', { ascending: true });

    if (error) {
        console.error('[ML Sandbox] Get rules error:', error);
    }

    return NextResponse.json({ rules: data || [] });
}

async function getSandboxGoals() {
    const { data, error } = await supabase
        .from('ml_sandbox_bot_goals')
        .select('*')
        .order('priority_order', { ascending: true });

    if (error) {
        console.error('[ML Sandbox] Get goals error:', error);
    }

    return NextResponse.json({ goals: data || [] });
}

async function getSandboxCategories() {
    const { data, error } = await supabase
        .from('ml_sandbox_knowledge_categories')
        .select('*')
        .order('name', { ascending: true });

    if (error) {
        console.error('[ML Sandbox] Get categories error:', error);
    }

    return NextResponse.json({ categories: data || [] });
}

async function getSandboxStatus() {
    // Get last sync info
    const { data: syncLog } = await supabase
        .from('ml_sandbox_sync_log')
        .select('*')
        .order('synced_at', { ascending: false })
        .limit(1)
        .single();

    // Get counts
    const [documentsCount, rulesCount, goalsCount, categoriesCount] = await Promise.all([
        supabase.from('ml_sandbox_documents').select('*', { count: 'exact', head: true }),
        supabase.from('ml_sandbox_bot_rules').select('*', { count: 'exact', head: true }),
        supabase.from('ml_sandbox_bot_goals').select('*', { count: 'exact', head: true }),
        supabase.from('ml_sandbox_knowledge_categories').select('*', { count: 'exact', head: true }),
    ]);

    return NextResponse.json({
        status: {
            lastSync: syncLog?.synced_at || null,
            lastSyncType: syncLog?.sync_type || null,
            counts: {
                documents: documentsCount.count || 0,
                rules: rulesCount.count || 0,
                goals: goalsCount.count || 0,
                categories: categoriesCount.count || 0,
            },
        },
    });
}

async function getAllSandboxData() {
    const [settings, documents, rules, goals, categories, status] = await Promise.all([
        supabase.from('ml_sandbox_bot_settings').select('*').limit(1).single(),
        supabase.from('ml_sandbox_documents').select('*').order('created_at', { ascending: false }),
        supabase.from('ml_sandbox_bot_rules').select('*').order('priority', { ascending: true }),
        supabase.from('ml_sandbox_bot_goals').select('*').order('priority_order', { ascending: true }),
        supabase.from('ml_sandbox_knowledge_categories').select('*').order('name', { ascending: true }),
        supabase.from('ml_sandbox_sync_log').select('*').order('synced_at', { ascending: false }).limit(1).single(),
    ]);

    return NextResponse.json({
        settings: settings.data || null,
        documents: documents.data || [],
        rules: rules.data || [],
        goals: goals.data || [],
        categories: categories.data || [],
        lastSync: status.data?.synced_at || null,
    });
}

async function syncFromProduction(type: string) {
    const now = new Date().toISOString();
    let itemsSynced = 0;

    try {
        // Sync settings
        if (type === 'all' || type === 'settings') {
            const { data: prodSettings } = await supabase
                .from('bot_settings')
                .select('*')
                .limit(1)
                .single();

            if (prodSettings) {
                await supabase
                    .from('ml_sandbox_bot_settings')
                    .upsert({
                        id: 1,
                        bot_name: prodSettings.bot_name,
                        bot_tone: prodSettings.bot_tone,
                        bot_instructions: prodSettings.bot_instructions,
                        conversation_flow: prodSettings.conversation_flow,
                        max_sentences: prodSettings.max_sentences,
                        enable_ml_chatbot: prodSettings.enable_ml_chatbot,
                        enable_ai_knowledge_management: prodSettings.enable_ai_knowledge_management,
                        enable_multi_model_chatbot: prodSettings.enable_multi_model_chatbot,
                        enable_ai_autonomous_followup: prodSettings.enable_ai_autonomous_followup,
                        default_ai_model: prodSettings.default_ai_model,
                        synced_from_production_at: now,
                        updated_at: now,
                    });
                itemsSynced++;
            }
        }

        // Sync documents
        if (type === 'all' || type === 'documents') {
            // Clear existing sandbox documents
            await supabase.from('ml_sandbox_documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');

            const { data: prodDocs } = await supabase.from('documents').select('*');
            if (prodDocs && prodDocs.length > 0) {
                const sandboxDocs = prodDocs.map((doc: any) => ({
                    content: doc.content,
                    metadata: doc.metadata,
                    category_id: doc.category_id,
                    media_urls: doc.media_urls,
                    production_id: doc.id,
                    synced_from_production_at: now,
                }));
                await supabase.from('ml_sandbox_documents').insert(sandboxDocs);
                itemsSynced += sandboxDocs.length;
            }
        }

        // Sync rules
        if (type === 'all' || type === 'rules') {
            // Clear existing sandbox rules
            await supabase.from('ml_sandbox_bot_rules').delete().neq('id', 0);

            const { data: prodRules } = await supabase.from('bot_rules').select('*');
            if (prodRules && prodRules.length > 0) {
                const sandboxRules = prodRules.map((rule: any) => ({
                    rule: rule.rule,
                    category: rule.category,
                    priority: rule.priority,
                    enabled: rule.enabled,
                    production_id: rule.id,
                    synced_from_production_at: now,
                }));
                await supabase.from('ml_sandbox_bot_rules').insert(sandboxRules);
                itemsSynced += sandboxRules.length;
            }
        }

        // Sync goals
        if (type === 'all' || type === 'goals') {
            // Clear existing sandbox goals
            await supabase.from('ml_sandbox_bot_goals').delete().neq('id', '00000000-0000-0000-0000-000000000000');

            const { data: prodGoals } = await supabase.from('bot_goals').select('*');
            if (prodGoals && prodGoals.length > 0) {
                const sandboxGoals = prodGoals.map((goal: any) => ({
                    goal_name: goal.goal_name,
                    goal_description: goal.goal_description,
                    priority_order: goal.priority_order,
                    is_active: goal.is_active,
                    is_optional: goal.is_optional,
                    stop_on_completion: goal.stop_on_completion,
                    production_id: goal.id,
                    synced_from_production_at: now,
                }));
                await supabase.from('ml_sandbox_bot_goals').insert(sandboxGoals);
                itemsSynced += sandboxGoals.length;
            }
        }

        // Sync categories
        if (type === 'all' || type === 'categories') {
            // Clear existing sandbox categories
            await supabase.from('ml_sandbox_knowledge_categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');

            const { data: prodCategories } = await supabase.from('knowledge_categories').select('*');
            if (prodCategories && prodCategories.length > 0) {
                const sandboxCategories = prodCategories.map((cat: any) => ({
                    name: cat.name,
                    type: cat.type,
                    color: cat.color,
                    production_id: cat.id,
                    synced_from_production_at: now,
                }));
                await supabase.from('ml_sandbox_knowledge_categories').insert(sandboxCategories);
                itemsSynced += sandboxCategories.length;
            }
        }

        // Log the sync
        await supabase.from('ml_sandbox_sync_log').insert({
            sync_type: type,
            items_synced: itemsSynced,
        });

        return NextResponse.json({
            success: true,
            message: `Synced ${itemsSynced} items from production to sandbox`,
            itemsSynced,
            syncedAt: now,
        });
    } catch (error) {
        console.error('[ML Sandbox] Sync error:', error);
        return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
    }
}

async function clearSandbox(type: string) {
    try {
        if (type === 'all' || type === 'documents') {
            await supabase.from('ml_sandbox_documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }
        if (type === 'all' || type === 'rules') {
            await supabase.from('ml_sandbox_bot_rules').delete().neq('id', 0);
        }
        if (type === 'all' || type === 'goals') {
            await supabase.from('ml_sandbox_bot_goals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }
        if (type === 'all' || type === 'categories') {
            await supabase.from('ml_sandbox_knowledge_categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }
        if (type === 'all' || type === 'settings') {
            await supabase
                .from('ml_sandbox_bot_settings')
                .update({
                    bot_name: 'Sales Assistant',
                    bot_tone: 'friendly and professional',
                    bot_instructions: null,
                    conversation_flow: null,
                    synced_from_production_at: null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', 1);
        }

        return NextResponse.json({ success: true, message: `Cleared sandbox ${type}` });
    } catch (error) {
        console.error('[ML Sandbox] Clear error:', error);
        return NextResponse.json({ error: 'Clear failed' }, { status: 500 });
    }
}
