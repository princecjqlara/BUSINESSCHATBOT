-- ============================================================================
-- COMPLETE RECOVERY SCRIPT
-- Run this in Supabase SQL Editor if you've lost all data and functions
-- ============================================================================

-- Step 1: Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 2: Create utility function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Run the complete migration
-- This file includes all core tables from 00_complete_migration.sql
-- Run that file first, then continue with additional migrations below

-- ============================================================================
-- ADDITIONAL TABLES (if not in main migration)
-- ============================================================================

-- ML Chatbot Tables
CREATE TABLE IF NOT EXISTS ml_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name TEXT NOT NULL UNIQUE,
  strategy_description TEXT,
  strategy_type TEXT NOT NULL,
  default_prompt_template TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default strategies
INSERT INTO ml_strategies (strategy_name, strategy_description, strategy_type, default_prompt_template) VALUES
  ('Ask Qualification Questions', 'Ask questions to understand customer needs', 'qualification', 'Ask a helpful question to understand what the customer is looking for.'),
  ('Offer Discount', 'Offer a special discount or promotion', 'discount', 'Offer a special discount or promotion that might interest the customer.'),
  ('Recommend Product', 'Recommend a specific product based on context', 'recommendation', 'Recommend a relevant product that matches the customer''s needs.'),
  ('Provide Social Proof', 'Share testimonials or success stories', 'social_proof', 'Share a relevant testimonial or success story to build trust.'),
  ('Ask Clarifying Questions', 'Ask for more details to better understand the request', 'clarification', 'Ask a clarifying question to better understand what the customer needs.'),
  ('Provide Information', 'Provide helpful information about products or services', 'information', 'Provide clear and helpful information about the topic.'),
  ('Create Urgency', 'Create a sense of urgency or scarcity', 'urgency', 'Create appropriate urgency while being honest and helpful.')
ON CONFLICT (strategy_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS ml_behavior_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  conversation_id TEXT,
  message_id TEXT,
  strategy_id UUID REFERENCES ml_strategies(id) ON DELETE SET NULL,
  reward_value NUMERIC(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ml_strategy_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES ml_strategies(id) ON DELETE CASCADE,
  context_hash TEXT,
  total_uses INTEGER DEFAULT 0,
  total_rewards NUMERIC(10, 2) DEFAULT 0,
  average_reward NUMERIC(10, 2) DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(strategy_id, context_hash)
);

CREATE TABLE IF NOT EXISTS ml_knowledge_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  confidence_score NUMERIC(3, 2),
  approved BOOLEAN DEFAULT false,
  applied BOOLEAN DEFAULT false,
  undone BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'ai_learning_system',
  model_used TEXT
);

CREATE TABLE IF NOT EXISTS ml_conversation_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  context_features JSONB,
  context_hash TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sender_id, context_hash)
);

-- Message Ratings
CREATE TABLE IF NOT EXISTS message_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  message_index INT NOT NULL,
  user_message TEXT,
  bot_message TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('like', 'dislike', 'regenerate')),
  conversation_context JSONB,
  improvement_applied BOOLEAN DEFAULT FALSE,
  improvement_applied_at TIMESTAMPTZ,
  modified_documents TEXT[],
  modified_rules TEXT[],
  modified_instructions BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Edit Tracking (add columns to existing tables)
DO $$ 
BEGIN
  -- Add to documents if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='documents' AND column_name='edited_by_ai') THEN
    ALTER TABLE documents ADD COLUMN edited_by_ai BOOLEAN DEFAULT false;
    ALTER TABLE documents ADD COLUMN edited_by_ml_ai BOOLEAN DEFAULT false;
    ALTER TABLE documents ADD COLUMN last_ai_edit_at TIMESTAMPTZ;
    ALTER TABLE documents ADD COLUMN ai_edit_change_id UUID;
  END IF;

  -- Add to bot_rules if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='bot_rules' AND column_name='edited_by_ai') THEN
    ALTER TABLE bot_rules ADD COLUMN edited_by_ai BOOLEAN DEFAULT false;
    ALTER TABLE bot_rules ADD COLUMN edited_by_ml_ai BOOLEAN DEFAULT false;
    ALTER TABLE bot_rules ADD COLUMN last_ai_edit_at TIMESTAMPTZ;
  END IF;

  -- Add to bot_instructions if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='bot_instructions' AND column_name='edited_by_ai') THEN
    ALTER TABLE bot_instructions ADD COLUMN edited_by_ai BOOLEAN DEFAULT false;
    ALTER TABLE bot_instructions ADD COLUMN last_ai_edit_at TIMESTAMPTZ;
  END IF;

  -- Add to bot_settings if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='bot_settings' AND column_name='enable_ml_chatbot') THEN
    ALTER TABLE bot_settings ADD COLUMN enable_ml_chatbot BOOLEAN DEFAULT false;
    ALTER TABLE bot_settings ADD COLUMN enable_ai_knowledge_management BOOLEAN DEFAULT false;
    ALTER TABLE bot_settings ADD COLUMN max_sentences_per_message INT;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_message_ratings_session_id ON message_ratings(session_id);
CREATE INDEX IF NOT EXISTS idx_behavior_events_sender_id ON ml_behavior_events(sender_id);
CREATE INDEX IF NOT EXISTS idx_behavior_events_lead_id ON ml_behavior_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_behavior_events_strategy_id ON ml_behavior_events(strategy_id);
CREATE INDEX IF NOT EXISTS idx_conversation_contexts_sender_id ON ml_conversation_contexts(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversation_contexts_lead_id ON ml_conversation_contexts(lead_id);
CREATE INDEX IF NOT EXISTS idx_ml_knowledge_changes_entity ON ml_knowledge_changes(entity_type, entity_id);

-- Enable RLS on new tables
ALTER TABLE ml_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_behavior_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_strategy_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_knowledge_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_conversation_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_ratings ENABLE ROW LEVEL SECURITY;

-- Create policies (drop first if they exist to avoid conflicts)
DROP POLICY IF EXISTS "Allow all on ml_strategies" ON ml_strategies;
CREATE POLICY "Allow all on ml_strategies" ON ml_strategies FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on ml_behavior_events" ON ml_behavior_events;
CREATE POLICY "Allow all on ml_behavior_events" ON ml_behavior_events FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on ml_strategy_performance" ON ml_strategy_performance;
CREATE POLICY "Allow all on ml_strategy_performance" ON ml_strategy_performance FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on ml_knowledge_changes" ON ml_knowledge_changes;
CREATE POLICY "Allow all on ml_knowledge_changes" ON ml_knowledge_changes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on ml_conversation_contexts" ON ml_conversation_contexts;
CREATE POLICY "Allow all on ml_conversation_contexts" ON ml_conversation_contexts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on message_ratings" ON message_ratings;
CREATE POLICY "Allow all on message_ratings" ON message_ratings FOR ALL USING (true) WITH CHECK (true);

-- Insert default bot settings if not exists
INSERT INTO bot_settings (bot_name, bot_tone, facebook_verify_token)
VALUES ('Assistant', 'helpful and professional', 'TEST_TOKEN')
ON CONFLICT DO NOTHING;

-- Verify tables were created
SELECT 
    'Recovery Complete' AS status,
    COUNT(*) AS tables_created
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'documents', 'bot_settings', 'bot_rules', 'bot_instructions',
    'ml_strategies', 'ml_behavior_events', 'ml_strategy_performance',
    'ml_knowledge_changes', 'message_ratings'
  );

