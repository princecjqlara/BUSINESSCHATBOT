import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// Simple test endpoint to check if the table exists
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('message_ratings')
            .select('count')
            .limit(1);

        if (error) {
            if (error.message?.includes('does not exist')) {
                return NextResponse.json({
                    exists: false,
                    error: 'Table does not exist. Please run the migration: supabase/migrations/add_message_ratings.sql',
                    message: error.message,
                }, { status: 404 });
            }
            return NextResponse.json({
                exists: true,
                error: error.message,
            }, { status: 500 });
        }

        return NextResponse.json({
            exists: true,
            message: 'Table exists and is accessible',
            count: data?.length || 0,
        });
    } catch (error) {
        return NextResponse.json({
            exists: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}



