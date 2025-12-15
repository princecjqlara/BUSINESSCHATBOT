-- Migration: Add NLP Analysis Tables
-- Stores NLP analysis results for user messages

-- ============================================================================
-- NLP MESSAGE ANALYSIS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS nlp_message_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  message_id UUID,
  
  -- Intent Recognition
  intent TEXT NOT NULL, -- 'order', 'inquiry', 'support', 'greeting', etc.
  intent_confidence NUMERIC(4, 3) DEFAULT 0, -- 0.000 to 1.000
  sub_intent TEXT, -- More specific intent
  
  -- Sentiment Analysis
  sentiment TEXT NOT NULL DEFAULT 'neutral', -- 'positive', 'neutral', 'negative'
  sentiment_confidence NUMERIC(4, 3) DEFAULT 0,
  emotional_tone TEXT, -- 'frustrated', 'excited', 'confused', etc.
  
  -- Entity Extraction (stored as JSONB for flexibility)
  entities JSONB DEFAULT '{}',
  -- entities structure: {
  --   dates: [{value, normalized}],
  --   times: [{value, normalized}],
  --   phoneNumbers: [],
  --   emails: [],
  --   names: [],
  --   locations: [],
  --   quantities: [{value, unit}],
  --   amounts: [{value, currency}]
  -- }
  
  -- Original message (for reference)
  raw_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_nlp_analysis_sender_id ON nlp_message_analysis(sender_id);
CREATE INDEX IF NOT EXISTS idx_nlp_analysis_intent ON nlp_message_analysis(intent);
CREATE INDEX IF NOT EXISTS idx_nlp_analysis_sentiment ON nlp_message_analysis(sentiment);
CREATE INDEX IF NOT EXISTS idx_nlp_analysis_created_at ON nlp_message_analysis(created_at);

-- ============================================================================
-- NLP INTENT SUMMARY (Aggregated for fast queries)
-- ============================================================================

CREATE TABLE IF NOT EXISTS nlp_intent_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  
  -- Intent counts
  total_messages INTEGER DEFAULT 0,
  order_intents INTEGER DEFAULT 0,
  inquiry_intents INTEGER DEFAULT 0,
  support_intents INTEGER DEFAULT 0,
  greeting_intents INTEGER DEFAULT 0,
  payment_intents INTEGER DEFAULT 0,
  unknown_intents INTEGER DEFAULT 0,
  
  -- Sentiment counts
  positive_sentiment INTEGER DEFAULT 0,
  neutral_sentiment INTEGER DEFAULT 0,
  negative_sentiment INTEGER DEFAULT 0,
  
  -- Average confidence scores
  avg_intent_confidence NUMERIC(4, 3) DEFAULT 0,
  avg_sentiment_confidence NUMERIC(4, 3) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(date)
);

CREATE INDEX IF NOT EXISTS idx_nlp_summary_date ON nlp_intent_summary(date);

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE nlp_message_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE nlp_intent_summary ENABLE ROW LEVEL SECURITY;

-- Policies (allow all for now)
DROP POLICY IF EXISTS "Allow all operations on nlp_message_analysis" ON nlp_message_analysis;
CREATE POLICY "Allow all operations on nlp_message_analysis" ON nlp_message_analysis
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on nlp_intent_summary" ON nlp_intent_summary;
CREATE POLICY "Allow all operations on nlp_intent_summary" ON nlp_intent_summary
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTION: Update daily NLP summary
-- ============================================================================

CREATE OR REPLACE FUNCTION update_nlp_daily_summary(p_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID AS $$
DECLARE
  v_total INTEGER;
  v_order INTEGER;
  v_inquiry INTEGER;
  v_support INTEGER;
  v_greeting INTEGER;
  v_payment INTEGER;
  v_unknown INTEGER;
  v_positive INTEGER;
  v_neutral INTEGER;
  v_negative INTEGER;
  v_avg_intent_conf NUMERIC;
  v_avg_sentiment_conf NUMERIC;
BEGIN
  -- Count intents for the day
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE intent = 'order'),
    COUNT(*) FILTER (WHERE intent = 'inquiry'),
    COUNT(*) FILTER (WHERE intent = 'support'),
    COUNT(*) FILTER (WHERE intent = 'greeting'),
    COUNT(*) FILTER (WHERE intent = 'payment'),
    COUNT(*) FILTER (WHERE intent = 'unknown'),
    COUNT(*) FILTER (WHERE sentiment = 'positive'),
    COUNT(*) FILTER (WHERE sentiment = 'neutral'),
    COUNT(*) FILTER (WHERE sentiment = 'negative'),
    COALESCE(AVG(intent_confidence), 0),
    COALESCE(AVG(sentiment_confidence), 0)
  INTO v_total, v_order, v_inquiry, v_support, v_greeting, v_payment, v_unknown,
       v_positive, v_neutral, v_negative, v_avg_intent_conf, v_avg_sentiment_conf
  FROM nlp_message_analysis
  WHERE DATE(created_at) = p_date;
  
  -- Upsert daily summary
  INSERT INTO nlp_intent_summary (
    date, total_messages, order_intents, inquiry_intents, support_intents,
    greeting_intents, payment_intents, unknown_intents,
    positive_sentiment, neutral_sentiment, negative_sentiment,
    avg_intent_confidence, avg_sentiment_confidence, updated_at
  )
  VALUES (
    p_date, v_total, v_order, v_inquiry, v_support,
    v_greeting, v_payment, v_unknown,
    v_positive, v_neutral, v_negative,
    v_avg_intent_conf, v_avg_sentiment_conf, NOW()
  )
  ON CONFLICT (date) DO UPDATE SET
    total_messages = EXCLUDED.total_messages,
    order_intents = EXCLUDED.order_intents,
    inquiry_intents = EXCLUDED.inquiry_intents,
    support_intents = EXCLUDED.support_intents,
    greeting_intents = EXCLUDED.greeting_intents,
    payment_intents = EXCLUDED.payment_intents,
    unknown_intents = EXCLUDED.unknown_intents,
    positive_sentiment = EXCLUDED.positive_sentiment,
    neutral_sentiment = EXCLUDED.neutral_sentiment,
    negative_sentiment = EXCLUDED.negative_sentiment,
    avg_intent_confidence = EXCLUDED.avg_intent_confidence,
    avg_sentiment_confidence = EXCLUDED.avg_sentiment_confidence,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
