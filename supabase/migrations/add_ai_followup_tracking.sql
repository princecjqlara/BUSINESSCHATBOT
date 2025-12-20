-- Migration: Add AI Autonomous Follow-up Tracking
-- This table tracks AI-initiated follow-up messages and their reasoning

-- Create the ai_followups table
CREATE TABLE IF NOT EXISTS ai_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL,
    message_text TEXT NOT NULL,
    ai_reasoning TEXT,
    followup_type TEXT DEFAULT 'stale_conversation' CHECK (followup_type IN ('stale_conversation', 're_engagement', 'nurture', 'custom')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'sent', 'cancelled', 'failed')),
    scheduled_for TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    conversation_context JSONB,
    best_contact_time_used JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_followups_lead_id ON ai_followups(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_followups_status ON ai_followups(status);
CREATE INDEX IF NOT EXISTS idx_ai_followups_scheduled_for ON ai_followups(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_ai_followups_sender_id ON ai_followups(sender_id);

-- Enable RLS
ALTER TABLE ai_followups ENABLE ROW LEVEL SECURITY;

-- Policy (allow all for now - customize based on your auth)
CREATE POLICY "Allow all operations on ai_followups" ON ai_followups
    FOR ALL USING (true) WITH CHECK (true);

-- Add new settings columns to bot_settings
ALTER TABLE bot_settings
ADD COLUMN IF NOT EXISTS ai_followup_cooldown_hours INTEGER DEFAULT 24;

ALTER TABLE bot_settings
ADD COLUMN IF NOT EXISTS ai_followup_stale_threshold_hours INTEGER DEFAULT 48;

ALTER TABLE bot_settings
ADD COLUMN IF NOT EXISTS ai_followup_max_per_lead INTEGER DEFAULT 3;

-- Add last_ai_followup_at to leads table for tracking
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS last_ai_followup_at TIMESTAMPTZ DEFAULT NULL;

-- Comments for documentation
COMMENT ON TABLE ai_followups IS 'Tracks AI-initiated follow-up messages with reasoning and scheduling details';
COMMENT ON COLUMN ai_followups.ai_reasoning IS 'AI explanation for why this follow-up was initiated';
COMMENT ON COLUMN ai_followups.followup_type IS 'Type of follow-up: stale_conversation, re_engagement, nurture, custom';
COMMENT ON COLUMN ai_followups.best_contact_time_used IS 'Best contact time window used for scheduling this follow-up';
COMMENT ON COLUMN bot_settings.ai_followup_cooldown_hours IS 'Minimum hours between AI follow-ups to the same lead';
COMMENT ON COLUMN bot_settings.ai_followup_stale_threshold_hours IS 'Hours without activity before AI considers a conversation stale';
COMMENT ON COLUMN bot_settings.ai_followup_max_per_lead IS 'Maximum AI-initiated follow-ups per lead before they respond';
COMMENT ON COLUMN leads.last_ai_followup_at IS 'Timestamp of last AI-initiated follow-up to this lead';
