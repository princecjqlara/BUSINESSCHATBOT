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
    const errors: string[] = [];

    try {
        // Sync settings
        if (type === 'all' || type === 'settings') {
            const { data: prodSettings, error: settingsError } = await supabase
                .from('bot_settings')
                .select('*')
                .limit(1)
                .single();

            if (settingsError) {
                console.error('[ML Sandbox] Error fetching production settings:', settingsError);
                errors.push(`Settings fetch error: ${settingsError.message}`);
            } else if (prodSettings) {
                const { error: upsertError } = await supabase
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
                if (upsertError) {
                    console.error('[ML Sandbox] Error upserting sandbox settings:', upsertError);
                    errors.push(`Settings upsert error: ${upsertError.message}`);
                } else {
                    itemsSynced++;
                    console.log('[ML Sandbox] Settings synced successfully');
                }
            }
        }

        // Sync documents
        if (type === 'all' || type === 'documents') {
            // Clear existing sandbox documents - fetch all and delete by ID for reliability
            const { data: existingDocs } = await supabase
                .from('ml_sandbox_documents')
                .select('id');

            if (existingDocs && existingDocs.length > 0) {
                const docIds = existingDocs.map((d: any) => d.id);
                const { error: deleteDocsError } = await supabase
                    .from('ml_sandbox_documents')
                    .delete()
                    .in('id', docIds);

                if (deleteDocsError) {
                    console.error('[ML Sandbox] Error clearing sandbox documents:', deleteDocsError);
                    errors.push(`Document clear error: ${deleteDocsError.message}`);
                }
            }

            const { data: prodDocs, error: docsError } = await supabase.from('documents').select('*');

            if (docsError) {
                console.error('[ML Sandbox] Error fetching production documents:', docsError);
                errors.push(`Documents fetch error: ${docsError.message}`);
            } else if (prodDocs && prodDocs.length > 0) {
                // Note: production documents.id is BIGSERIAL, sandbox production_id is UUID
                // We store the production ID in metadata instead since types don't match
                const sandboxDocs = prodDocs.map((doc: any) => ({
                    content: doc.content,
                    metadata: { ...doc.metadata, production_id: doc.id },
                    category_id: doc.category_id,
                    media_urls: doc.media_urls,
                    // production_id is UUID but production doc.id is BIGSERIAL - skip this field
                    synced_from_production_at: now,
                }));
                const { error: insertDocsError } = await supabase.from('ml_sandbox_documents').insert(sandboxDocs);
                if (insertDocsError) {
                    console.error('[ML Sandbox] Error inserting sandbox documents:', insertDocsError);
                    errors.push(`Documents insert error: ${insertDocsError.message}`);
                } else {
                    itemsSynced += sandboxDocs.length;
                    console.log(`[ML Sandbox] ${sandboxDocs.length} documents synced successfully`);
                }
            } else {
                console.log('[ML Sandbox] No production documents found to sync');
            }
        }

        // Sync rules
        if (type === 'all' || type === 'rules') {
            // Clear existing sandbox rules - sandbox uses SERIAL, so gt(0) works
            const { error: deleteRulesError } = await supabase
                .from('ml_sandbox_bot_rules')
                .delete()
                .gt('id', 0);

            if (deleteRulesError) {
                console.error('[ML Sandbox] Error clearing sandbox rules:', deleteRulesError);
                errors.push(`Rules clear error: ${deleteRulesError.message}`);
            }

            const { data: prodRules, error: rulesError } = await supabase.from('bot_rules').select('*');

            if (rulesError) {
                console.error('[ML Sandbox] Error fetching production rules:', rulesError);
                errors.push(`Rules fetch error: ${rulesError.message}`);
            } else if (prodRules && prodRules.length > 0) {
                // Note: production bot_rules.id is UUID, sandbox production_id is INTEGER
                // Store the UUID string reference in a different way - skip production_id mapping
                const sandboxRules = prodRules.map((rule: any) => ({
                    rule: rule.rule,
                    category: rule.category,
                    priority: rule.priority,
                    enabled: rule.enabled,
                    // production_id is INTEGER but production rule.id is UUID - skip this field
                    synced_from_production_at: now,
                }));
                const { error: insertRulesError } = await supabase.from('ml_sandbox_bot_rules').insert(sandboxRules);
                if (insertRulesError) {
                    console.error('[ML Sandbox] Error inserting sandbox rules:', insertRulesError);
                    errors.push(`Rules insert error: ${insertRulesError.message}`);
                } else {
                    itemsSynced += sandboxRules.length;
                    console.log(`[ML Sandbox] ${sandboxRules.length} rules synced successfully`);
                }
            } else {
                console.log('[ML Sandbox] No production rules found to sync');
            }
        }

        // Sync goals
        if (type === 'all' || type === 'goals') {
            // Clear existing sandbox goals - fetch all and delete by ID
            const { data: existingGoals } = await supabase
                .from('ml_sandbox_bot_goals')
                .select('id');

            if (existingGoals && existingGoals.length > 0) {
                const goalIds = existingGoals.map((g: any) => g.id);
                const { error: deleteGoalsError } = await supabase
                    .from('ml_sandbox_bot_goals')
                    .delete()
                    .in('id', goalIds);

                if (deleteGoalsError) {
                    console.error('[ML Sandbox] Error clearing sandbox goals:', deleteGoalsError);
                    errors.push(`Goals clear error: ${deleteGoalsError.message}`);
                }
            }

            const { data: prodGoals, error: goalsError } = await supabase.from('bot_goals').select('*');

            if (goalsError) {
                console.error('[ML Sandbox] Error fetching production goals:', goalsError);
                errors.push(`Goals fetch error: ${goalsError.message}`);
            } else if (prodGoals && prodGoals.length > 0) {
                // Both production and sandbox use UUID for goals, so production_id mapping works
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
                const { error: insertGoalsError } = await supabase.from('ml_sandbox_bot_goals').insert(sandboxGoals);
                if (insertGoalsError) {
                    console.error('[ML Sandbox] Error inserting sandbox goals:', insertGoalsError);
                    errors.push(`Goals insert error: ${insertGoalsError.message}`);
                } else {
                    itemsSynced += sandboxGoals.length;
                    console.log(`[ML Sandbox] ${sandboxGoals.length} goals synced successfully`);
                }
            } else {
                console.log('[ML Sandbox] No production goals found to sync');
            }
        }

        // Sync categories
        if (type === 'all' || type === 'categories') {
            // Clear existing sandbox categories - fetch all and delete by ID
            const { data: existingCats } = await supabase
                .from('ml_sandbox_knowledge_categories')
                .select('id');

            if (existingCats && existingCats.length > 0) {
                const catIds = existingCats.map((c: any) => c.id);
                const { error: deleteCatsError } = await supabase
                    .from('ml_sandbox_knowledge_categories')
                    .delete()
                    .in('id', catIds);

                if (deleteCatsError) {
                    console.error('[ML Sandbox] Error clearing sandbox categories:', deleteCatsError);
                    errors.push(`Categories clear error: ${deleteCatsError.message}`);
                }
            }

            const { data: prodCategories, error: catsError } = await supabase.from('knowledge_categories').select('*');

            if (catsError) {
                console.error('[ML Sandbox] Error fetching production categories:', catsError);
                errors.push(`Categories fetch error: ${catsError.message}`);
            } else if (prodCategories && prodCategories.length > 0) {
                // Both production and sandbox use UUID for categories
                const sandboxCategories = prodCategories.map((cat: any) => ({
                    name: cat.name,
                    type: cat.type,
                    color: cat.color,
                    production_id: cat.id,
                    synced_from_production_at: now,
                }));
                const { error: insertCatsError } = await supabase.from('ml_sandbox_knowledge_categories').insert(sandboxCategories);
                if (insertCatsError) {
                    console.error('[ML Sandbox] Error inserting sandbox categories:', insertCatsError);
                    errors.push(`Categories insert error: ${insertCatsError.message}`);
                } else {
                    itemsSynced += sandboxCategories.length;
                    console.log(`[ML Sandbox] ${sandboxCategories.length} categories synced successfully`);
                }
            } else {
                console.log('[ML Sandbox] No production categories found to sync');
            }
        }

        // Log the sync
        await supabase.from('ml_sandbox_sync_log').insert({
            sync_type: type,
            items_synced: itemsSynced,
        });

        // Return response with errors if any
        if (errors.length > 0) {
            return NextResponse.json({
                success: false,
                message: `Synced ${itemsSynced} items but encountered ${errors.length} errors`,
                itemsSynced,
                syncedAt: now,
                errors,
            }, { status: 207 }); // 207 Multi-Status
        }

        return NextResponse.json({
            success: true,
            message: `Synced ${itemsSynced} items from production to sandbox`,
            itemsSynced,
            syncedAt: now,
        });
    } catch (error) {
        console.error('[ML Sandbox] Sync error:', error);
        return NextResponse.json({
            error: 'Sync failed',
            details: error instanceof Error ? error.message : 'Unknown error',
            partialSync: itemsSynced,
            errors
        }, { status: 500 });
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
