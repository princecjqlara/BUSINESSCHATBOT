# Facebook Webhook Setup Guide

## Current ngrok URL
**Public URL:** `https://schemeless-rebbecca-nonsubordinating.ngrok-free.dev`

## Webhook Configuration

### Webhook URL
```
https://schemeless-rebbecca-nonsubordinating.ngrok-free.dev/api/webhook
```

### Verify Token
The verify token is stored in your database (`bot_settings` table) or can be set via environment variable `FACEBOOK_VERIFY_TOKEN`. 

**Default:** `TEST_TOKEN` (if not configured)

**To set a custom verify token:**
1. Go to your app settings page: `https://schemeless-rebbecca-nonsubordinating.ngrok-free.dev/settings`
2. Update the Facebook Verify Token in the settings
3. Or set the `FACEBOOK_VERIFY_TOKEN` environment variable

## Step-by-Step Facebook Setup

### 1. Go to Facebook Developers
1. Navigate to [Facebook Developers](https://developers.facebook.com/)
2. Select your app (or create a new one)

### 2. Configure Webhooks
1. Go to **Settings** → **Basic** in your Facebook App
2. Note your **App ID** and **App Secret** (you'll need these)
3. Go to **Webhooks** in the left sidebar
4. Click **"Add Callback URL"** or **"Edit"** if webhook already exists

### 3. Enter Webhook Details
- **Callback URL:** `https://schemeless-rebbecca-nonsubordinating.ngrok-free.dev/api/webhook`
- **Verify Token:** Enter the verify token from your database settings (or `TEST_TOKEN` if using default)
- Click **"Verify and Save"**

### 4. Subscribe to Webhook Events
After verification, subscribe to these events:
- ✅ `messages` - Receive incoming messages
- ✅ `messaging_postbacks` - Receive postback events
- ✅ `messaging_optins` - Receive opt-in events  
- ✅ `messaging_referrals` - Receive referral events (m.me links)

### 5. Subscribe Your Page
1. Go to **Messenger** → **Settings** in your Facebook App
2. Under **Webhooks**, find your page
3. Click **"Subscribe"** next to your page
4. Select the same events as above

### 6. Get Page Access Token
1. In **Messenger** → **Settings**, find your page
2. Generate a **Page Access Token**
3. Copy this token - you'll need it for your app

### 7. Configure Your App
1. Go to your app's settings page: `https://schemeless-rebbecca-nonsubordinating.ngrok-free.dev/settings`
2. Click **"Connect Facebook Page"** or **"Login with Facebook"**
3. Authorize the app with the required permissions
4. Select the page(s) you want to connect
5. The app will automatically subscribe to webhooks

## Environment Variables (Optional)

If you want to set these via environment variables instead of the database:

```env
NEXT_PUBLIC_BASE_URL=https://schemeless-rebbecca-nonsubordinating.ngrok-free.dev
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
FACEBOOK_VERIFY_TOKEN=your_verify_token
FACEBOOK_PAGE_ACCESS_TOKEN=your_page_access_token
```

## Testing the Webhook

### Test Webhook Verification
```bash
curl "https://schemeless-rebbecca-nonsubordinating.ngrok-free.dev/api/webhook?hub.mode=subscribe&hub.verify_token=TEST_TOKEN&hub.challenge=test123"
```

Should return: `test123`

### Test from Facebook
1. Go to your Facebook Page
2. Send a test message to the page
3. Check your app logs to see if the webhook is receiving events

## Troubleshooting

### Webhook Verification Fails
- ✅ Check that the verify token matches exactly (case-sensitive)
- ✅ Ensure ngrok is running and accessible
- ✅ Check that the webhook URL is correct (must be HTTPS)
- ✅ Verify your app is not in Development mode restrictions (if testing)

### Messages Not Received
- ✅ Verify webhook is subscribed to `messages` event
- ✅ Check that page is subscribed to webhooks
- ✅ Ensure page access token is valid and has `pages_messaging` permission
- ✅ Check app logs for errors

### ngrok URL Changed
If ngrok restarts and gets a new URL:
1. Update the webhook URL in Facebook Developer Console
2. Re-verify the webhook
3. Update `NEXT_PUBLIC_BASE_URL` if using environment variables

## Current Status

- ✅ ngrok running: `https://schemeless-rebbecca-nonsubordinating.ngrok-free.dev`
- ✅ Webhook endpoint: `/api/webhook`
- ✅ Full webhook URL: `https://schemeless-rebbecca-nonsubordinating.ngrok-free.dev/api/webhook`
- ⚠️ Verify token: Check your database settings or use `TEST_TOKEN`

## Next Steps

1. **Set your verify token** in the app settings or database
2. **Configure webhook in Facebook** using the URL above
3. **Subscribe to events** (messages, postbacks, etc.)
4. **Connect your Facebook page** via the app settings page
5. **Test** by sending a message to your Facebook page



