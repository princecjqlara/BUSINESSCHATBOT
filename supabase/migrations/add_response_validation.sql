-- Migration: Add response validation feature to bot_settings
-- This enables multi-model response validation to check for rule compliance and hallucinations

-- Add enable_response_validation column to bot_settings
ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS enable_response_validation BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN bot_settings.enable_response_validation IS 'When enabled, uses a secondary AI model (GPT OSS 120B) to validate bot responses for rule compliance and hallucination prevention before sending';

-- Create response_validation_logs table for audit trail and analytics
CREATE TABLE IF NOT EXISTS response_validation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  original_response TEXT NOT NULL,
  validated_response TEXT,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  issues JSONB DEFAULT '[]'::jsonb,
  suggestions JSONB DEFAULT '[]'::jsonb,
  validation_model TEXT,
  validation_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for querying by sender_id
CREATE INDEX IF NOT EXISTS idx_response_validation_logs_sender ON response_validation_logs(sender_id);

-- Create index for querying invalid responses
CREATE INDEX IF NOT EXISTS idx_response_validation_logs_invalid ON response_validation_logs(is_valid) WHERE is_valid = false;

-- Enable RLS
ALTER TABLE response_validation_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for full access (adjust as needed for your auth setup)
CREATE POLICY "Allow all operations on response_validation_logs" ON response_validation_logs
  FOR ALL USING (true) WITH CHECK (true);
