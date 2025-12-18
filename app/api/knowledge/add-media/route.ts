import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

/**
 * POST /api/knowledge/add-media
 * Add a media URL to a document's media_urls array
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { documentId, mediaUrl } = body;

        if (!documentId) {
            return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
        }

        if (!mediaUrl || typeof mediaUrl !== 'string') {
            return NextResponse.json({ error: 'Valid media URL is required' }, { status: 400 });
        }

        // Get the document to find its documentId (metadata->>documentId)
        const { data: docChunk, error: fetchError } = await supabase
            .from('documents')
            .select('id, metadata, media_urls')
            .eq('id', documentId)
            .single();

        if (fetchError || !docChunk) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // Get the documentId from metadata to find all chunks
        const existingDocumentId = docChunk.metadata?.documentId;

        // Get current media_urls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentMediaUrls: string[] = Array.isArray((docChunk as any).media_urls) 
            ? (docChunk as any).media_urls 
            : [];

        // Check if URL already exists
        if (currentMediaUrls.includes(mediaUrl)) {
            return NextResponse.json({ 
                success: true, 
                message: 'Media URL already exists in document',
                mediaUrls: currentMediaUrls 
            });
        }

        // Add the new media URL
        const updatedMediaUrls = [...currentMediaUrls, mediaUrl];

        // Update all chunks of this document with the new media_urls
        try {
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
                        .update({ media_urls: updatedMediaUrls })
                        .in('id', chunkIds);
                    
                    if (updateError) {
                        console.warn('[API /knowledge/add-media] Failed to update media_urls:', updateError.message);
                        return NextResponse.json({ 
                            error: 'Failed to update document media URLs',
                            details: updateError.message 
                        }, { status: 500 });
                    }
                } else {
                    // Fallback: update just this chunk
                    const { error: updateError } = await supabase
                        .from('documents')
                        .update({ media_urls: updatedMediaUrls })
                        .eq('id', documentId);
                    
                    if (updateError) {
                        console.warn('[API /knowledge/add-media] Failed to update media_urls:', updateError.message);
                        return NextResponse.json({ 
                            error: 'Failed to update document media URLs',
                            details: updateError.message 
                        }, { status: 500 });
                    }
                }
            } else {
                // No documentId in metadata, update just this chunk
                const { error: updateError } = await supabase
                    .from('documents')
                    .update({ media_urls: updatedMediaUrls })
                    .eq('id', documentId);
                
                if (updateError) {
                    console.warn('[API /knowledge/add-media] Failed to update media_urls:', updateError.message);
                    return NextResponse.json({ 
                        error: 'Failed to update document media URLs',
                        details: updateError.message 
                    }, { status: 500 });
                }
            }

            return NextResponse.json({ 
                success: true, 
                message: 'Media URL added to document',
                mediaUrls: updatedMediaUrls 
            });
        } catch (error) {
            console.error('[API /knowledge/add-media] Error updating media_urls:', error);
            return NextResponse.json({ 
                error: 'Failed to update document media URLs',
                details: error instanceof Error ? error.message : String(error)
            }, { status: 500 });
        }
    } catch (error) {
        console.error('[API /knowledge/add-media] Unexpected error:', error);
        return NextResponse.json({ 
            error: 'Internal Server Error',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}



