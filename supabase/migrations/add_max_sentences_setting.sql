-- Migration: Add max_sentences_per_message setting to bot_settings
-- This controls how many sentences the AI can send per message

ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS max_sentences_per_message INT DEFAULT 3;

-- Comment for documentation
COMMENT ON COLUMN bot_settings.max_sentences_per_message IS 'Maximum number of sentences the AI can send per message. Default is 3. Set to 0 or NULL for no limit.';



