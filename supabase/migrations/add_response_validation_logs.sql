-- Create response_validation_logs table for multi-model pipeline analytics
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS response_validation_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id TEXT NOT NULL,
    original_response TEXT NOT NULL,
    is_valid BOOLEAN DEFAULT true,
    issues TEXT[] DEFAULT '{}',
    corrected_response TEXT,
    validation_time_ms INTEGER,
    selected_model TEXT,
    selector_reasoning TEXT,
    candidates_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for querying by sender
CREATE INDEX IF NOT EXISTS idx_response_validation_logs_sender_id 
ON response_validation_logs(sender_id);

-- Add index for querying by date
CREATE INDEX IF NOT EXISTS idx_response_validation_logs_created_at 
ON response_validation_logs(created_at DESC);

-- Enable RLS
ALTER TABLE response_validation_logs ENABLE ROW LEVEL SECURITY;

-- Allow insert from authenticated users
CREATE POLICY "Allow insert for all" ON response_validation_logs
    FOR INSERT WITH CHECK (true);

-- Allow select for authenticated users
CREATE POLICY "Allow select for all" ON response_validation_logs
    FOR SELECT USING (true);
