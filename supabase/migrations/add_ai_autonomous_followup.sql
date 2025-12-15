-- Migration: Add AI Autonomous Follow-up setting
-- This column enables the AI to autonomously decide on follow-ups and next steps
-- with self-thinking capabilities

ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS enable_ai_autonomous_followup BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN bot_settings.enable_ai_autonomous_followup IS 'When enabled, AI can autonomously decide on follow-ups and proactively think about conversation next steps';
