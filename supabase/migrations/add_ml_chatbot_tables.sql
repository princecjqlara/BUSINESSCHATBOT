-- Migration: Add ML Chatbot Online Learning System Tables
-- This enables the chatbot to learn from user behavior and optimize strategies

-- ============================================================================
-- PART 1: ML CHATBOT SETTINGS (add to bot_settings table)
-- ============================================================================

-- Add enable_ml_chatbot column to bot_settings
ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS enable_ml_chatbot BOOLEAN DEFAULT false;

-- Add AI knowledge base control settings
ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS enable_ai_knowledge_management BOOLEAN DEFAULT false;

-- ============================================================================
-- PART 2: CONVERSATIONAL STRATEGIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name TEXT NOT NULL UNIQUE,
  strategy_description TEXT,
  strategy_type TEXT NOT NULL, -- 'qualification', 'discount', 'recommendation', 'social_proof', 'clarification', etc.
  default_prompt_template TEXT, -- Template for LLM to generate message in this strategy
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

-- ============================================================================
-- PART 3: USER BEHAVIOR EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_behavior_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'message_sent', 'product_click', 'purchase', 'conversation_continue', 'leave', 'no_response'
  event_data JSONB, -- Additional event-specific data
  conversation_id TEXT, -- Link to conversation context
  message_id TEXT, -- Link to specific message if applicable
  strategy_id UUID REFERENCES ml_strategies(id) ON DELETE SET NULL, -- Which strategy was used
  reward_value NUMERIC(10, 2) DEFAULT 0, -- Computed reward for this event
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_behavior_events_sender_id ON ml_behavior_events(sender_id);
CREATE INDEX IF NOT EXISTS idx_behavior_events_lead_id ON ml_behavior_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_behavior_events_strategy_id ON ml_behavior_events(strategy_id);
CREATE INDEX IF NOT EXISTS idx_behavior_events_created_at ON ml_behavior_events(created_at);
CREATE INDEX IF NOT EXISTS idx_behavior_events_event_type ON ml_behavior_events(event_type);

-- ============================================================================
-- PART 4: STRATEGY PERFORMANCE (Learning State)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_strategy_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES ml_strategies(id) ON DELETE CASCADE,
  context_hash TEXT, -- Hash of context features (user type, conversation stage, etc.)
  total_uses INTEGER DEFAULT 0,
  total_reward NUMERIC(10, 2) DEFAULT 0,
  average_reward NUMERIC(10, 4) DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(strategy_id, context_hash)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_strategy_performance_strategy_id ON ml_strategy_performance(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_performance_context_hash ON ml_strategy_performance(context_hash);

-- ============================================================================
-- PART 5: AI KNOWLEDGE BASE CHANGES (Audit Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_knowledge_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_type TEXT NOT NULL, -- 'add', 'update', 'delete'
  entity_type TEXT NOT NULL, -- 'document', 'rule', 'instruction', 'personality'
  entity_id UUID, -- ID of the changed entity (if applicable)
  old_value JSONB, -- Previous value (for updates/deletes) - full snapshot
  new_value JSONB, -- New value (for adds/updates) - full snapshot
  reason TEXT, -- AI's reason for the change
  confidence_score NUMERIC(3, 2), -- AI's confidence (0-1)
  approved BOOLEAN DEFAULT false, -- Whether change was approved (for safety)
  applied BOOLEAN DEFAULT false, -- Whether change was actually applied
  undone BOOLEAN DEFAULT false, -- Whether change was undone by user
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'ai_learning_system',
  model_used TEXT -- Which AI model was used for this change
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_changes_entity_type ON ml_knowledge_changes(entity_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_changes_created_at ON ml_knowledge_changes(created_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_changes_approved ON ml_knowledge_changes(approved);

-- ============================================================================
-- PART 6: CONVERSATION CONTEXT (for strategy selection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_conversation_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  context_features JSONB, -- Encoded context (conversation stage, user type, etc.)
  context_hash TEXT NOT NULL, -- Hash of context for quick lookup
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sender_id, context_hash)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversation_contexts_sender_id ON ml_conversation_contexts(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversation_contexts_lead_id ON ml_conversation_contexts(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversation_contexts_hash ON ml_conversation_contexts(context_hash);

-- ============================================================================
-- PART 7: ENABLE RLS
-- ============================================================================

ALTER TABLE ml_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_behavior_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_strategy_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_knowledge_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_conversation_contexts ENABLE ROW LEVEL SECURITY;

-- Policies (allow all for now - adjust based on your auth setup)
CREATE POLICY "Allow all operations on ml_strategies" ON ml_strategies
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on ml_behavior_events" ON ml_behavior_events
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on ml_strategy_performance" ON ml_strategy_performance
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on ml_knowledge_changes" ON ml_knowledge_changes
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on ml_conversation_contexts" ON ml_conversation_contexts
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 8: HELPER FUNCTIONS
-- ============================================================================

-- Function to update strategy performance
CREATE OR REPLACE FUNCTION update_strategy_performance(
  p_strategy_id UUID,
  p_context_hash TEXT,
  p_reward NUMERIC
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO ml_strategy_performance (strategy_id, context_hash, total_uses, total_reward, average_reward, last_updated)
  VALUES (p_strategy_id, p_context_hash, 1, p_reward, p_reward, NOW())
  ON CONFLICT (strategy_id, context_hash) 
  DO UPDATE SET
    total_uses = ml_strategy_performance.total_uses + 1,
    total_reward = ml_strategy_performance.total_reward + p_reward,
    average_reward = (ml_strategy_performance.total_reward + p_reward) / (ml_strategy_performance.total_uses + 1),
    last_updated = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get top strategies for a context
CREATE OR REPLACE FUNCTION get_top_strategies(
  p_context_hash TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  strategy_id UUID,
  strategy_name TEXT,
  strategy_type TEXT,
  average_reward NUMERIC,
  total_uses INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.strategy_name,
    s.strategy_type,
    COALESCE(sp.average_reward, 0) as average_reward,
    COALESCE(sp.total_uses, 0) as total_uses
  FROM ml_strategies s
  LEFT JOIN ml_strategy_performance sp ON s.id = sp.strategy_id AND sp.context_hash = p_context_hash
  WHERE s.is_active = true
  ORDER BY COALESCE(sp.average_reward, 0) DESC, COALESCE(sp.total_uses, 0) ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

