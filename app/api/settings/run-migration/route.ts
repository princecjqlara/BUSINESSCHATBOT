import { NextResponse } from 'next/server';

// Endpoint to provide migration SQL and instructions
export async function GET() {
    const migrationSQL = `-- Migration: Add max_sentences_per_message setting to bot_settings
-- This controls how many sentences the AI can send per message

ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS max_sentences_per_message INT DEFAULT 3;

-- Comment for documentation
COMMENT ON COLUMN bot_settings.max_sentences_per_message IS 'Maximum number of sentences the AI can send per message. Default is 3. Set to 0 or NULL for no limit.';`;

    return NextResponse.json({
        success: true,
        message: 'Migration SQL ready',
        sql: migrationSQL,
        instructions: [
            '1. Go to your Supabase Dashboard',
            '2. Navigate to SQL Editor (https://supabase.com/dashboard/project/_/sql/new)',
            '3. Copy and paste the SQL above',
            '4. Click "Run" or press Ctrl+Enter',
            '5. After running, refresh your app and try saving the message length setting again'
        ],
        file: 'supabase/migrations/add_max_sentences_setting.sql'
    });
}


