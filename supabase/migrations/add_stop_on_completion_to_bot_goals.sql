-- Add a stop-on-completion flag to bot goals so the bot can pause when key outcomes are met

ALTER TABLE bot_goals
ADD COLUMN IF NOT EXISTS stop_on_completion BOOLEAN DEFAULT FALSE;

-- Backfill any existing rows
UPDATE bot_goals
SET stop_on_completion = COALESCE(stop_on_completion, FALSE);

COMMENT ON COLUMN bot_goals.stop_on_completion IS 'If true, the bot should offer to stop once this goal is achieved (respecting user confirmation).';

