import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - Fetch all folders
export async function GET() {
    try {
        console.log('[Folders API] Fetching folders...');

        // Try to select with category_id first, fall back if column doesn't exist
        let data, error;

        const result = await supabase
            .from('document_folders')
            .select('id, name, created_at, category_id')
            .order('created_at', { ascending: true });

        data = result.data;
        error = result.error;

        // If category_id column doesn't exist, try without it
        if (error?.message?.includes('category_id')) {
            console.log('[Folders API] category_id column not found, fetching without it');
            const fallbackResult = await supabase
                .from('document_folders')
                .select('id, name, created_at')
                .order('created_at', { ascending: true });
            data = fallbackResult.data;
            error = fallbackResult.error;
        }

        if (error) {
            console.error('[Folders API] Supabase error:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });

            // If table doesn't exist, return empty array instead of error
            if (error.message?.includes('relation "document_folders" does not exist') ||
                error.code === '42P01' ||
                error.message?.includes('does not exist')) {
                console.warn('[Folders API] document_folders table does not exist, returning empty array');
                return NextResponse.json([]);
            }

            // For other errors, still return empty array to prevent UI breakage
            // but log the error for debugging
            console.warn('[Folders API] Database error occurred, returning empty array to prevent UI breakage');
            return NextResponse.json([]);
        }

        // Handle null/undefined data
        if (!data) {
            console.warn('[Folders API] No data returned, returning empty array');
            return NextResponse.json([]);
        }

        // Map to the format expected by the frontend
        const folders = data.map((folder: any) => ({
            id: folder.id,
            name: folder.name,
            categoryId: folder.category_id || null,
            isOpen: true,
        }));

        console.log(`[Folders API] Successfully fetched ${folders.length} folder(s)`);
        return NextResponse.json(folders);
    } catch (error) {
        console.error('[Folders API] Unexpected error:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        // Return empty array on unexpected errors to prevent UI breakage
        return NextResponse.json([], { status: 200 });
    }
}

// POST - Create a new folder
export async function POST(req: Request) {
    try {
        const { name, categoryId } = await req.json();

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('document_folders')
            .insert({
                name: name.trim(),
                category_id: categoryId || null
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating folder:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            id: data.id,
            name: data.name,
            categoryId: data.category_id,
            isOpen: true,
        }, { status: 201 });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Delete a folder
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('document_folders')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting folder:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
