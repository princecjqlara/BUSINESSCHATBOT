-- ============================================================================
-- VERIFY USER EXISTS
-- ============================================================================

SELECT 
    id,
    email,
    email_confirmed_at,
    created_at,
    last_sign_in_at,
    CASE 
        WHEN email_confirmed_at IS NOT NULL THEN '✅ User exists and is confirmed'
        ELSE '⚠️ User exists but email not confirmed'
    END AS status
FROM auth.users
WHERE email = 'messengerbulksend@gmail.com';

-- ============================================================================
-- UPDATE USER PASSWORD (if needed)
-- ============================================================================
-- Note: This requires admin/service_role access
-- The password will be hashed automatically

-- Update password using Supabase function
-- This requires the auth schema to have the proper functions
UPDATE auth.users
SET 
    encrypted_password = crypt('demet5732595', gen_salt('bf')),
    updated_at = NOW()
WHERE email = 'messengerbulksend@gmail.com';

-- Verify password was updated
SELECT 
    email,
    '✅ Password updated' AS status,
    updated_at
FROM auth.users
WHERE email = 'messengerbulksend@gmail.com';

