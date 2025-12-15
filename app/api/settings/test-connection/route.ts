import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// Test endpoint to verify database connection and permissions
export async function GET() {
    try {
        // Test 1: Check if we can read from bot_settings
        const { data: readData, error: readError } = await supabase
            .from('bot_settings')
            .select('*')
            .limit(1)
            .maybeSingle();

        if (readError) {
            return NextResponse.json({
                success: false,
                test: 'read',
                error: readError.message,
                code: readError.code,
                hint: readError.hint
            }, { status: 500 });
        }

        // Test 2: Check if max_sentences_per_message column exists
        if (readData) {
            const hasColumn = 'max_sentences_per_message' in readData;
            
            // Test 3: Try updating max_sentences_per_message specifically
            if (hasColumn) {
                const { data: updateData, error: updateError } = await supabase
                    .from('bot_settings')
                    .update({ max_sentences_per_message: 1 })
                    .eq('id', readData.id)
                    .select()
                    .single();

                if (updateError) {
                    return NextResponse.json({
                        success: false,
                        test: 'update_max_sentences',
                        error: updateError.message,
                        code: updateError.code,
                        hint: updateError.hint,
                        details: updateError.details,
                        hasColumn: true
                    }, { status: 500 });
                }

                return NextResponse.json({
                    success: true,
                    message: 'Database connection and permissions are working',
                    hasMaxSentencesColumn: true,
                    settings: readData,
                    updated: updateData
                });
            } else {
                return NextResponse.json({
                    success: false,
                    test: 'column_check',
                    error: 'max_sentences_per_message column does not exist',
                    hint: 'Please run the migration: supabase/migrations/add_max_sentences_setting.sql',
                    settings: readData,
                    availableColumns: Object.keys(readData)
                }, { status: 500 });
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Database connection works, but no settings row exists',
            readData
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error?.message || String(error),
            stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
        }, { status: 500 });
    }
}

