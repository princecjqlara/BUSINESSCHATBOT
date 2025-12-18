-- ============================================================================
-- DATA LOSS DIAGNOSTIC SCRIPT
-- Run this in Supabase SQL Editor to identify what data was lost
-- ============================================================================

-- Check recent delete operations in audit log
SELECT 
    'Recent Deletes from Audit Log' AS check_type,
    change_type,
    entity_type,
    entity_id,
    old_value,
    created_at,
    created_by
FROM ml_knowledge_changes
WHERE change_type = 'delete'
ORDER BY created_at DESC
LIMIT 50;

-- Check document count
SELECT 
    'Current Document Count' AS check_type,
    COUNT(*) AS total_documents,
    COUNT(DISTINCT category_id) AS categories_with_docs,
    COUNT(DISTINCT folder_id) AS folders_with_docs
FROM documents;

-- Check for documents by category
SELECT 
    'Documents by Category' AS check_type,
    kc.name AS category_name,
    COUNT(d.id) AS document_count
FROM knowledge_categories kc
LEFT JOIN documents d ON d.category_id = kc.id
GROUP BY kc.id, kc.name
ORDER BY document_count DESC;

-- Check for documents in folders
SELECT 
    'Documents by Folder' AS check_type,
    df.name AS folder_name,
    COUNT(d.id) AS document_count
FROM document_folders df
LEFT JOIN documents d ON d.folder_id = df.id
GROUP BY df.id, df.name
ORDER BY document_count DESC;

-- Check for deleted documents that might be recoverable from audit log
SELECT 
    'Potentially Recoverable Documents' AS check_type,
    entity_id AS document_id,
    old_value->>'content' AS content_preview,
    old_value->>'metadata' AS metadata,
    created_at AS deleted_at
FROM ml_knowledge_changes
WHERE change_type = 'delete'
  AND entity_type = 'document'
  AND old_value IS NOT NULL
  AND undone = false
ORDER BY created_at DESC
LIMIT 20;

-- Check all tables for data counts
SELECT 
    'Table Data Counts' AS check_type,
    'documents' AS table_name,
    COUNT(*) AS row_count
FROM documents
UNION ALL
SELECT 
    'Table Data Counts',
    'knowledge_categories',
    COUNT(*)
FROM knowledge_categories
UNION ALL
SELECT 
    'Table Data Counts',
    'document_folders',
    COUNT(*)
FROM document_folders
UNION ALL
SELECT 
    'Table Data Counts',
    'bot_rules',
    COUNT(*)
FROM bot_rules
UNION ALL
SELECT 
    'Table Data Counts',
    'bot_instructions',
    COUNT(*)
FROM bot_instructions
UNION ALL
SELECT 
    'Table Data Counts',
    'leads',
    COUNT(*)
FROM leads
UNION ALL
SELECT 
    'Table Data Counts',
    'products',
    COUNT(*)
FROM products
UNION ALL
SELECT 
    'Table Data Counts',
    'properties',
    COUNT(*)
FROM properties;

-- Check for any CASCADE delete effects
-- (This would show if deleting a parent record caused child records to be deleted)
SELECT 
    'CASCADE Delete Check' AS check_type,
    'If you see this, check foreign key relationships' AS note;




