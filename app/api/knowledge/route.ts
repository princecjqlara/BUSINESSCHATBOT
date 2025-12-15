import { NextResponse } from 'next/server';
import { addDocument } from '@/app/lib/rag';
import { supabase } from '@/app/lib/supabase';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('documents')
            .select('id, content, metadata, folder_id, category_id, edited_by_ai, last_ai_edit_at, media_urls')
            .order('id', { ascending: false })
            .limit(50);

        if (error) {
            console.error('[API /knowledge] Supabase error:', error);
            return NextResponse.json({ error: error.message, details: error }, { status: 500 });
        }

    // Check which documents were edited by ML AI (from ml_knowledge_changes)
    const documentIds = data?.map((item: any) => item.id) || [];
    let mlEditedIds: Set<string> = new Set();
    
    if (documentIds.length > 0 && data?.some((item: any) => item.edited_by_ai)) {
        const { data: mlChanges } = await supabase
            .from('ml_knowledge_changes')
            .select('entity_id')
            .eq('entity_type', 'document')
            .in('entity_id', documentIds.map(String))
            .eq('undone', false);
        
        if (mlChanges) {
            mlEditedIds = new Set(mlChanges.map((change: any) => String(change.entity_id)));
        }
    }

        // Handle null/undefined data from Supabase
        if (!data || !Array.isArray(data)) {
            console.log('[API /knowledge] Data is null or not array, returning empty array');
            return NextResponse.json([]);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedData = data.map((item: any) => ({
            id: item.id,
            text: item.content,
            name: item.metadata?.name || undefined,
            createdAt: new Date().toISOString(),
            folderId: item.folder_id || undefined,
            categoryId: item.category_id || undefined,
            documentId: item.metadata?.documentId || undefined,
            editedByAi: item.edited_by_ai || false,
            editedByMlAi: mlEditedIds.has(String(item.id)), // True if edited by ML AI
            lastAiEditAt: item.last_ai_edit_at || null,
            mediaUrls: Array.isArray(item.media_urls) ? item.media_urls : [],
        }));

        return NextResponse.json(mappedData);
    } catch (error) {
        console.error('[API /knowledge] Unexpected error:', error);
        const errorDetails = error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
        } : String(error);
        return NextResponse.json({ 
            error: 'Internal server error', 
            details: errorDetails
        }, { status: 500 });
    }
}

// POST - Create a new document
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { text, name, categoryId, mediaUrls } = body;

        if (!text) {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }

        // Include name in metadata if provided
        const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const metadata: { categoryId?: string; name?: string; documentId?: string } = {};
        if (categoryId) metadata.categoryId = categoryId;
        if (name) metadata.name = name;
        metadata.documentId = documentId; // Set documentId so we can find all chunks later

        try {
            await addDocument(text, metadata);
        } catch (error) {
            // Return the specific error message from addDocument/getEmbedding
            const errorMessage = error instanceof Error ? error.message : 'Failed to process document';
            return NextResponse.json({ 
                error: errorMessage
            }, { status: 500 });
        }

        // After creating document chunks, update media_urls for all chunks
        // Note: media_urls column may not exist in all databases, so wrap in try-catch
        if (mediaUrls && Array.isArray(mediaUrls) && mediaUrls.length > 0) {
            try {
                // Find all chunks with this documentId and update their media_urls
                const { data: allChunks } = await supabase
                    .from('documents')
                    .select('id, metadata')
                    .eq('metadata->>documentId', documentId);

                if (allChunks && allChunks.length > 0) {
                    const chunkIds = allChunks.map((c: any) => c.id);
                    const { error: updateError } = await supabase
                        .from('documents')
                        .update({ media_urls: mediaUrls })
                        .in('id', chunkIds);
                    
                    if (updateError) {
                        // Column might not exist - log but don't fail the request
                        console.warn('[API /knowledge] Failed to update media_urls (column may not exist):', updateError.message);
                    }
                }
            } catch (error) {
                // Column might not exist - log but don't fail the request
                console.warn('[API /knowledge] Error updating media_urls (column may not exist):', error instanceof Error ? error.message : String(error));
            }
        }

        return NextResponse.json({ success: true }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PUT - Update existing document content
export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, text, name, categoryId, mediaUrls, documentId: clientDocumentId } = body;

        if (!id) {
            return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
        }

        if (!text) {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }

        const numericId = Number(id);
        if (Number.isNaN(numericId)) {
            return NextResponse.json({ error: 'Document ID is invalid' }, { status: 400 });
        }

        // First, get the document to find its name, folder_id, category_id, and document_id (to identify all chunks)
        let { data: docChunk, error: fetchError } = await supabase
            .from('documents')
            .select('id, metadata, category_id, folder_id')
            .eq('id', numericId)
            .single();

        // Fallback: if not found by id, try by documentId from client (if provided)
        if ((fetchError || !docChunk) && clientDocumentId) {
            const { data: fallbackDoc, error: fallbackError } = await supabase
                .from('documents')
                .select('id, metadata, category_id, folder_id')
                .eq('metadata->>documentId', clientDocumentId)
                .limit(1)
                .single();
            if (!fallbackError && fallbackDoc) {
                docChunk = fallbackDoc;
                fetchError = null;
            }
        }

        if (fetchError || !docChunk) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // Preserve the document name - use provided name or existing name
        const documentName = name || docChunk.metadata?.name;
        // Preserve category_id - use provided categoryId if explicitly set, otherwise keep the old one
        const finalCategoryId = categoryId !== undefined ? categoryId : docChunk.category_id;
        // Preserve folder_id from the original document
        const folderId = docChunk.folder_id;
        // Get document_id from metadata if it exists (for tracking chunks of the same document)
        const existingDocumentId = docChunk.metadata?.documentId || clientDocumentId;

        // Find all chunks that belong to this document
        // Strategy 1: Use documentId in metadata (most reliable - tracks all chunks of same document)
        // Strategy 2: Fallback to name + category_id if documentId doesn't exist
        let chunksToDelete: any[] = [];
        
        if (existingDocumentId) {
            // Best case: use documentId to find all chunks
            // Query all documents and filter by documentId in metadata
            const { data: allDocs, error: chunksError } = await supabase
                .from('documents')
                .select('id, metadata, category_id');
            
            if (!chunksError && allDocs) {
                chunksToDelete = allDocs
                    .filter((doc: any) => doc.metadata?.documentId === existingDocumentId)
                    .map((doc: any) => ({ id: doc.id }));
            }
        } else {
            // Fallback: use name + category_id
            // Build query to find all chunks of this document
            let query = supabase
                .from('documents')
                .select('id, metadata, category_id');
            
            // If we have a category_id, use it to narrow down the search
            const searchCategoryId = finalCategoryId;
            
            if (searchCategoryId) {
                query = query.eq('category_id', searchCategoryId);
            }
            
            const { data: allDocs, error: chunksError } = await query;

            if (!chunksError && allDocs) {
                // Filter chunks that match both name and category (if available)
                chunksToDelete = allDocs
                    .filter((doc: any) => {
                        const nameMatch = documentName ? doc.metadata?.name === documentName : true;
                        const categoryMatch = searchCategoryId ? doc.category_id === searchCategoryId : true;
                        // Also include the original chunk ID to ensure we delete it
                        const isOriginalChunk = doc.id === numericId;
                        return (nameMatch && categoryMatch) || isOriginalChunk;
                    })
                    .map((doc: any) => ({ id: doc.id }));
            } else {
                // Fallback: if query fails, at least delete the original chunk
                chunksToDelete = [{ id: numericId }];
            }
        }

        // Create new chunks with updated content BEFORE deleting old ones to avoid data loss on failures
        // Preserve the documentId, name, categoryId, and folderId
        const metadata: { categoryId?: string | null; name?: string; documentId?: string; folderId?: string | null } = {};
        metadata.categoryId = finalCategoryId;
        if (documentName) metadata.name = documentName;
        if (existingDocumentId) metadata.documentId = existingDocumentId;
        metadata.folderId = folderId;

        try {
            await addDocument(text, metadata);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to update document';
            return NextResponse.json({ 
                error: errorMessage
            }, { status: 500 });
        }

        // After new chunks are created successfully, delete old chunks
        if (chunksToDelete.length > 0) {
            const chunkIds = chunksToDelete.map((c: any) => c.id);
            const { error: deleteError } = await supabase
                .from('documents')
                .delete()
                .in('id', chunkIds);

            if (deleteError) {
                console.error('Error deleting old chunks:', deleteError);
                // Non-fatal: return success but warn about duplicates; safer than losing new data
            }
        }

        // Update media_urls for all chunks of this document
        // Note: media_urls column may not exist in all databases, so wrap in try-catch
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const docMediaUrls = (docChunk as any)?.media_urls;
            const finalMediaUrls = mediaUrls !== undefined ? (Array.isArray(mediaUrls) ? mediaUrls : []) : (Array.isArray(docMediaUrls) ? docMediaUrls : []);
            
            if (existingDocumentId) {
                // Find all chunks with this documentId and update their media_urls
                const { data: allChunks } = await supabase
                    .from('documents')
                    .select('id, metadata')
                    .eq('metadata->>documentId', existingDocumentId);

                if (allChunks && allChunks.length > 0) {
                    const chunkIds = allChunks.map((c: any) => c.id);
                    const { error: updateError } = await supabase
                        .from('documents')
                        .update({ media_urls: finalMediaUrls })
                        .in('id', chunkIds);
                    
                    if (updateError) {
                        // Column might not exist - log but don't fail the request
                        console.warn('[API /knowledge] Failed to update media_urls (column may not exist):', updateError.message);
                    }
                }
            } else {
                // Fallback: update just this chunk
                const { error: updateError } = await supabase
                    .from('documents')
                    .update({ media_urls: finalMediaUrls })
                    .eq('id', numericId);
                
                if (updateError) {
                    // Column might not exist - log but don't fail the request
                    console.warn('[API /knowledge] Failed to update media_urls (column may not exist):', updateError.message);
                }
            }
        } catch (error) {
            // Column might not exist - log but don't fail the request
            console.warn('[API /knowledge] Error updating media_urls (column may not exist):', error instanceof Error ? error.message : String(error));
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PATCH - Update document's folder or category assignment
export async function PATCH(req: Request) {
    try {
        const { id, folderId, categoryId } = await req.json();

        if (!id) {
            return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
        }

        // Build update object with provided fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = {};
        if (folderId !== undefined) updates.folder_id = folderId || null;
        if (categoryId !== undefined) updates.category_id = categoryId || null;

        const { error } = await supabase
            .from('documents')
            .update(updates)
            .eq('id', id);

        if (error) {
            console.error('Error updating document:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const ids = searchParams.get('ids'); // For bulk delete

        // Handle bulk delete
        if (ids) {
            const idArray = ids.split(',').filter(Boolean);
            if (idArray.length === 0) {
                return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
            }

            const { error, data } = await supabase
                .from('documents')
                .select('id, name, category_id')
                .in('id', idArray);

            const { error: deleteError } = await supabase
                .from('documents')
                .delete()
                .in('id', idArray);

            if (deleteError) {
                return NextResponse.json({ error: deleteError.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, deletedCount: idArray.length });
        }

        // Handle single delete
        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const { data: docBeforeDelete } = await supabase
            .from('documents')
            .select('id, name, category_id')
            .eq('id', id)
            .single();

        const { error } = await supabase
            .from('documents')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
