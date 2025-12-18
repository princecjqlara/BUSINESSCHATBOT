-- ============================================================================
-- RESTORE DEFAULT DATA SCRIPT
-- Run this in Supabase SQL Editor to restore default categories and settings
-- ============================================================================

-- Step 1: Ensure default knowledge categories exist
INSERT INTO knowledge_categories (name, type, color) VALUES
    ('General', 'general', 'gray'),
    ('Pricing', 'general', 'green'),
    ('FAQs', 'qa', 'blue'),
    ('Product Info', 'general', 'purple')
ON CONFLICT DO NOTHING;

-- Step 2: Ensure default bot settings exist
INSERT INTO bot_settings (bot_name, bot_tone, facebook_verify_token) 
VALUES ('Assistant', 'helpful and professional', 'TEST_TOKEN')
ON CONFLICT DO NOTHING;

-- Step 3: Ensure default product category exists
INSERT INTO product_categories (name, description, color) VALUES
  ('General', 'Default product category', '#6B7280')
ON CONFLICT DO NOTHING;

-- Step 4: Check if pipeline stages exist, if not create defaults
DO $$
DECLARE
    stage_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO stage_count FROM pipeline_stages;
    
    IF stage_count = 0 THEN
        INSERT INTO pipeline_stages (name, color, order_index) VALUES
            ('New Lead', 'gray', 1),
            ('Contacted', 'blue', 2),
            ('Qualified', 'yellow', 3),
            ('Proposal', 'orange', 4),
            ('Negotiation', 'purple', 5),
            ('Closed Won', 'green', 6),
            ('Closed Lost', 'red', 7)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- Step 5: Verify what data exists
SELECT 
    'Knowledge Categories' AS table_name,
    COUNT(*) AS count
FROM knowledge_categories
UNION ALL
SELECT 
    'Documents',
    COUNT(*)
FROM documents
UNION ALL
SELECT 
    'Document Folders',
    COUNT(*)
FROM document_folders
UNION ALL
SELECT 
    'Bot Settings',
    COUNT(*)
FROM bot_settings
UNION ALL
SELECT 
    'Bot Rules',
    COUNT(*)
FROM bot_rules
UNION ALL
SELECT 
    'Bot Instructions',
    COUNT(*)
FROM bot_instructions
UNION ALL
SELECT 
    'Product Categories',
    COUNT(*)
FROM product_categories
UNION ALL
SELECT 
    'Products',
    COUNT(*)
FROM products
UNION ALL
SELECT 
    'Pipeline Stages',
    COUNT(*)
FROM pipeline_stages
UNION ALL
SELECT 
    'Leads',
    COUNT(*)
FROM leads;

-- Step 6: Show current knowledge categories
SELECT 
    id,
    name,
    type,
    color,
    created_at
FROM knowledge_categories
ORDER BY name;




