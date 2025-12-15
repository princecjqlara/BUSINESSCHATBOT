-- Toggle to enable/disable multi-model chatbot routing
-- Run this in Supabase SQL Editor

ALTER TABLE bot_settings
ADD COLUMN IF NOT EXISTS enable_multi_model_chatbot BOOLEAN DEFAULT TRUE;

-- Backfill existing rows
UPDATE bot_settings
SET enable_multi_model_chatbot = TRUE
WHERE enable_multi_model_chatbot IS NULL;
