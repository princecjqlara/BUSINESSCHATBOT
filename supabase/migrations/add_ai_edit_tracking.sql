-- Migration: Add AI edit tracking to knowledge base tables
-- Run this after add_ml_chatbot_tables.sql

-- Add AI edit tracking to documents table
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS edited_by_ai BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_edit_change_id UUID REFERENCES ml_knowledge_changes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_ai_edit_at TIMESTAMPTZ;

-- Add AI edit tracking to bot_rules table
ALTER TABLE bot_rules 
ADD COLUMN IF NOT EXISTS edited_by_ai BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_edit_change_id UUID REFERENCES ml_knowledge_changes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_ai_edit_at TIMESTAMPTZ;

-- Create index for quick lookup of AI-edited items
CREATE INDEX IF NOT EXISTS idx_documents_ai_edited ON documents(edited_by_ai) WHERE edited_by_ai = true;
CREATE INDEX IF NOT EXISTS idx_bot_rules_ai_edited ON bot_rules(edited_by_ai) WHERE edited_by_ai = true;

