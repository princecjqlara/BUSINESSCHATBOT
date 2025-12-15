-- Migration: Add default_ai_model column to bot_settings table
-- Run this in Supabase SQL Editor

-- Add the default_ai_model column
ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS default_ai_model TEXT DEFAULT 'deepseek-ai/deepseek-v3.1';

-- Update existing rows to have the default value
UPDATE bot_settings 
SET default_ai_model = 'deepseek-ai/deepseek-v3.1' 
WHERE default_ai_model IS NULL;
