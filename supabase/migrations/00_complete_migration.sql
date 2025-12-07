-- ============================================================================
-- COMPLETE MIGRATION SCRIPT FOR APHELION-PHOTON
-- Run this in Supabase SQL Editor to set up all required tables
-- ============================================================================

-- ============================================================================
-- PART 0: UTILITY FUNCTIONS
-- ============================================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- PART 1: DOCUMENTS TABLE (RAG Knowledge Base)
-- ============================================================================

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding VECTOR(1024),  -- nvidia/nv-embedqa-e5-v5 outputs 1024 dimensions
  folder_id UUID,
  category_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policy for documents
CREATE POLICY "Allow all operations on documents" ON documents
  FOR ALL USING (true) WITH CHECK (true);

-- Match documents function for semantic search
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1024),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- PART 2: DOCUMENT FOLDERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_folders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key to documents table (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'documents_folder_id_fkey'
  ) THEN
    ALTER TABLE documents 
      ADD CONSTRAINT documents_folder_id_fkey 
      FOREIGN KEY (folder_id) REFERENCES document_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on document_folders" ON document_folders
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 3: KNOWLEDGE CATEGORIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('general', 'qa')),
  color TEXT DEFAULT 'gray',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key to documents table (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'documents_category_id_fkey'
  ) THEN
    ALTER TABLE documents 
      ADD CONSTRAINT documents_category_id_fkey 
      FOREIGN KEY (category_id) REFERENCES knowledge_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE knowledge_categories ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on knowledge_categories" ON knowledge_categories
  FOR ALL USING (true) WITH CHECK (true);

-- Insert default categories
INSERT INTO knowledge_categories (name, type, color) VALUES
  ('General', 'general', 'gray'),
  ('Pricing', 'general', 'green'),
  ('FAQs', 'qa', 'blue'),
  ('Product Info', 'general', 'purple')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 4: BOT SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_name TEXT DEFAULT 'Assistant',
  bot_tone TEXT DEFAULT 'helpful and professional',
  facebook_verify_token TEXT DEFAULT 'TEST_TOKEN',
  facebook_page_access_token TEXT,
  human_takeover_timeout_minutes INT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO bot_settings (bot_name, bot_tone, facebook_verify_token) 
VALUES ('Assistant', 'helpful and professional', 'TEST_TOKEN')
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on bot_settings" ON bot_settings
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 5: BOT RULES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  priority INT DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE bot_rules ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on bot_rules" ON bot_rules
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_bot_rules_updated_at ON bot_rules;
CREATE TRIGGER update_bot_rules_updated_at
  BEFORE UPDATE ON bot_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 6: BOT INSTRUCTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructions TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE bot_instructions ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on bot_instructions" ON bot_instructions
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_bot_instructions_updated_at ON bot_instructions;
CREATE TRIGGER update_bot_instructions_updated_at
  BEFORE UPDATE ON bot_instructions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 7: CONVERSATIONS TABLE (Chat History)
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_conversations_sender_id ON conversations(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on conversations" ON conversations
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 8: PIPELINE STAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#64748b',
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default pipeline stages
INSERT INTO pipeline_stages (name, display_order, color, is_default) VALUES
  ('New Lead', 0, '#3b82f6', true),
  ('Interested', 1, '#8b5cf6', false),
  ('Qualified', 2, '#f59e0b', false),
  ('Negotiating', 3, '#10b981', false),
  ('Won', 4, '#22c55e', false),
  ('Lost', 5, '#ef4444', false)
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on pipeline_stages" ON pipeline_stages
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_pipeline_stages_updated_at ON pipeline_stages;
CREATE TRIGGER update_pipeline_stages_updated_at
  BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 9: LEADS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL UNIQUE,
  name TEXT,
  profile_pic TEXT,
  current_stage_id UUID REFERENCES pipeline_stages(id),
  message_count INT DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_analyzed_at TIMESTAMPTZ,
  ai_classification_reason TEXT,
  bot_disabled BOOLEAN DEFAULT false,
  bot_disabled_reason TEXT,
  receipt_image_url TEXT,
  receipt_detected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_sender_id ON leads(sender_id);
CREATE INDEX IF NOT EXISTS idx_leads_current_stage ON leads(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_receipt_detected ON leads(receipt_detected_at) 
  WHERE receipt_detected_at IS NOT NULL;

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on leads" ON leads
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 10: LEAD STAGE HISTORY TABLE (Audit Trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES pipeline_stages(id),
  to_stage_id UUID REFERENCES pipeline_stages(id),
  reason TEXT,
  changed_by TEXT DEFAULT 'ai',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead ON lead_stage_history(lead_id);

-- Enable RLS
ALTER TABLE lead_stage_history ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on lead_stage_history" ON lead_stage_history
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 11: WORKFLOWS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_stage_id UUID REFERENCES pipeline_stages(id),
  workflow_data JSONB NOT NULL DEFAULT '{"nodes": [], "edges": []}'::jsonb,
  is_published BOOLEAN DEFAULT false,
  apply_to_existing BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflows_trigger_stage ON workflows(trigger_stage_id);
CREATE INDEX IF NOT EXISTS idx_workflows_published ON workflows(is_published);

-- Enable RLS
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on workflows" ON workflows
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_workflows_updated_at ON workflows;
CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comment for documentation
COMMENT ON COLUMN workflows.apply_to_existing IS 'When true, publishing this workflow will trigger it for all leads currently in the trigger stage';

-- ============================================================================
-- PART 12: WORKFLOW EXECUTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  current_node_id TEXT,
  execution_data JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'stopped')),
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_lead ON workflow_executions(lead_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_scheduled ON workflow_executions(scheduled_for)
  WHERE status = 'pending' AND scheduled_for IS NOT NULL;

-- Enable RLS
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on workflow_executions" ON workflow_executions
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_workflow_executions_updated_at ON workflow_executions;
CREATE TRIGGER update_workflow_executions_updated_at
  BEFORE UPDATE ON workflow_executions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 13: HUMAN TAKEOVER SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS human_takeover_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_sender_id TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_human_message_at TIMESTAMPTZ DEFAULT NOW(),
  timeout_minutes INT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_human_takeover_sender ON human_takeover_sessions(lead_sender_id);

-- Enable RLS
ALTER TABLE human_takeover_sessions ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on human_takeover_sessions" ON human_takeover_sessions
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 14: CONNECTED PAGES TABLE (Facebook OAuth)
-- ============================================================================

CREATE TABLE IF NOT EXISTS connected_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT NOT NULL UNIQUE,
  page_name TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  user_access_token TEXT,
  is_active BOOLEAN DEFAULT true,
  webhook_subscribed BOOLEAN DEFAULT false,
  profile_pic TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connected_pages_page_id ON connected_pages(page_id);
CREATE INDEX IF NOT EXISTS idx_connected_pages_is_active ON connected_pages(is_active);

-- Enable RLS
ALTER TABLE connected_pages ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Allow all operations on connected_pages" ON connected_pages
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_connected_pages_updated_at ON connected_pages;
CREATE TRIGGER update_connected_pages_updated_at
  BEFORE UPDATE ON connected_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

-- This script creates all 14 tables required for Aphelion-Photon:
-- 1. documents - RAG knowledge base with vector embeddings
-- 2. document_folders - Folder organization for documents
-- 3. knowledge_categories - Category system for knowledge base
-- 4. bot_settings - Bot configuration (name, tone, tokens)
-- 5. bot_rules - Custom rules for the chatbot
-- 6. bot_instructions - Extended bot instructions
-- 7. conversations - Chat history by sender
-- 8. pipeline_stages - CRM pipeline stages
-- 9. leads - Lead management
-- 10. lead_stage_history - Audit trail for lead movements
-- 11. workflows - Automation workflows
-- 12. workflow_executions - Workflow execution tracking
-- 13. human_takeover_sessions - Human agent takeover tracking
-- 14. connected_pages - Facebook OAuth connected pages
