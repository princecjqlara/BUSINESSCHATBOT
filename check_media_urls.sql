-- ============================================================================
-- CHECK MEDIA URLS IN DATABASE
-- This script identifies all media URLs and checks if they're from Cloudinary
-- ============================================================================

-- Check documents with media_urls
SELECT 
    'Documents with Media URLs' AS check_type,
    id,
    metadata->>'name' AS document_name,
    media_urls,
    array_length(media_urls::text[], 1) AS media_count,
    CASE 
        WHEN media_urls IS NULL OR array_length(media_urls::text[], 1) = 0 THEN 'No media'
        WHEN media_urls::text LIKE '%res.cloudinary.com%' THEN 'All Cloudinary'
        WHEN media_urls::text NOT LIKE '%res.cloudinary.com%' THEN 'Has non-Cloudinary URLs'
        ELSE 'Mixed'
    END AS cloudinary_status
FROM documents
WHERE media_urls IS NOT NULL 
  AND array_length(media_urls::text[], 1) > 0
ORDER BY id DESC
LIMIT 50;

-- Count documents by Cloudinary status
SELECT 
    'Media URL Summary' AS check_type,
    COUNT(*) AS total_documents_with_media,
    COUNT(*) FILTER (WHERE media_urls::text LIKE '%res.cloudinary.com%') AS all_cloudinary,
    COUNT(*) FILTER (WHERE media_urls::text NOT LIKE '%res.cloudinary.com%' AND media_urls::text NOT LIKE '%res.cloudinary.com%') AS has_non_cloudinary,
    COUNT(*) FILTER (WHERE media_urls IS NULL OR array_length(media_urls::text[], 1) = 0) AS no_media
FROM documents
WHERE media_urls IS NOT NULL 
  AND array_length(media_urls::text[], 1) > 0;

-- Find documents with non-Cloudinary URLs
SELECT 
    'Documents Needing Migration' AS check_type,
    id,
    metadata->>'name' AS document_name,
    media_urls,
    unnest(media_urls::text[]) AS individual_url,
    CASE 
        WHEN unnest(media_urls::text[]) LIKE '%res.cloudinary.com%' THEN 'Cloudinary'
        WHEN unnest(media_urls::text[]) LIKE '%localhost%' THEN 'Local'
        WHEN unnest(media_urls::text[]) LIKE 'http://%' OR unnest(media_urls::text[]) LIKE 'https://%' THEN 'External'
        ELSE 'Unknown'
    END AS url_type
FROM documents
WHERE media_urls IS NOT NULL 
  AND array_length(media_urls::text[], 1) > 0
  AND media_urls::text NOT LIKE '%res.cloudinary.com%'
ORDER BY id DESC;

-- Check payment methods for QR codes
SELECT 
    'Payment Methods with QR Codes' AS check_type,
    id,
    name,
    qr_code_url,
    CASE 
        WHEN qr_code_url IS NULL THEN 'No QR code'
        WHEN qr_code_url LIKE '%res.cloudinary.com%' THEN 'Cloudinary'
        ELSE 'Non-Cloudinary'
    END AS cloudinary_status
FROM payment_methods
WHERE qr_code_url IS NOT NULL;

-- Check products for images
SELECT 
    'Products with Images' AS check_type,
    id,
    name,
    image_url,
    CASE 
        WHEN image_url IS NULL THEN 'No image'
        WHEN image_url LIKE '%res.cloudinary.com%' THEN 'Cloudinary'
        ELSE 'Non-Cloudinary'
    END AS cloudinary_status
FROM products
WHERE image_url IS NOT NULL;

-- Check properties for images
SELECT 
    'Properties with Images' AS check_type,
    id,
    title,
    image_urls,
    CASE 
        WHEN image_urls IS NULL OR array_length(image_urls::text[], 1) = 0 THEN 'No images'
        WHEN image_urls::text LIKE '%res.cloudinary.com%' THEN 'All Cloudinary'
        ELSE 'Has non-Cloudinary'
    END AS cloudinary_status
FROM properties
WHERE image_urls IS NOT NULL 
  AND array_length(image_urls::text[], 1) > 0;




