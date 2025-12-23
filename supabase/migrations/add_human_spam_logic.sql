-- Migration: Add Human Spam Logic tracking fields
-- This enables AI to make follow-up decisions like a human

-- ============================================
-- PART 1: Lead-level spam tracking fields
-- ============================================

-- Track position in human escalation arc (1-5)
-- 1: Normal spacing, 2: Shorter, 3: Urgent nudge, 4: Final try, 5: STOPPED
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS escalation_arc_position INTEGER DEFAULT 1;

-- Add constraint for valid range (do separately to avoid error if already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'leads_escalation_arc_range'
    ) THEN
        ALTER TABLE leads
        ADD CONSTRAINT leads_escalation_arc_range 
        CHECK (escalation_arc_position >= 1 AND escalation_arc_position <= 5);
    END IF;
END $$;

-- When did the current follow-up sequence start (resets when they reply)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS follow_up_sequence_started_at TIMESTAMPTZ DEFAULT NULL;

-- Count of consecutive follow-ups without response (resets when they reply)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS consecutive_followups_no_response INTEGER DEFAULT 0;

-- Store detected disengagement signals
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS disengagement_signals JSONB DEFAULT '{}';

-- ============================================
-- PART 2: AI Followup record tracking
-- ============================================

-- Spam tolerance score (0-100) computed at decision time
ALTER TABLE ai_followups
ADD COLUMN IF NOT EXISTS spam_tolerance_score INTEGER DEFAULT NULL;

-- Which of the 4 justification conditions were active
ALTER TABLE ai_followups
ADD COLUMN IF NOT EXISTS justification_conditions JSONB DEFAULT '[]';

-- Did the "Would I Regret Not Sending" test pass?
ALTER TABLE ai_followups
ADD COLUMN IF NOT EXISTS regret_test_passed BOOLEAN DEFAULT NULL;

-- Position in escalation arc when this was sent
ALTER TABLE ai_followups
ADD COLUMN IF NOT EXISTS escalation_position INTEGER DEFAULT NULL;

-- Score breakdown for debugging/analysis
ALTER TABLE ai_followups
ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT NULL;

-- ============================================
-- PART 3: Comments for documentation
-- ============================================

COMMENT ON COLUMN leads.escalation_arc_position IS 'Position in human escalation arc: 1=normal, 2=shorter, 3=urgent, 4=final, 5=stopped';
COMMENT ON COLUMN leads.follow_up_sequence_started_at IS 'When the current follow-up sequence started (resets when lead replies)';
COMMENT ON COLUMN leads.consecutive_followups_no_response IS 'Number of consecutive AI follow-ups without a response from lead';
COMMENT ON COLUMN leads.disengagement_signals IS 'JSON tracking disengagement signals like shorter replies, longer delays, etc.';

COMMENT ON COLUMN ai_followups.spam_tolerance_score IS 'Computed spam tolerance score (0-100) at decision time';
COMMENT ON COLUMN ai_followups.justification_conditions IS 'Array of active spam justification conditions: highStakes, ambiguousSilence, tolerantChannel, asymmetricValue';
COMMENT ON COLUMN ai_followups.regret_test_passed IS 'Whether the "Would I Regret Not Sending" test passed for borderline decisions';
COMMENT ON COLUMN ai_followups.escalation_position IS 'Position in escalation arc (1-5) when this follow-up was sent';
COMMENT ON COLUMN ai_followups.score_breakdown IS 'Detailed breakdown of spam tolerance score components';

-- ============================================
-- PART 4: Indexes for efficient querying
-- ============================================

CREATE INDEX IF NOT EXISTS idx_leads_escalation_arc ON leads(escalation_arc_position) 
WHERE escalation_arc_position > 1;

CREATE INDEX IF NOT EXISTS idx_leads_consecutive_followups ON leads(consecutive_followups_no_response) 
WHERE consecutive_followups_no_response > 0;

-- Verify migration
SELECT 'Migration complete. New columns added:' as status;
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'leads' 
AND column_name IN ('escalation_arc_position', 'follow_up_sequence_started_at', 'consecutive_followups_no_response', 'disengagement_signals');
