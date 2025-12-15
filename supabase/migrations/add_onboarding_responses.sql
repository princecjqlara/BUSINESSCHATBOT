-- Migration: Track onboarding responses for auto-setup
-- Stores the latest answers provided in the onboarding wizard
-- so the AI setup endpoint can reuse them and support auditing.

CREATE TABLE IF NOT EXISTS onboarding_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_name TEXT,
    user_email TEXT,
    company_name TEXT,
    chatbot_name TEXT,
    goal_selections TEXT[],
    knowledge_sources TEXT[],
    conversation_flow_choice TEXT,
    conversation_flow_detail TEXT,
    tone_preferences TEXT[],
    style_preferences TEXT[],
    bot_rules TEXT[],
    additional_requests TEXT,
    raw_answers JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE onboarding_responses ENABLE ROW LEVEL SECURITY;

-- Allow all operations (single-tenant app)
DROP POLICY IF EXISTS "Allow all operations on onboarding_responses" ON onboarding_responses;
CREATE POLICY "Allow all operations on onboarding_responses" ON onboarding_responses
    FOR ALL USING (true) WITH CHECK (true);

-- Keep updated_at in sync
DROP TRIGGER IF EXISTS update_onboarding_responses_updated_at ON onboarding_responses;
CREATE TRIGGER update_onboarding_responses_updated_at
    BEFORE UPDATE ON onboarding_responses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE onboarding_responses IS 'Stores onboarding wizard answers so AI setup can run incrementally.';
COMMENT ON COLUMN onboarding_responses.raw_answers IS 'Full JSON snapshot of the onboarding payload sent from the UI.';
