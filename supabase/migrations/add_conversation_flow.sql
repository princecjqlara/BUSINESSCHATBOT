-- Migration: Add conversation_flow setting to bot_settings
-- This allows users to input and store conversation flow information

ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS conversation_flow TEXT;

-- Comment for documentation
COMMENT ON COLUMN bot_settings.conversation_flow IS 'User-defined conversation flow description or structure for the bot';


