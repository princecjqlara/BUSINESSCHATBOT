-- Migration: Add bot goals feature
-- This allows the bot to have goals that it tries to achieve during conversations with leads
-- Goals can be prioritized and completion is tracked per lead

-- ============================================================================
-- PART 1: BOT GOALS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_name TEXT NOT NULL,
  goal_description TEXT,
  priority_order INT, -- Lower number = higher priority (optional)
  is_active BOOLEAN DEFAULT true,
  is_optional BOOLEAN DEFAULT false, -- Whether this goal is optional (false = required/mandatory)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(goal_name)
);

-- Index for efficient querying by priority (NULL values are handled separately)
CREATE INDEX IF NOT EXISTS idx_bot_goals_priority ON bot_goals(priority_order) WHERE is_active = true AND priority_order IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bot_goals_active ON bot_goals(is_active);

-- Enable RLS
ALTER TABLE bot_goals ENABLE ROW LEVEL SECURITY;

-- Policy (drop if exists to allow re-running migration)
DROP POLICY IF EXISTS "Allow all operations on bot_goals" ON bot_goals;
CREATE POLICY "Allow all operations on bot_goals" ON bot_goals
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 2: LEAD GOAL COMPLETIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_goal_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES bot_goals(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL, -- For quick lookups without joining leads
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  completion_context TEXT, -- Optional: context about how/why goal was completed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, goal_id) -- Prevent duplicate completions
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_lead_goal_completions_lead ON lead_goal_completions(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_goal_completions_goal ON lead_goal_completions(goal_id);
CREATE INDEX IF NOT EXISTS idx_lead_goal_completions_sender ON lead_goal_completions(sender_id);
CREATE INDEX IF NOT EXISTS idx_lead_goal_completions_completed_at ON lead_goal_completions(completed_at);

-- Enable RLS
ALTER TABLE lead_goal_completions ENABLE ROW LEVEL SECURITY;

-- Policy (drop if exists to allow re-running migration)
DROP POLICY IF EXISTS "Allow all operations on lead_goal_completions" ON lead_goal_completions;
CREATE POLICY "Allow all operations on lead_goal_completions" ON lead_goal_completions
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 3: TRIGGER FOR UPDATED_AT
-- ============================================================================

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for bot_goals
DROP TRIGGER IF EXISTS update_bot_goals_updated_at ON bot_goals;
CREATE TRIGGER update_bot_goals_updated_at
  BEFORE UPDATE ON bot_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 4: COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE bot_goals IS 'Stores goals that the bot should try to achieve during conversations with leads. Goals are ordered by priority_order (lower = higher priority).';
COMMENT ON COLUMN bot_goals.priority_order IS 'Priority order for goals. Lower numbers indicate higher priority. Goals are processed in this order. NULL values indicate no specific priority (processed after prioritized goals).';
COMMENT ON COLUMN bot_goals.is_active IS 'Whether this goal is currently active. Inactive goals are not pursued by the bot.';
COMMENT ON COLUMN bot_goals.is_optional IS 'Whether this goal is optional (true) or required/mandatory (false). Optional goals are pursued but not strictly required, while required goals must be achieved.';

COMMENT ON TABLE lead_goal_completions IS 'Tracks which goals have been successfully completed for each lead during conversations.';
COMMENT ON COLUMN lead_goal_completions.completion_context IS 'Optional context about how or why the goal was completed (e.g., "User provided email address", "User expressed interest in product X").';




