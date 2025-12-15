-- ============================================================================
-- RECOVER DOCUMENTS FROM AUDIT LOG
-- This script attempts to recover deleted documents from ml_knowledge_changes
-- ============================================================================

-- Step 1: Check for deleted documents in audit log
SELECT 
    'Deleted Documents in Audit Log' AS check_type,
    id AS change_id,
    entity_id AS document_id,
    old_value->>'content' AS content_preview,
    old_value->>'metadata' AS metadata_json,
    old_value->>'name' AS document_name,
    created_at AS deleted_at,
    created_by,
    undone
FROM ml_knowledge_changes
WHERE entity_type = 'document'
  AND change_type = 'delete'
  AND old_value IS NOT NULL
  AND (undone IS NULL OR undone = false)
ORDER BY created_at DESC;

-- Step 2: Count recoverable documents
SELECT 
    'Recoverable Documents Count' AS check_type,
    COUNT(*) AS recoverable_count
FROM ml_knowledge_changes
WHERE entity_type = 'document'
  AND change_type = 'delete'
  AND old_value IS NOT NULL
  AND (undone IS NULL OR undone = false);

-- Step 3: Attempt to restore documents (run this section if you want to restore)
-- WARNING: This will restore documents. Review the output from Step 1 first!

DO $$
DECLARE
    change_record RECORD;
    restored_count INTEGER := 0;
    content_text TEXT;
    metadata_json JSONB;
    category_id_val UUID;
    folder_id_val UUID;
    document_name TEXT;
BEGIN
    -- Loop through deleted documents in audit log
    FOR change_record IN 
        SELECT 
            id AS change_id,
            entity_id,
            old_value,
            created_at
        FROM ml_knowledge_changes
        WHERE entity_type = 'document'
          AND change_type = 'delete'
          AND old_value IS NOT NULL
          AND (undone IS NULL OR undone = false)
        ORDER BY created_at DESC
    LOOP
        -- Extract values from old_value JSONB
        content_text := change_record.old_value->>'content';
        metadata_json := COALESCE(change_record.old_value->'metadata', '{}'::jsonb);
        document_name := change_record.old_value->>'name';
        
        -- Extract category_id and folder_id if they exist
        IF change_record.old_value ? 'categoryId' THEN
            category_id_val := (change_record.old_value->>'categoryId')::UUID;
        ELSIF change_record.old_value->'metadata' ? 'category_id' THEN
            category_id_val := (change_record.old_value->'metadata'->>'category_id')::UUID;
        ELSE
            category_id_val := NULL;
        END IF;
        
        IF change_record.old_value ? 'folderId' THEN
            folder_id_val := (change_record.old_value->>'folderId')::UUID;
        ELSIF change_record.old_value->'metadata' ? 'folder_id' THEN
            folder_id_val := (change_record.old_value->'metadata'->>'folder_id')::UUID;
        ELSE
            folder_id_val := NULL;
        END IF;
        
        -- Documents table uses BIGSERIAL, so we always create new IDs
        -- Store original entity_id in metadata for reference
        INSERT INTO documents (
            content,
            metadata,
            category_id,
            folder_id,
            created_at
        ) VALUES (
            content_text,
            COALESCE(metadata_json, jsonb_build_object('name', document_name)) || 
            jsonb_build_object(
                'recovered_from_audit', true,
                'original_entity_id', change_record.entity_id,
                'recovery_change_id', change_record.change_id
            ),
            category_id_val,
            folder_id_val,
            change_record.created_at
        );
        
        restored_count := restored_count + 1;
        
        -- Mark the change as undone
        UPDATE ml_knowledge_changes
        SET undone = true
        WHERE id = change_record.change_id;
    END LOOP;
    
    RAISE NOTICE 'Restored % documents from audit log', restored_count;
END $$;

-- Step 4: Verify restored documents
SELECT 
    'Restored Documents Verification' AS check_type,
    COUNT(*) AS total_documents,
    COUNT(DISTINCT category_id) AS categories_with_docs
FROM documents;

-- Step 5: Show recently restored documents
SELECT 
    'Recently Restored Documents' AS check_type,
    id,
    metadata->>'name' AS name,
    LEFT(content, 100) AS content_preview,
    category_id,
    folder_id,
    created_at
FROM documents
ORDER BY created_at DESC
LIMIT 20;

