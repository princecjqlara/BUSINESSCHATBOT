-- Add category_id column to document_folders table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_folders' AND column_name = 'category_id'
    ) THEN
        ALTER TABLE document_folders ADD COLUMN category_id UUID REFERENCES knowledge_categories(id) ON DELETE SET NULL;
    END IF;
END $$;
