-- Migration: Add best contact times feature to leads table
-- This allows the chatbot to schedule follow-ups based on optimal contact times

-- Add best_contact_times field to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS best_contact_times JSONB DEFAULT NULL;

-- Add index for querying leads with best contact times
CREATE INDEX IF NOT EXISTS idx_leads_best_contact_times ON leads(best_contact_times) 
WHERE best_contact_times IS NOT NULL;

-- Add enable_best_time_contact field to bot_settings for global toggle
ALTER TABLE bot_settings
ADD COLUMN IF NOT EXISTS enable_best_time_contact BOOLEAN DEFAULT false;

-- Add enable_best_time_contact field to leads for per-lead override
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS enable_best_time_contact BOOLEAN DEFAULT NULL;

-- Comment for documentation
COMMENT ON COLUMN leads.best_contact_times IS 'Stores best contact times with day of week, time ranges, and confidence scores. Format: {"bestContactTimes": [{"dayOfWeek": "Monday", "timeRange": "9:00 AM - 11:00 AM", "confidence": 85}], "computedAt": "2025-01-15T10:30:00.000Z", "timezone": "Asia/Manila"}';
COMMENT ON COLUMN bot_settings.enable_best_time_contact IS 'Global toggle to enable/disable best time to contact feature for chatbot follow-ups';
COMMENT ON COLUMN leads.enable_best_time_contact IS 'Per-lead override for best time to contact. NULL means use global setting, true/false overrides global setting';

