# Fix Cloudinary Upload 401 Error

## Problem

The upload endpoint is returning a 500 error with HTTP 401 "Invalid Signature" from Cloudinary.

## Root Cause

The Cloudinary API secret in `.env.local` doesn't match the API key. This causes authentication to fail.

## Solution

### Step 1: Verify Cloudinary Credentials

1. Go to [Cloudinary Dashboard](https://console.cloudinary.com/)
2. Log in to your account
3. Go to **Settings** → **Security** (or **Account Details**)
4. Find your credentials:
   - **Cloud Name** (should match `CLOUDINARY_CLOUD_NAME`)
   - **API Key** (should match `CLOUDINARY_API_KEY`)
   - **API Secret** (should match `CLOUDINARY_API_SECRET`)

### Step 2: Update .env.local

Open `.env.local` and verify/update the Cloudinary credentials:

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

**Important:**
- Make sure there are no extra spaces or quotes
- The API Secret must exactly match what's in your Cloudinary dashboard
- Copy-paste directly from Cloudinary dashboard to avoid typos

### Step 3: Restart Server

After updating `.env.local`:

1. Stop the Next.js server (Ctrl+C)
2. Start it again: `npm run dev`
3. Wait for it to fully start

### Step 4: Test Upload

1. Try uploading a file again
2. Check the browser console - should not see 500 error
3. Check `.cursor/debug.log` - should see successful upload, not "Invalid Signature"

## Current Credentials in .env.local

Based on the file, you have:
- Cloud Name: `dvx6cpbuq`
- API Key: `698283366437857`
- API Secret: `-E6Sao3eNekkIy133T4PC0V2_Nhs`

**Verify these match your Cloudinary dashboard exactly.**

## Common Issues

1. **API Secret has extra characters**: Check for trailing spaces or newlines
2. **API Secret is from wrong account**: Make sure you're using credentials from the correct Cloudinary account
3. **Credentials were regenerated**: If you regenerated credentials in Cloudinary, you need to update `.env.local`

## Verification

After fixing, the logs should show:
- ✅ "After Cloudinary upload" with `hasSecureUrl: true`
- ❌ NOT "Invalid Signature" error


