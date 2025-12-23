-- Add AI follow-up aggressiveness setting to bot_settings
-- Run this in Supabase SQL Editor

-- Add aggressiveness column (1-10 scale)
ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS ai_followup_aggressiveness INTEGER DEFAULT 5;

-- Add constraint for valid range
ALTER TABLE bot_settings
ADD CONSTRAINT ai_followup_aggressiveness_range 
CHECK (ai_followup_aggressiveness >= 1 AND ai_followup_aggressiveness <= 10);

-- Update existing row if it has NULL
UPDATE bot_settings 
SET ai_followup_aggressiveness = 5 
WHERE ai_followup_aggressiveness IS NULL;

-- Verify
SELECT 
    enable_ai_autonomous_followup,
    ai_followup_aggressiveness,
    ai_followup_cooldown_hours,
    ai_followup_max_per_lead
FROM bot_settings;
