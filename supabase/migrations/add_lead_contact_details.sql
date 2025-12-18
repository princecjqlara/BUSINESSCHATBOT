-- Migration: Add detailed contact information fields to leads table
-- This stores business and contact details that leads provide during conversations

-- Add business and contact detail fields
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS page_name TEXT,
ADD COLUMN IF NOT EXISTS page_link TEXT,
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS decision_maker_name TEXT,
ADD COLUMN IF NOT EXISTS decision_maker_position TEXT,
ADD COLUMN IF NOT EXISTS additional_contact_info JSONB DEFAULT NULL;

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_leads_business_name ON leads(business_name) 
WHERE business_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_decision_maker ON leads(decision_maker_name) 
WHERE decision_maker_name IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN leads.page_name IS 'Name of the Facebook page or business page the lead came from';
COMMENT ON COLUMN leads.page_link IS 'URL/link to the Facebook page or business page';
COMMENT ON COLUMN leads.business_name IS 'Name of the business the lead represents';
COMMENT ON COLUMN leads.decision_maker_name IS 'Name of the decision maker or key contact person';
COMMENT ON COLUMN leads.decision_maker_position IS 'Position/title of the decision maker in the business';
COMMENT ON COLUMN leads.additional_contact_info IS 'Additional contact information in JSON format (e.g., {"address": "...", "website": "...", "industry": "..."})';






