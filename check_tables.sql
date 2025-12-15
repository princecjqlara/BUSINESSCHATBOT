-- ============================================================================
-- TABLE VERIFICATION SCRIPT
-- Run this to check if all required tables are created
-- ============================================================================

-- Check for all required tables
SELECT 
    CASE 
        WHEN COUNT(*) = 20 THEN '✅ All tables exist'
        ELSE '❌ Missing tables: ' || (20 - COUNT(*))::text || ' tables missing'
    END AS status,
    COUNT(*) AS tables_found,
    20 AS expected_tables
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    -- Core Tables
    'documents',
    'document_folders',
    'knowledge_categories',
    'bot_settings',
    'bot_rules',
    'bot_instructions',
    'conversations',
    
    -- Pipeline Tables
    'pipeline_stages',
    'leads',
    'lead_stage_history',
    
    -- Workflow Tables
    'workflows',
    'workflow_executions',
    
    -- Human Takeover
    'human_takeover_sessions',
    
    -- Facebook Integration
    'connected_pages',
    
    -- Store Tables
    'store_settings',
    'product_categories',
    'products',
    'product_variation_types',
    'product_variations',
    
    -- Real Estate
    'properties'
  );

-- ============================================================================
-- DETAILED TABLE CHECK
-- Shows which tables exist and which are missing
-- ============================================================================

SELECT 
    required_tables.table_name,
    CASE 
        WHEN t.table_name IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END AS status
FROM (
    VALUES 
        ('documents'),
        ('document_folders'),
        ('knowledge_categories'),
        ('bot_settings'),
        ('bot_rules'),
        ('bot_instructions'),
        ('conversations'),
        ('pipeline_stages'),
        ('leads'),
        ('lead_stage_history'),
        ('workflows'),
        ('workflow_executions'),
        ('human_takeover_sessions'),
        ('connected_pages'),
        ('store_settings'),
        ('product_categories'),
        ('products'),
        ('product_variation_types'),
        ('product_variations'),
        ('properties')
) AS required_tables(table_name)
LEFT JOIN information_schema.tables t 
    ON t.table_schema = 'public' 
    AND t.table_name = required_tables.table_name
ORDER BY 
    CASE WHEN t.table_name IS NULL THEN 0 ELSE 1 END,
    required_tables.table_name;

-- ============================================================================
-- CHECK FOR REQUIRED EXTENSIONS
-- ============================================================================

SELECT 
    extname AS extension_name,
    CASE 
        WHEN extname IS NOT NULL THEN '✅ INSTALLED'
        ELSE '❌ MISSING'
    END AS status
FROM pg_extension
WHERE extname = 'vector';

-- ============================================================================
-- CHECK FOR REQUIRED FUNCTIONS
-- ============================================================================

SELECT 
    routine_name AS function_name,
    CASE 
        WHEN routine_name IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END AS status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('update_updated_at_column', 'match_documents')
ORDER BY routine_name;

-- ============================================================================
-- CHECK FOR DEFAULT DATA
-- ============================================================================

-- Check pipeline stages
SELECT 
    'Pipeline Stages' AS check_type,
    COUNT(*) AS count,
    CASE 
        WHEN COUNT(*) >= 6 THEN '✅ Default stages exist'
        ELSE '⚠️ Missing default stages'
    END AS status
FROM pipeline_stages;

-- Check knowledge categories
SELECT 
    'Knowledge Categories' AS check_type,
    COUNT(*) AS count,
    CASE 
        WHEN COUNT(*) >= 4 THEN '✅ Default categories exist'
        ELSE '⚠️ Missing default categories'
    END AS status
FROM knowledge_categories;

-- Check bot settings
SELECT 
    'Bot Settings' AS check_type,
    COUNT(*) AS count,
    CASE 
        WHEN COUNT(*) >= 1 THEN '✅ Bot settings exist'
        ELSE '⚠️ Missing bot settings'
    END AS status
FROM bot_settings;

-- Check product categories
SELECT 
    'Product Categories' AS check_type,
    COUNT(*) AS count,
    CASE 
        WHEN COUNT(*) >= 1 THEN '✅ Default product category exists'
        ELSE '⚠️ Missing default product category'
    END AS status
FROM product_categories;

-- ============================================================================
-- SUMMARY REPORT
-- ============================================================================

SELECT 
    'SUMMARY' AS report_type,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (
        'documents', 'document_folders', 'knowledge_categories', 'bot_settings', 'bot_rules',
        'bot_instructions', 'conversations', 'pipeline_stages', 'leads', 'lead_stage_history',
        'workflows', 'workflow_executions', 'human_takeover_sessions', 'connected_pages',
        'store_settings', 'product_categories', 'products', 'product_variation_types',
        'product_variations', 'properties'
    )) AS tables_created,
    20 AS tables_expected,
    (SELECT COUNT(*) FROM pg_extension WHERE extname = 'vector') AS vector_extension,
    (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' 
     AND routine_name IN ('update_updated_at_column', 'match_documents')) AS functions_created,
    2 AS functions_expected;

