-- Migration: Add session tracking for Human Spam Logic
-- This enables session-aware timing decisions

-- Track last interaction time for session detection
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN leads.last_interaction_at IS 'Most recent interaction time (user message or AI followup) for session detection';

-- Create index for efficient session queries
CREATE INDEX IF NOT EXISTS idx_leads_last_interaction ON leads(last_interaction_at) 
WHERE last_interaction_at IS NOT NULL;

-- Add internal thought tracking to ai_followups
ALTER TABLE ai_followups
ADD COLUMN IF NOT EXISTS internal_thought TEXT DEFAULT NULL;

ALTER TABLE ai_followups
ADD COLUMN IF NOT EXISTS timing_relaxation JSONB DEFAULT NULL;

ALTER TABLE ai_followups
ADD COLUMN IF NOT EXISTS session_state JSONB DEFAULT NULL;

-- Comments
COMMENT ON COLUMN ai_followups.internal_thought IS 'Human-like reasoning that signals intent (urgency/care) not anxiety';
COMMENT ON COLUMN ai_followups.timing_relaxation IS 'Timing relaxation rules applied based on spam tolerance score';
COMMENT ON COLUMN ai_followups.session_state IS 'Session detection state at decision time';

-- Verify migration
SELECT 'Session tracking migration complete' as status;
