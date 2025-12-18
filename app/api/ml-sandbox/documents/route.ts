/**
 * ML Sandbox Documents API
 * CRUD operations for sandbox knowledge documents
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - Fetch sandbox documents
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const categoryId = searchParams.get('categoryId');

        let query = supabase
            .from('ml_sandbox_documents')
            .select('*')
            .order('created_at', { ascending: false });

        if (categoryId) {
            query = query.eq('category_id', categoryId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[ML Sandbox Documents] GET Error:', error);
            return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
        }

        return NextResponse.json({ documents: data || [] });
    } catch (error) {
        console.error('[ML Sandbox Documents] GET Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create sandbox document
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { content, metadata, categoryId, mediaUrls } = body;

        if (!content) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('ml_sandbox_documents')
            .insert({
                content,
                metadata: metadata || {},
                category_id: categoryId || null,
                media_urls: mediaUrls || [],
            })
            .select()
            .single();

        if (error) {
            console.error('[ML Sandbox Documents] POST Error:', error);
            return NextResponse.json({ error: 'Failed to create document' }, { status: 500 });
        }

        return NextResponse.json({ document: data, message: 'Document created' });
    } catch (error) {
        console.error('[ML Sandbox Documents] POST Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PUT - Update sandbox document
export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, content, metadata, categoryId, mediaUrls } = body;

        if (!id) {
            return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (content !== undefined) updates.content = content;
        if (metadata !== undefined) updates.metadata = metadata;
        if (categoryId !== undefined) updates.category_id = categoryId;
        if (mediaUrls !== undefined) updates.media_urls = mediaUrls;

        const { data, error } = await supabase
            .from('ml_sandbox_documents')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[ML Sandbox Documents] PUT Error:', error);
            return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
        }

        return NextResponse.json({ document: data, message: 'Document updated' });
    } catch (error) {
        console.error('[ML Sandbox Documents] PUT Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Delete sandbox document
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('ml_sandbox_documents')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[ML Sandbox Documents] DELETE Error:', error);
            return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('[ML Sandbox Documents] DELETE Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
