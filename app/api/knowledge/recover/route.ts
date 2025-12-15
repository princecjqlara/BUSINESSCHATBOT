/**
 * Document Recovery API
 * Restore deleted documents from ml_knowledge_changes audit log
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// POST - Recover deleted documents from audit log
export async function POST(req: Request) {
    try {
        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'knowledge/recover/route.ts:POST:entry',message:'Document recovery request received',data:{timestamp:new Date().toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        }
        // #endregion

        // Get all deleted documents from audit log
        const { data: deletedChanges, error: fetchError } = await supabase
            .from('ml_knowledge_changes')
            .select('*')
            .eq('entity_type', 'document')
            .eq('change_type', 'delete')
            .not('old_value', 'is', null)
            .or('undone.is.null,undone.eq.false')
            .order('created_at', { ascending: false });

        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'knowledge/recover/route.ts:POST:fetched-changes',message:'Fetched deleted documents from audit log',data:{count:deletedChanges?.length || 0,error:fetchError?.message || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        }
        // #endregion

        if (fetchError) {
            return NextResponse.json(
                { error: 'Failed to fetch deleted documents', details: fetchError },
                { status: 500 }
            );
        }

        if (!deletedChanges || deletedChanges.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No recoverable documents found in audit log',
                restoredCount: 0,
            });
        }

        const restored: any[] = [];
        const errors: any[] = [];

        // Restore each document
        for (const change of deletedChanges) {
            try {
                const oldValue = change.old_value as any;
                if (!oldValue) continue;

                const content = oldValue.content || oldValue;
                const metadata = oldValue.metadata || {};
                const documentName = oldValue.name || metadata.name;

                // Extract category_id and folder_id
                let categoryId = oldValue.categoryId || metadata.category_id || null;
                let folderId = oldValue.folderId || metadata.folder_id || null;

                // Convert to UUID if they're strings
                if (categoryId && typeof categoryId === 'string') {
                    try {
                        categoryId = categoryId;
                    } catch {
                        categoryId = null;
                    }
                }
                if (folderId && typeof folderId === 'string') {
                    try {
                        folderId = folderId;
                    } catch {
                        folderId = null;
                    }
                }

                // Insert the document (documents table uses BIGSERIAL, so we can't set ID directly)
                const insertData: any = {
                    content: content,
                    metadata: {
                        ...metadata,
                        name: documentName || 'Recovered Document',
                    },
                };

                if (categoryId) insertData.category_id = categoryId;
                if (folderId) insertData.folder_id = folderId;
                
                // Note: documents table uses BIGSERIAL, so we create new IDs
                // The original entity_id is stored in metadata for reference
                if (change.entity_id) {
                    insertData.metadata = {
                        ...insertData.metadata,
                        original_id: change.entity_id,
                        recovered_from_audit: true,
                        recovery_change_id: change.id,
                    };
                }

                const { data: restoredDoc, error: insertError } = await supabase
                    .from('documents')
                    .insert(insertData)
                    .select()
                    .single();

                // #region agent log
                if (typeof fetch !== 'undefined') {
                    fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'knowledge/recover/route.ts:POST:restore-attempt',message:'Attempted to restore document',data:{entityId:change.entity_id,success:!insertError,error:insertError?.message || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                }
                // #endregion

                if (insertError) {
                    errors.push({
                        entity_id: change.entity_id,
                        reason: insertError.message,
                    });
                } else {
                    restored.push({
                        id: restoredDoc.id,
                        name: documentName,
                        change_id: change.id,
                    });

                    // Mark change as undone
                    await supabase
                        .from('ml_knowledge_changes')
                        .update({ undone: true })
                        .eq('id', change.id);
                }
            } catch (error: any) {
                errors.push({
                    entity_id: change.entity_id,
                    reason: error.message || 'Unknown error',
                });
            }
        }

        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'knowledge/recover/route.ts:POST:complete',message:'Document recovery completed',data:{restoredCount:restored.length,errorCount:errors.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        }
        // #endregion

        return NextResponse.json({
            success: true,
            message: `Recovery completed: ${restored.length} documents restored, ${errors.length} errors`,
            restoredCount: restored.length,
            restored,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error: any) {
        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'knowledge/recover/route.ts:POST:error',message:'Recovery error',data:{error:error.message || String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        }
        // #endregion
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}

// GET - Check for recoverable documents
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('ml_knowledge_changes')
            .select('id, entity_id, old_value, created_at, created_by')
            .eq('entity_type', 'document')
            .eq('change_type', 'delete')
            .not('old_value', 'is', null)
            .or('undone.is.null,undone.eq.false')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            return NextResponse.json(
                { error: 'Failed to fetch recoverable documents', details: error },
                { status: 500 }
            );
        }

        const recoverable = (data || []).map((change: any) => ({
            change_id: change.id,
            document_id: change.entity_id,
            name: change.old_value?.name || change.old_value?.metadata?.name || 'Unknown',
            content_preview: change.old_value?.content
                ? change.old_value.content.substring(0, 100)
                : null,
            deleted_at: change.created_at,
            deleted_by: change.created_by,
        }));

        return NextResponse.json({
            recoverableCount: recoverable.length,
            recoverable,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}

