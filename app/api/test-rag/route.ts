import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { searchDocuments } from '@/app/lib/rag';

/**
 * Diagnostic endpoint to test RAG system
 * GET /api/test-rag?query=magkano
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || 'price';

    const results: Record<string, unknown> = {
        query,
        timestamp: new Date().toISOString(),
    };

    try {
        // Test 1: Check if documents table exists and has data
        const { data: allDocs, error: docsError } = await supabase
            .from('documents')
            .select('id, content, metadata, category_id')
            .limit(10);

        results.documentsTable = {
            success: !docsError,
            error: docsError?.message,
            count: allDocs?.length || 0,
            samples: allDocs?.map((d: any) => ({
                id: d.id,
                preview: d.content?.substring(0, 100) + '...',
                hasEmbedding: true, // If it's in the table, it should have embedding
                categoryId: d.category_id,
            })),
        };

        // Test 2: Check if embeddings exist
        const { data: docsWithEmbedding, error: embError } = await supabase
            .from('documents')
            .select('id, embedding')
            .limit(5);

        results.embeddings = {
            success: !embError,
            error: embError?.message,
            count: docsWithEmbedding?.length || 0,
            hasEmbeddings: docsWithEmbedding?.every((d: any) => d.embedding && d.embedding.length > 0),
            sampleEmbeddingLength: docsWithEmbedding?.[0]?.embedding?.length,
        };

        // Test 3: Check match_documents function exists
        try {
            const testEmbedding = new Array(1024).fill(0.1); // Dummy embedding
            const { data: matchTest, error: matchError } = await supabase.rpc('match_documents', {
                query_embedding: testEmbedding,
                match_threshold: 0.0,
                match_count: 3,
            });

            results.matchFunction = {
                success: !matchError,
                error: matchError?.message,
                resultsCount: matchTest?.length || 0,
            };
        } catch (e: unknown) {
            results.matchFunction = {
                success: false,
                error: e instanceof Error ? e.message : 'Unknown error',
            };
        }

        // Test 4: Actual RAG search
        try {
            const ragResult = await searchDocuments(query, 5);
            results.ragSearch = {
                success: true,
                query,
                resultLength: ragResult.content.length,
                preview: ragResult.content.substring(0, 500) + (ragResult.content.length > 500 ? '...' : ''),
                mediaUrlsCount: ragResult.mediaUrls.length,
            };
        } catch (e: unknown) {
            results.ragSearch = {
                success: false,
                error: e instanceof Error ? e.message : 'Unknown error',
            };
        }

        // Test 5: Check knowledge_categories table
        const { data: categories, error: catError } = await supabase
            .from('knowledge_categories')
            .select('*');

        results.categoriesTable = {
            success: !catError,
            error: catError?.message,
            count: categories?.length || 0,
            categories: categories,
        };

        return NextResponse.json(results);
    } catch (error: unknown) {
        return NextResponse.json({
            ...results,
            fatalError: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
