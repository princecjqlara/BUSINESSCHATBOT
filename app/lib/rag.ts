import { supabase } from './supabase';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const EMBEDDING_MODEL = 'nvidia/nv-embedqa-e5-v5';

async function getEmbedding(text: string, inputType: 'query' | 'passage'): Promise<number[]> {
    if (!NVIDIA_API_KEY || NVIDIA_API_KEY.trim() === '') {
        throw new Error('NVIDIA_API_KEY is not configured. Please add it to your .env.local file.');
    }

    const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: [text],
            input_type: inputType,
            encoding_format: 'float',
            truncate: 'END',
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Embedding error:', errorText);

        // Provide more specific error messages based on status code
        if (response.status === 403) {
            throw new Error('NVIDIA API key is invalid or does not have permission to access the embedding model. Please check your API key at https://build.nvidia.com/ and ensure it has access to embedding models.');
        } else if (response.status === 401) {
            throw new Error('NVIDIA API key is missing or invalid. Please add a valid NVIDIA_API_KEY to your .env.local file.');
        } else {
            throw new Error(`Embedding API error: ${response.status} ${errorText}`);
        }
    }

    const data = await response.json();
    return data.data[0].embedding;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addDocument(content: string, metadata: any = {}) {
    try {
        const categoryId = metadata.categoryId;
        // Extract name from metadata to preserve it across all chunks
        const documentName = metadata.name;
        // Use existing document_id if provided (for updates), or generate a new one
        const documentId = metadata.documentId || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const chunks = await splitter.createDocuments([content]);

        console.log(`[RAG] Adding document with ${chunks.length} chunks`);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            const embedding = await getEmbedding(chunk.pageContent, 'passage');

            // Preserve document name and document_id in metadata for all chunks
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chunkMetadata: any = { ...chunk.metadata };
            if (documentName) {
                chunkMetadata.name = documentName;
            }
            // Store document_id to track all chunks belonging to the same document
            chunkMetadata.documentId = documentId;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const insertData: any = {
                content: chunk.pageContent,
                metadata: chunkMetadata,
                embedding: embedding,
            };

            // Set category_id (including null to preserve uncategorized state)
            if (categoryId !== undefined) {
                insertData.category_id = categoryId;
            }

            // Preserve folder_id if provided (for document updates, including null)
            if (metadata.folderId !== undefined) {
                insertData.folder_id = metadata.folderId;
            }

            let { error, data } = await supabase.from('documents').insert(insertData);

            // Retry without category_id if column doesn't exist
            if (error && error.message?.includes('category_id')) {
                delete insertData.category_id;
                const retryResult = await supabase.from('documents').insert(insertData);
                error = retryResult.error;
            }

            if (error) {
                console.error('Error inserting chunk:', error);
                throw error;
            }

            console.log(`[RAG] Inserted: "${chunk.pageContent.substring(0, 50)}..."`);
        }

        return true;
    } catch (error) {
        console.error('Error adding document:', error);
        // Re-throw the error so the API route can return the specific error message
        throw error;
    }
}

/**
 * Simplified but RELIABLE retrieval
 * Strategy: 
 * 1. Always fetch recent documents (ensures FAQ data is always available)
 * 2. Also do semantic search
 * 3. Combine both for best coverage
 * 
 * Returns: { content: string, mediaUrls: string[] }
 */
export async function searchDocuments(query: string, limit: number = 5, previewDocumentContent?: string): Promise<{ content: string; mediaUrls: string[] }> {
    try {
        console.log(`[RAG] Searching for: "${query}"`);

        // STRATEGY 1: Always get recent documents (ensures we have FAQ data)
        const { data: recentDocs, error: recentError } = await supabase
            .from('documents')
            .select('id, content, metadata, media_urls')
            .order('id', { ascending: false })
            .limit(5);

        if (recentError) {
            console.error('Recent docs error:', recentError);
        }

        // STRATEGY 2: Semantic search with embedding
        let semanticDocs: any[] = [];
        try {
            const queryEmbedding = await getEmbedding(query, 'query');

            const { data: matchedDocs, error: matchError } = await supabase.rpc('match_documents', {
                query_embedding: queryEmbedding,
                match_threshold: 0.20, // Very low threshold for maximum recall
                match_count: limit,
            });

            if (!matchError && matchedDocs) {
                // Fetch media_urls for matched documents
                const matchedIds = matchedDocs.map((d: any) => d.id);
                if (matchedIds.length > 0) {
                    const { data: docsWithMedia } = await supabase
                        .from('documents')
                        .select('id, media_urls')
                        .in('id', matchedIds);

                    // Merge media_urls into matchedDocs
                    const mediaMap = new Map();
                    docsWithMedia?.forEach((d: any) => {
                        mediaMap.set(d.id, d.media_urls || []);
                    });

                    semanticDocs = matchedDocs.map((doc: any) => ({
                        ...doc,
                        media_urls: mediaMap.get(doc.id) || []
                    }));
                } else {
                    semanticDocs = matchedDocs;
                }
            }
        } catch (embError) {
            console.error('Embedding search failed:', embError);
        }

        // STRATEGY 3: Keyword search for price-related queries
        let keywordDocs: any[] = [];
        const lowerQuery = query.toLowerCase();
        const isPriceQuery = lowerQuery.includes('price') ||
            lowerQuery.includes('cost') ||
            lowerQuery.includes('magkano') ||
            lowerQuery.includes('how much') ||
            lowerQuery.includes('hm') ||
            lowerQuery.includes('presyo');

        if (isPriceQuery) {
            const { data: priceDocs, error: priceError } = await supabase
                .from('documents')
                .select('id, content, metadata, media_urls')
                .or('content.ilike,content.ilike.%price%,content.ilike.%payment%')
                .limit(5);

            if (!priceError && priceDocs) {
                keywordDocs = priceDocs;
            }
        }

        // Combine all results and deduplicate
        const allDocs: any[] = [];
        const seenIds = new Set<number>();
        const seenDocumentIds = new Set<string>(); // Track documentIds to avoid duplicate mediaUrls
        const allMediaUrls = new Set<string>(); // Collect unique media URLs

        // Only collect media from semantically matched documents with HIGH similarity (>= 0.5)
        // This prevents sending irrelevant media from fallback/recent docs
        const MEDIA_SIMILARITY_THRESHOLD = 0.5;

        // Add semantic results first (highest relevance)
        for (const doc of semanticDocs) {
            if (!seenIds.has(doc.id)) {
                seenIds.add(doc.id);
                allDocs.push({ ...doc, source: 'semantic' });

                // Only collect mediaUrls if similarity is high enough
                // This ensures we only send media that's actually relevant to the query
                const similarity = doc.similarity || 0;
                const docId = doc.metadata?.documentId;
                if (similarity >= MEDIA_SIMILARITY_THRESHOLD && docId && !seenDocumentIds.has(docId)) {
                    seenDocumentIds.add(docId);
                    if (doc.media_urls && Array.isArray(doc.media_urls)) {
                        console.log(`[RAG] Including media from doc ${doc.id} (similarity: ${similarity.toFixed(2)})`);
                        doc.media_urls.forEach((url: string) => allMediaUrls.add(url));
                    }
                } else if (similarity < MEDIA_SIMILARITY_THRESHOLD && doc.media_urls?.length > 0) {
                    console.log(`[RAG] Skipping media from doc ${doc.id} - low similarity: ${similarity.toFixed(2)} < ${MEDIA_SIMILARITY_THRESHOLD}`);
                }
            }
        }

        // Add keyword results for price queries (text context only, no media)
        for (const doc of keywordDocs) {
            if (!seenIds.has(doc.id)) {
                seenIds.add(doc.id);
                allDocs.push({ ...doc, source: 'keyword' });
                // Note: We intentionally don't collect media from keyword matches
                // as they may not be semantically relevant to the query
            }
        }

        // Add recent docs as fallback (text context only, no media)
        for (const doc of (recentDocs || [])) {
            if (!seenIds.has(doc.id)) {
                seenIds.add(doc.id);
                allDocs.push({ ...doc, source: 'recent' });
                // Note: We intentionally don't collect media from recent docs
                // as they are fallback content and may not be relevant
            }
        }

        // Log results
        console.log(`[RAG] Found ${allDocs.length} documents`);
        allDocs.slice(0, 5).forEach((doc, i) => {
            console.log(`[RAG] Doc ${i + 1} [${doc.source}]: ${doc.content?.substring(0, 80)}...`);
        });

        if (allDocs.length === 0) {
            console.log('[RAG] No documents found');
            return { content: '', mediaUrls: [] };
        }

        // Extract content
        let content = allDocs
            .slice(0, limit)
            .map(doc => doc.content)
            .join('\n\n');

        // If preview document content is provided, prepend it to the context
        // This allows test bot to preview responses with unapplied AI edits
        if (previewDocumentContent && previewDocumentContent.trim().length > 0) {
            console.log(`[RAG] Including preview document content (${previewDocumentContent.length} chars)`);
            content = previewDocumentContent + '\n\n' + content;
        }

        return { content, mediaUrls: Array.from(allMediaUrls) };

    } catch (error) {
        console.error('Error in RAG search:', error);
        // Last resort: just get any documents we have
        try {
            const { data: fallbackDocs } = await supabase
                .from('documents')
                .select('content, media_urls')
                .limit(3);

            if (fallbackDocs && fallbackDocs.length > 0) {
                console.log('[RAG] Using fallback - returning all docs');
                const content = fallbackDocs.map((d: any) => d.content).join('\n\n');
                // Collect mediaUrls from fallback docs
                const fallbackMediaUrls = new Set<string>();
                for (const doc of fallbackDocs) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const docAny = doc as any;
                    if (docAny.media_urls && Array.isArray(docAny.media_urls)) {
                        docAny.media_urls.forEach((url: string) => fallbackMediaUrls.add(url));
                    }
                }
                return { content, mediaUrls: Array.from(fallbackMediaUrls) };
            }
        } catch (e) {
            console.error('Fallback also failed:', e);
        }
        return { content: '', mediaUrls: [] };
    }
}
