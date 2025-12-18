# Verify Cloudinary Credentials - URGENT

## Current Error

The upload is failing with HTTP 401 "Invalid Signature" from Cloudinary. This means your API secret doesn't match your API key.

## Quick Fix Steps

### Step 1: Get Correct Credentials from Cloudinary

1. Go to: https://console.cloudinary.com/
2. Log in to your account
3. Click on your account name (top right) → **Settings** or go directly to: https://console.cloudinary.com/settings/account
4. Scroll down to **API Keys** section
5. You'll see:
   - **Cloud Name**: `dvx6cpbuq` (should match what you have)
   - **API Key**: `698283366437857` (should match what you have)
   - **API Secret**: Click "Reveal" to see it (THIS IS WHAT YOU NEED TO UPDATE)

### Step 2: Update .env.local

Open `.env.local` and replace the API Secret with the one from Cloudinary dashboard:

```env
CLOUDINARY_CLOUD_NAME=dvx6cpbuq
CLOUDINARY_API_KEY=698283366437857
CLOUDINARY_API_SECRET=PASTE_THE_REVEALED_SECRET_HERE
```

**CRITICAL:**
- Copy the API Secret EXACTLY as shown (no spaces, no quotes)
- Make sure there are no extra characters
- The secret should be a long string (usually 28+ characters)

### Step 3: Restart Server

1. Stop the server: Press `Ctrl+C` in the terminal
2. Start again: `npm run dev`
3. Wait for it to fully start

### Step 4: Test Upload

1. Try uploading a file again
2. Should work now - no more 401 error!

## Why This Happens

Cloudinary uses the API Secret to sign requests. If the secret doesn't match the key, you get "Invalid Signature" error. This usually happens when:
- Credentials were regenerated in Cloudinary
- Secret was copied incorrectly
- There's a typo in the secret

## Verification

After fixing, check logs - you should see:
- ✅ "After Cloudinary upload" with `hasSecureUrl: true`
- ❌ NOT "Invalid Signature" error




