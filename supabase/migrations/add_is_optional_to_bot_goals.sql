-- Migration: Add is_optional column to bot_goals table
-- This migration adds the is_optional field to existing bot_goals table

-- Add the is_optional column if it doesn't exist
ALTER TABLE bot_goals 
ADD COLUMN IF NOT EXISTS is_optional BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN bot_goals.is_optional IS 'Whether this goal is optional (true) or required/mandatory (false). Optional goals are pursued but not strictly required, while required goals must be achieved.';



