import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// GET - List all categories
export async function GET() {
    try {
        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'categories/route.ts:GET:entry',message:'GET request for categories',data:{timestamp:new Date().toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        }
        // #endregion

        const { data, error } = await supabase
            .from('knowledge_categories')
            .select('*')
            .order('created_at', { ascending: true });

        // #region agent log
        if (typeof fetch !== 'undefined') {
            fetch('http://127.0.0.1:7243/ingest/be8dd005-a281-45cf-bcd3-1e20a0428380',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'categories/route.ts:GET:after-query',message:'Categories query completed',data:{error:error?.message || null,count:data?.length || 0,hasData:!!data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        }
        // #endregion

        if (error) {
            console.error('Error fetching categories:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create a new category
export async function POST(req: Request) {
    try {
        const { name, type, color } = await req.json();

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('knowledge_categories')
            .insert({
                name,
                type: type || 'general',
                color: color || 'gray',
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating category:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Remove a category
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('knowledge_categories')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting category:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
