-- Migration: Add ML Conversion Tracking Tables
-- Tracks conversions and attributes them to messaging strategies

-- ============================================================================
-- PART 1: CONVERSION EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Conversion funnel stages
  conversion_type TEXT NOT NULL, -- 'inquiry', 'lead_capture', 'order_placed', 'payment_completed', 'repeat_purchase', 'referral'
  previous_stage TEXT, -- What stage they came from
  
  -- Value tracking
  conversion_value NUMERIC(12, 2) DEFAULT 0, -- Monetary value if applicable
  order_id TEXT, -- Link to order if applicable
  
  -- Timing
  time_to_convert_minutes INTEGER, -- How long from first contact
  messages_before_convert INTEGER, -- Number of messages exchanged
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversions_sender_id ON ml_conversions(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversions_lead_id ON ml_conversions(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversions_type ON ml_conversions(conversion_type);
CREATE INDEX IF NOT EXISTS idx_conversions_created_at ON ml_conversions(created_at);

-- ============================================================================
-- PART 2: CONVERSION ATTRIBUTION TABLE
-- Links conversions to the strategies that contributed
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_conversion_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id UUID REFERENCES ml_conversions(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES ml_strategies(id) ON DELETE SET NULL,
  
  -- Attribution weight (for multi-touch attribution)
  attribution_weight NUMERIC(5, 4) DEFAULT 1.0, -- 0.0 to 1.0
  attribution_model TEXT DEFAULT 'last_touch', -- 'last_touch', 'first_touch', 'linear', 'time_decay'
  
  -- Context when strategy was used
  context_hash TEXT,
  message_position INTEGER, -- Which message in the conversation
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_attribution_conversion_id ON ml_conversion_attribution(conversion_id);
CREATE INDEX IF NOT EXISTS idx_attribution_strategy_id ON ml_conversion_attribution(strategy_id);

-- ============================================================================
-- PART 3: DAILY CONVERSION METRICS (Aggregated for fast queries)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_conversion_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  
  -- Funnel counts
  total_conversations INTEGER DEFAULT 0,
  inquiries INTEGER DEFAULT 0,
  leads_captured INTEGER DEFAULT 0,
  orders_placed INTEGER DEFAULT 0,
  payments_completed INTEGER DEFAULT 0,
  repeat_purchases INTEGER DEFAULT 0,
  
  -- Conversion rates (stored as decimals 0.0 to 1.0)
  inquiry_to_lead_rate NUMERIC(5, 4) DEFAULT 0,
  lead_to_order_rate NUMERIC(5, 4) DEFAULT 0,
  order_to_payment_rate NUMERIC(5, 4) DEFAULT 0,
  overall_conversion_rate NUMERIC(5, 4) DEFAULT 0,
  
  -- Revenue
  total_revenue NUMERIC(12, 2) DEFAULT 0,
  average_order_value NUMERIC(12, 2) DEFAULT 0,
  
  -- Efficiency
  avg_messages_to_convert NUMERIC(6, 2) DEFAULT 0,
  avg_time_to_convert_hours NUMERIC(8, 2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(date)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_metrics_daily_date ON ml_conversion_metrics_daily(date);

-- ============================================================================
-- PART 4: ENABLE RLS
-- ============================================================================

ALTER TABLE ml_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_conversion_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_conversion_metrics_daily ENABLE ROW LEVEL SECURITY;

-- Policies (allow all for now) - Drop first to make idempotent
DROP POLICY IF EXISTS "Allow all operations on ml_conversions" ON ml_conversions;
CREATE POLICY "Allow all operations on ml_conversions" ON ml_conversions
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on ml_conversion_attribution" ON ml_conversion_attribution;
CREATE POLICY "Allow all operations on ml_conversion_attribution" ON ml_conversion_attribution
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on ml_conversion_metrics_daily" ON ml_conversion_metrics_daily;
CREATE POLICY "Allow all operations on ml_conversion_metrics_daily" ON ml_conversion_metrics_daily
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 5: HELPER FUNCTIONS
-- ============================================================================

-- Function to record a conversion and update metrics
CREATE OR REPLACE FUNCTION record_conversion(
  p_sender_id TEXT,
  p_lead_id UUID,
  p_conversion_type TEXT,
  p_value NUMERIC DEFAULT 0,
  p_order_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_conversion_id UUID;
  v_first_message TIMESTAMPTZ;
  v_message_count INTEGER;
  v_time_to_convert INTEGER;
BEGIN
  -- Get first message time and count
  SELECT MIN(created_at), COUNT(*)
  INTO v_first_message, v_message_count
  FROM conversations
  WHERE sender_id = p_sender_id;
  
  -- Calculate time to convert in minutes
  v_time_to_convert := EXTRACT(EPOCH FROM (NOW() - v_first_message)) / 60;
  
  -- Insert conversion
  INSERT INTO ml_conversions (
    sender_id, lead_id, conversion_type, conversion_value, 
    order_id, time_to_convert_minutes, messages_before_convert, metadata
  )
  VALUES (
    p_sender_id, p_lead_id, p_conversion_type, p_value,
    p_order_id, v_time_to_convert, v_message_count, p_metadata
  )
  RETURNING id INTO v_conversion_id;
  
  RETURN v_conversion_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get strategy conversion rates
CREATE OR REPLACE FUNCTION get_strategy_conversion_rates(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  strategy_id UUID,
  strategy_name TEXT,
  total_uses INTEGER,
  conversions INTEGER,
  conversion_rate NUMERIC,
  total_revenue NUMERIC,
  avg_reward NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as strategy_id,
    s.strategy_name,
    COALESCE(COUNT(DISTINCT be.id)::INTEGER, 0) as total_uses,
    COALESCE(COUNT(DISTINCT ca.conversion_id)::INTEGER, 0) as conversions,
    CASE 
      WHEN COUNT(DISTINCT be.id) > 0 
      THEN (COUNT(DISTINCT ca.conversion_id)::NUMERIC / COUNT(DISTINCT be.id)::NUMERIC)
      ELSE 0 
    END as conversion_rate,
    COALESCE(SUM(c.conversion_value), 0) as total_revenue,
    COALESCE(AVG(sp.average_reward), 0) as avg_reward
  FROM ml_strategies s
  LEFT JOIN ml_behavior_events be ON be.strategy_id = s.id 
    AND be.created_at > NOW() - (p_days || ' days')::INTERVAL
  LEFT JOIN ml_conversion_attribution ca ON ca.strategy_id = s.id
  LEFT JOIN ml_conversions c ON c.id = ca.conversion_id
    AND c.created_at > NOW() - (p_days || ' days')::INTERVAL
  LEFT JOIN ml_strategy_performance sp ON sp.strategy_id = s.id
  WHERE s.is_active = true
  GROUP BY s.id, s.strategy_name
  ORDER BY conversion_rate DESC, total_uses DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to update daily metrics
CREATE OR REPLACE FUNCTION update_daily_conversion_metrics(p_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID AS $$
DECLARE
  v_total_convos INTEGER;
  v_inquiries INTEGER;
  v_leads INTEGER;
  v_orders INTEGER;
  v_payments INTEGER;
  v_repeats INTEGER;
  v_revenue NUMERIC;
BEGIN
  -- Count conversations for the day
  SELECT COUNT(DISTINCT sender_id) INTO v_total_convos
  FROM conversations
  WHERE DATE(created_at) = p_date;
  
  -- Count conversion types
  SELECT 
    COUNT(*) FILTER (WHERE conversion_type = 'inquiry'),
    COUNT(*) FILTER (WHERE conversion_type = 'lead_capture'),
    COUNT(*) FILTER (WHERE conversion_type = 'order_placed'),
    COUNT(*) FILTER (WHERE conversion_type = 'payment_completed'),
    COUNT(*) FILTER (WHERE conversion_type = 'repeat_purchase'),
    COALESCE(SUM(conversion_value), 0)
  INTO v_inquiries, v_leads, v_orders, v_payments, v_repeats, v_revenue
  FROM ml_conversions
  WHERE DATE(created_at) = p_date;
  
  -- Upsert daily metrics
  INSERT INTO ml_conversion_metrics_daily (
    date, total_conversations, inquiries, leads_captured, 
    orders_placed, payments_completed, repeat_purchases,
    inquiry_to_lead_rate, lead_to_order_rate, order_to_payment_rate,
    overall_conversion_rate, total_revenue, average_order_value,
    updated_at
  )
  VALUES (
    p_date, v_total_convos, v_inquiries, v_leads, 
    v_orders, v_payments, v_repeats,
    CASE WHEN v_inquiries > 0 THEN v_leads::NUMERIC / v_inquiries ELSE 0 END,
    CASE WHEN v_leads > 0 THEN v_orders::NUMERIC / v_leads ELSE 0 END,
    CASE WHEN v_orders > 0 THEN v_payments::NUMERIC / v_orders ELSE 0 END,
    CASE WHEN v_total_convos > 0 THEN v_payments::NUMERIC / v_total_convos ELSE 0 END,
    v_revenue,
    CASE WHEN v_payments > 0 THEN v_revenue / v_payments ELSE 0 END,
    NOW()
  )
  ON CONFLICT (date) DO UPDATE SET
    total_conversations = EXCLUDED.total_conversations,
    inquiries = EXCLUDED.inquiries,
    leads_captured = EXCLUDED.leads_captured,
    orders_placed = EXCLUDED.orders_placed,
    payments_completed = EXCLUDED.payments_completed,
    repeat_purchases = EXCLUDED.repeat_purchases,
    inquiry_to_lead_rate = EXCLUDED.inquiry_to_lead_rate,
    lead_to_order_rate = EXCLUDED.lead_to_order_rate,
    order_to_payment_rate = EXCLUDED.order_to_payment_rate,
    overall_conversion_rate = EXCLUDED.overall_conversion_rate,
    total_revenue = EXCLUDED.total_revenue,
    average_order_value = EXCLUDED.average_order_value,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
