/**
 * Media Migration API
 * Migrate non-Cloudinary media URLs to Cloudinary
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// POST - Migrate media URLs to Cloudinary
export async function POST(req: Request) {
    try {
        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'media/migrate-to-cloudinary/route.ts:POST:entry',message:'Media migration request received',data:{timestamp:new Date().toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        }
        // #endregion

        const body = await req.json();
        const { dryRun = false, table = 'documents' } = body;

        // Check Cloudinary configuration
        const hasCloudName = !!process.env.CLOUDINARY_CLOUD_NAME;
        const hasApiKey = !!process.env.CLOUDINARY_API_KEY;
        const hasApiSecret = !!process.env.CLOUDINARY_API_SECRET;

        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'media/migrate-to-cloudinary/route.ts:POST:config-check',message:'Cloudinary config check',data:{hasCloudName,hasApiKey,hasApiSecret,dryRun,table},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        }
        // #endregion

        if (!hasCloudName || !hasApiKey || !hasApiSecret) {
            return NextResponse.json(
                { error: 'Cloudinary is not configured' },
                { status: 500 }
            );
        }

        const migrated: any[] = [];
        const errors: any[] = [];
        const skipped: any[] = [];

        if (table === 'documents') {
            // Get all documents with media_urls
            const { data: documents, error: fetchError } = await supabase
                .from('documents')
                .select('id, metadata, media_urls')
                .not('media_urls', 'is', null);

            // #region agent log
            if (typeof fetch !== 'undefined') {
                fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'media/migrate-to-cloudinary/route.ts:POST:fetched-documents',message:'Fetched documents with media',data:{count:documents?.length || 0,error:fetchError?.message || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            }
            // #endregion

            if (fetchError) {
                return NextResponse.json(
                    { error: 'Failed to fetch documents', details: fetchError },
                    { status: 500 }
                );
            }

            for (const doc of documents || []) {
                const mediaUrls = doc.media_urls as string[] || [];
                if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) continue;

                const newMediaUrls: string[] = [];
                let needsUpdate = false;

                for (const url of mediaUrls) {
                    if (!url || typeof url !== 'string') continue;

                    // Check if already Cloudinary URL
                    if (url.includes('res.cloudinary.com')) {
                        newMediaUrls.push(url);
                        continue;
                    }

                    // Skip if it's not a valid HTTP(S) URL
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        skipped.push({
                            document_id: doc.id,
                            url,
                            reason: 'Invalid URL format',
                        });
                        continue;
                    }

                    needsUpdate = true;

                    if (dryRun) {
                        newMediaUrls.push(`[WOULD MIGRATE] ${url}`);
                    } else {
                        try {
                            // Download the file from the URL
                            // #region agent log
                            if (typeof fetch !== 'undefined') {
                                fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'media/migrate-to-cloudinary/route.ts:POST:downloading',message:'Downloading media for migration',data:{documentId:doc.id,url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                            }
                            // #endregion

                            const response = await fetch(url);
                            if (!response.ok) {
                                throw new Error(`Failed to download: ${response.statusText}`);
                            }

                            const arrayBuffer = await response.arrayBuffer();
                            const buffer = Buffer.from(arrayBuffer);
                            const base64 = buffer.toString('base64');
                            const mimeType = response.headers.get('content-type') || 'application/octet-stream';
                            const dataURI = `data:${mimeType};base64,${base64}`;

                            // Upload to Cloudinary
                            // #region agent log
                            if (typeof fetch !== 'undefined') {
                                fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'media/migrate-to-cloudinary/route.ts:POST:uploading',message:'Uploading to Cloudinary',data:{documentId:doc.id,originalUrl:url,mimeType},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                            }
                            // #endregion

                            const uploadResult = await cloudinary.uploader.upload(dataURI, {
                                folder: 'documents',
                                resource_type: 'auto',
                            });

                            if (uploadResult.secure_url) {
                                newMediaUrls.push(uploadResult.secure_url);
                                migrated.push({
                                    document_id: doc.id,
                                    original_url: url,
                                    cloudinary_url: uploadResult.secure_url,
                                });
                            } else {
                                throw new Error('No secure_url returned from Cloudinary');
                            }
                        } catch (error: any) {
                            errors.push({
                                document_id: doc.id,
                                url,
                                error: error.message || String(error),
                            });
                            // Keep original URL if migration fails
                            newMediaUrls.push(url);
                        }
                    }
                }

                // Update document if URLs changed
                if (needsUpdate && !dryRun) {
                    const { error: updateError } = await supabase
                        .from('documents')
                        .update({ media_urls: newMediaUrls })
                        .eq('id', doc.id);

                    // #region agent log
                    if (typeof fetch !== 'undefined') {
                        fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'media/migrate-to-cloudinary/route.ts:POST:updated',message:'Updated document media URLs',data:{documentId:doc.id,error:updateError?.message || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    }
                    // #endregion

                    if (updateError) {
                        errors.push({
                            document_id: doc.id,
                            error: `Failed to update: ${updateError.message}`,
                        });
                    }
                }
            }
        }

        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'media/migrate-to-cloudinary/route.ts:POST:complete',message:'Migration completed',data:{migratedCount:migrated.length,errorCount:errors.length,skippedCount:skipped.length,dryRun},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        }
        // #endregion

        return NextResponse.json({
            success: true,
            dryRun,
            migrated: migrated.length,
            errors: errors.length,
            skipped: skipped.length,
            details: {
                migrated,
                errors: errors.length > 0 ? errors : undefined,
                skipped: skipped.length > 0 ? skipped : undefined,
            },
        });
    } catch (error: any) {
        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'media/migrate-to-cloudinary/route.ts:POST:error',message:'Migration error',data:{error:error.message || String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        }
        // #endregion
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}

// GET - Check media URLs status
export async function GET() {
    try {
        const { data: documents, error } = await supabase
            .from('documents')
            .select('id, metadata, media_urls')
            .not('media_urls', 'is', null);

        if (error) {
            return NextResponse.json(
                { error: 'Failed to fetch documents', details: error },
                { status: 500 }
            );
        }

        let totalMedia = 0;
        let cloudinaryMedia = 0;
        let nonCloudinaryMedia = 0;

        const needsMigration: any[] = [];

        for (const doc of documents || []) {
            const mediaUrls = doc.media_urls as string[] || [];
            if (!Array.isArray(mediaUrls)) continue;

            for (const url of mediaUrls) {
                if (!url || typeof url !== 'string') continue;
                totalMedia++;
                
                if (url.includes('res.cloudinary.com')) {
                    cloudinaryMedia++;
                } else if (url.startsWith('http://') || url.startsWith('https://')) {
                    nonCloudinaryMedia++;
                    needsMigration.push({
                        document_id: doc.id,
                        document_name: (doc.metadata as any)?.name || 'Unknown',
                        url,
                    });
                }
            }
        }

        return NextResponse.json({
            totalMedia,
            cloudinaryMedia,
            nonCloudinaryMedia,
            needsMigration: needsMigration.length,
            documentsNeedingMigration: needsMigration.slice(0, 50), // Limit to first 50
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}


