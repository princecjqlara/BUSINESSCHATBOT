# ⚠️ URGENT: Fix Cloudinary Credentials

## Current Error

Upload is failing with HTTP 401 "Invalid Signature" because your Cloudinary API secret doesn't match your API key.

## Current Credentials in .env.local

```
CLOUDINARY_CLOUD_NAME=dgc5fvvxm
CLOUDINARY_API_KEY=159823798613415
CLOUDINARY_API_SECRET=-98aN8tPc7RI9JzzcvMkjRP8Gfpk
```

## Fix Steps

### Step 1: Verify in Cloudinary Dashboard

1. Go to: https://console.cloudinary.com/
2. Log in to your account
3. Go to **Settings** → **API Keys** (or **Account Details**)
4. Find your account with Cloud Name: `dgc5fvvxm`
5. Verify:
   - **Cloud Name**: Should be `dgc5fvvxm` ✅
   - **API Key**: Should be `159823798613415` ✅
   - **API Secret**: Click "Reveal" to see the actual secret

### Step 2: Update API Secret

The API Secret in your `.env.local` (`-98aN8tPc7RI9JzzcvMkjRP8Gfpk`) is **WRONG**.

1. Copy the **exact** API Secret from Cloudinary dashboard (after clicking "Reveal")
2. Open `.env.local`
3. Replace the `CLOUDINARY_API_SECRET` line with:
   ```env
   CLOUDINARY_API_SECRET=PASTE_THE_EXACT_SECRET_FROM_DASHBOARD
   ```
4. **Important**: 
   - No spaces before/after the `=`
   - No quotes around the value
   - Copy exactly as shown in dashboard

### Step 3: Restart Server

After updating:
1. Stop server: `Ctrl+C`
2. Start: `npm run dev`
3. Wait for it to start

### Step 4: Test

1. Test connection: `curl http://localhost:3000/api/test-cloudinary`
   - Should return: `{"success":true,"message":"Cloudinary credentials are valid"}`
2. Try uploading a file
   - Should work now!

## Why This Happens

Cloudinary uses the API Secret to sign requests. If the secret doesn't match the key, you get "Invalid Signature" error. This usually means:
- Secret was copied incorrectly
- Secret was regenerated in Cloudinary but not updated in .env.local
- There's a typo in the secret

## Quick Test

After updating, test with:
```bash
curl http://localhost:3000/api/test-cloudinary
```

If it returns `{"success":true}`, your credentials are correct!


