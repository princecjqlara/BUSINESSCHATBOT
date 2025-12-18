-- Migration: Add Conversation Analysis Storage Table
-- Run this in Supabase SQL Editor
-- 
-- This table stores AI conversation analysis results for ML learning and improvement tracking

-- ============================================================================
-- PART 1: CONVERSATION ANALYSIS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversation_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Analysis Scores
  overall_score INTEGER DEFAULT 0, -- 0-100 score
  mistake_count INTEGER DEFAULT 0,
  blunder_count INTEGER DEFAULT 0,
  questionable_count INTEGER DEFAULT 0,
  good_count INTEGER DEFAULT 0,
  excellent_count INTEGER DEFAULT 0,
  
  -- Analysis Data (JSONB for flexibility)
  key_insights JSONB DEFAULT '[]'::jsonb, -- Array of insight strings
  improvement_areas JSONB DEFAULT '[]'::jsonb, -- Array of areas to improve
  rules_learned JSONB DEFAULT '[]'::jsonb, -- Array of rules extracted from this analysis
  
  -- Message Breakdown
  message_count INTEGER DEFAULT 0,
  analyzed_messages JSONB DEFAULT '[]'::jsonb, -- Detailed per-message analysis
  
  -- Trigger Context
  trigger_stage TEXT, -- Pipeline stage that triggered analysis
  trigger_event TEXT, -- Event type: 'manual', 'stage_change', 'auto_learn'
  
  -- Timestamps
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_conversation_analysis_sender_id ON conversation_analysis(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversation_analysis_lead_id ON conversation_analysis(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversation_analysis_analyzed_at ON conversation_analysis(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_analysis_score ON conversation_analysis(overall_score);

-- Enable RLS
ALTER TABLE conversation_analysis ENABLE ROW LEVEL SECURITY;

-- Policy (allow all operations)
DROP POLICY IF EXISTS "Allow all operations on conversation_analysis" ON conversation_analysis;
CREATE POLICY "Allow all operations on conversation_analysis" ON conversation_analysis
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 2: ADD HELPER VIEW FOR DASHBOARD ANALYTICS
-- ============================================================================

CREATE OR REPLACE VIEW conversation_analysis_summary AS
SELECT 
  DATE_TRUNC('day', analyzed_at) AS analysis_date,
  COUNT(*) AS total_analyses,
  AVG(overall_score) AS avg_score,
  SUM(mistake_count) AS total_mistakes,
  SUM(blunder_count) AS total_blunders,
  SUM(excellent_count) AS total_excellent,
  SUM(message_count) AS total_messages_analyzed
FROM conversation_analysis
GROUP BY DATE_TRUNC('day', analyzed_at)
ORDER BY analysis_date DESC;

-- ============================================================================
-- PART 3: ADD COLUMN TO LEADS IF NOT EXISTS (for inline analysis storage)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    ALTER TABLE leads 
    ADD COLUMN IF NOT EXISTS conversation_analysis JSONB DEFAULT NULL;

    COMMENT ON COLUMN leads.conversation_analysis IS 'Latest AI conversation analysis for this lead. Updated when auto-analysis runs on stage change.';
  END IF;
END $$;

-- ============================================================================
-- COMPLETION
-- ============================================================================

-- This migration creates:
-- 1. conversation_analysis table - Stores detailed conversation analysis results
-- 2. conversation_analysis_summary view - Aggregated analytics for dashboard
-- 3. Adds conversation_analysis column to leads table for quick access
