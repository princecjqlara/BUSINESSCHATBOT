-- ML Sandbox Tables Migration
-- Creates sandbox versions of production tables for safe AI experimentation

-- ============================================================================
-- ML SANDBOX BOT SETTINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS ml_sandbox_bot_settings (
    id SERIAL PRIMARY KEY,
    bot_name TEXT DEFAULT 'Sales Assistant',
    bot_tone TEXT DEFAULT 'friendly and professional',
    bot_instructions TEXT,
    conversation_flow JSONB,
    max_sentences INTEGER DEFAULT 3,
    enable_ml_chatbot BOOLEAN DEFAULT false,
    enable_ai_knowledge_management BOOLEAN DEFAULT false,
    enable_multi_model_chatbot BOOLEAN DEFAULT false,
    enable_ai_autonomous_followup BOOLEAN DEFAULT false,
    default_ai_model TEXT,
    synced_from_production_at TIMESTAMPTZ,
    last_ai_edit_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ML SANDBOX DOCUMENTS (Knowledge Base)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ml_sandbox_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    category_id UUID,
    media_urls TEXT[],
    edited_by_ai BOOLEAN DEFAULT false,
    last_ai_edit_at TIMESTAMPTZ,
    production_id UUID, -- Reference to original production document
    synced_from_production_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ML SANDBOX BOT RULES
-- ============================================================================
CREATE TABLE IF NOT EXISTS ml_sandbox_bot_rules (
    id SERIAL PRIMARY KEY,
    rule TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    priority INTEGER DEFAULT 5,
    enabled BOOLEAN DEFAULT true,
    edited_by_ai BOOLEAN DEFAULT false,
    last_ai_edit_at TIMESTAMPTZ,
    production_id INTEGER, -- Reference to original production rule
    synced_from_production_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ML SANDBOX BOT GOALS
-- ============================================================================
CREATE TABLE IF NOT EXISTS ml_sandbox_bot_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_name TEXT NOT NULL,
    goal_description TEXT,
    priority_order INTEGER,
    is_active BOOLEAN DEFAULT true,
    is_optional BOOLEAN DEFAULT false,
    stop_on_completion BOOLEAN DEFAULT false,
    production_id UUID, -- Reference to original production goal
    synced_from_production_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ML SANDBOX KNOWLEDGE CATEGORIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS ml_sandbox_knowledge_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT DEFAULT 'general',
    color TEXT DEFAULT 'gray',
    production_id UUID, -- Reference to original production category
    synced_from_production_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ML SANDBOX SYNC LOG
-- Tracks when sandbox was synced from production
-- ============================================================================
CREATE TABLE IF NOT EXISTS ml_sandbox_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_type TEXT NOT NULL, -- 'full', 'settings', 'documents', 'rules', 'goals', 'categories'
    items_synced INTEGER DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Add sandbox_mode column to ml_knowledge_changes to track which changes are sandbox
-- ============================================================================
ALTER TABLE ml_knowledge_changes 
ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT false;

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ml_sandbox_documents_category ON ml_sandbox_documents(category_id);
CREATE INDEX IF NOT EXISTS idx_ml_sandbox_documents_production ON ml_sandbox_documents(production_id);
CREATE INDEX IF NOT EXISTS idx_ml_sandbox_bot_rules_enabled ON ml_sandbox_bot_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_ml_sandbox_bot_goals_active ON ml_sandbox_bot_goals(is_active);
CREATE INDEX IF NOT EXISTS idx_ml_knowledge_changes_sandbox ON ml_knowledge_changes(is_sandbox);

-- ============================================================================
-- Initialize sandbox with empty settings row if not exists
-- ============================================================================
INSERT INTO ml_sandbox_bot_settings (bot_name, bot_tone)
SELECT 'Sales Assistant', 'friendly and professional'
WHERE NOT EXISTS (SELECT 1 FROM ml_sandbox_bot_settings);
