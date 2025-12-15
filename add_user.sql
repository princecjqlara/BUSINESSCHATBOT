-- ============================================================================
-- ADD USER TO SUPABASE AUTH
-- ============================================================================
-- 
-- Email: messengerbulksend@gmail.com
-- Password: demet5732595
--
-- NOTE: Supabase Auth uses encrypted passwords. The recommended way is to
-- use the Supabase Dashboard or Auth API. However, this SQL provides
-- an alternative method if you have admin access.
-- ============================================================================

-- Method 1: Using Supabase Dashboard (RECOMMENDED)
-- 1. Go to: https://supabase.com/dashboard/project/eqnkxjskwrpjqblnnlea/auth/users
-- 2. Click "Add User" → "Create new user"
-- 3. Enter:
--    - Email: messengerbulksend@gmail.com
--    - Password: demet5732595
--    - Auto Confirm User: ✅ (checked)
-- 4. Click "Create User"

-- Method 2: Using SQL (Requires service_role key or admin access)
-- This method directly inserts into auth.users table
-- WARNING: This bypasses Supabase Auth security and should only be used
-- if you have proper admin access

-- First, we need to generate a password hash
-- Supabase uses crypt() function from pgcrypto extension

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Insert user into auth.users
-- Note: This requires superuser or service_role access
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'messengerbulksend@gmail.com',
    crypt('demet5732595', gen_salt('bf')), -- bcrypt hash of password
    NOW(), -- Email confirmed immediately
    NULL,
    NULL,
    '{"provider":"email","providers":["email"]}',
    '{}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
)
ON CONFLICT (email) DO UPDATE
SET 
    encrypted_password = crypt('demet5732595', gen_salt('bf')),
    updated_at = NOW();

-- ============================================================================
-- ALTERNATIVE: Using Supabase Management API (Recommended for automation)
-- ============================================================================
-- 
-- You can also use the Supabase Management API or client library:
-- 
-- Using curl:
-- curl -X POST 'https://eqnkxjskwrpjqblnnlea.supabase.co/auth/v1/admin/users' \
--   -H "apikey: YOUR_SERVICE_ROLE_KEY" \
--   -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
--   -H "Content-Type: application/json" \
--   -d '{
--     "email": "messengerbulksend@gmail.com",
--     "password": "demet5732595",
--     "email_confirm": true
--   }'
--
-- Replace YOUR_SERVICE_ROLE_KEY with your service role key from .env.local
-- ============================================================================

-- ============================================================================
-- VERIFY USER WAS CREATED
-- ============================================================================

SELECT 
    id,
    email,
    email_confirmed_at,
    created_at,
    CASE 
        WHEN email_confirmed_at IS NOT NULL THEN '✅ User created and confirmed'
        ELSE '⚠️ User created but not confirmed'
    END AS status
FROM auth.users
WHERE email = 'messengerbulksend@gmail.com';

