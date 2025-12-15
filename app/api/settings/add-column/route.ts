import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// Endpoint to add the max_sentences_per_message column if it doesn't exist
export async function POST() {
    try {
        // Check if column exists by trying to select it
        const { data: testData, error: testError } = await supabase
            .from('bot_settings')
            .select('max_sentences_per_message')
            .limit(1);

        if (testError) {
            // Column doesn't exist - try to add it using RPC
            // First, check if we have a function to add columns
            // If not, we'll need to use the Supabase SQL Editor
            
            // Try to create the column using a stored procedure if it exists
            // Otherwise, return instructions
            let rpcData = null;
            let rpcError: { message: string } | null = null;
            
            try {
                const result = await supabase.rpc('add_max_sentences_column');
                rpcData = result.data;
                rpcError = result.error;
            } catch (err) {
                rpcError = { message: 'RPC function does not exist' };
            }
            
            if (rpcError || !rpcData) {
                return NextResponse.json({
                    success: false,
                    error: 'Column does not exist',
                    message: 'The max_sentences_per_message column does not exist in the database.',
                    instruction: 'Please run this SQL in your Supabase SQL Editor:',
                    sql: `ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS max_sentences_per_message INT DEFAULT 3;`,
                    steps: [
                        '1. Go to your Supabase Dashboard',
                        '2. Navigate to SQL Editor',
                        '3. Run the SQL command shown above',
                        '4. Refresh this page or try saving settings again'
                    ]
                }, { status: 400 });
            }
            
            return NextResponse.json({
                success: true,
                message: 'Column added successfully via RPC',
                data: rpcData
            });
        }

        // Column exists
        return NextResponse.json({
            success: true,
            message: 'Column max_sentences_per_message already exists',
            data: testData
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error?.message || String(error)
        }, { status: 500 });
    }
}

