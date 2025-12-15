-- Migration: Create scheduled messages table for best time to contact follow-ups
-- This table queues messages to be sent at optimal contact times

CREATE TABLE IF NOT EXISTS scheduled_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL,
    message_text TEXT NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    page_id TEXT, -- Facebook page ID for sending
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional data like message type, tags, etc.
    CONSTRAINT scheduled_messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON scheduled_messages(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_for ON scheduled_messages(scheduled_for) 
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_lead_id ON scheduled_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_sender_id ON scheduled_messages(sender_id);

-- Enable RLS
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Policy (allow all for now - customize based on your auth)
CREATE POLICY "Allow all operations on scheduled_messages" ON scheduled_messages
    FOR ALL USING (true) WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE scheduled_messages IS 'Stores messages scheduled to be sent at best contact times. Messages are processed by a cron job that checks for pending messages ready to send.';
COMMENT ON COLUMN scheduled_messages.status IS 'pending: waiting to be sent, sent: successfully sent, cancelled: manually cancelled, failed: failed after max retries';
COMMENT ON COLUMN scheduled_messages.metadata IS 'JSON object storing additional message data like messaging_type, tag, etc.';

