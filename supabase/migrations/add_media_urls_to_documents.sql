-- Add media_urls column to documents table to store media attachments
-- This allows documents to have associated images, videos, or files

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT '[]'::jsonb;

-- Add comment to explain the column
COMMENT ON COLUMN documents.media_urls IS 'Array of media URLs (images, videos, files) associated with this document. Format: ["url1", "url2", ...]';


