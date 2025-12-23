-- Add missing columns to ai_followups table for enhanced AI follow-up tracking
-- Run this in Supabase SQL Editor

-- Add urgency column
ALTER TABLE ai_followups 
ADD COLUMN IF NOT EXISTS urgency TEXT DEFAULT 'low';

-- Add ai_reasoning column if missing
ALTER TABLE ai_followups 
ADD COLUMN IF NOT EXISTS ai_reasoning TEXT;

-- Add suggested_approach column if missing  
ALTER TABLE ai_followups 
ADD COLUMN IF NOT EXISTS suggested_approach TEXT;

-- Verify the table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ai_followups'
ORDER BY ordinal_position;
