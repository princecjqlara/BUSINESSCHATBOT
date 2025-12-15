# Best Time to Contact Feature - Implementation Summary

## Overview

The "Best Time to Contact" feature has been successfully integrated into the AI chatbot. Instead of sending workflow follow-up messages immediately, the chatbot now schedules messages based on optimal contact times determined by analyzing message history and reply patterns.

## What Was Implemented

### 1. Database Schema
- **Migration**: `supabase/migrations/add_best_contact_times.sql`
  - Added `best_contact_times` JSONB field to `leads` table
  - Added `enable_best_time_contact` boolean to `bot_settings` (global toggle)
  - Added `enable_best_time_contact` boolean to `leads` (per-lead override)

- **Scheduled Messages Table**: `supabase/migrations/create_scheduled_messages.sql`
  - New table to queue messages for optimal send times
  - Tracks message status, retries, and metadata

### 2. Core Services

#### `app/lib/bestContactTimesService.ts`
- Computes optimal contact times from message history
- Uses activity histogram and reply pattern analysis
- Stores best contact times in database
- Provides default fallback times

#### `app/lib/bestContactTimeChecker.ts`
- Real-time utilities to check if current time matches best contact windows
- Calculates next best contact time
- Checks if feature is enabled (global or per-lead)

#### `app/lib/scheduledMessageService.ts`
- Schedules follow-up messages for best contact times
- Processes scheduled messages (called by cron job)
- Handles retries and error recovery
- Falls back to immediate sending if feature is disabled

### 3. Workflow Integration

#### `app/lib/workflowEngine.ts`
- Modified message nodes to use `scheduleFollowUpMessage()` instead of immediate `sendMessengerMessage()`
- Automatically checks if best time contact is enabled
- Schedules messages for optimal times when enabled
- Sends immediately when disabled or if currently in best time window

### 4. Settings & UI

#### `app/api/settings/route.ts`
- Added `enableBestTimeContact` field to settings API
- Supports global enable/disable toggle

#### `app/components/RulesEditor.tsx`
- Added "Best Time to Contact" toggle section
- User can enable/disable the feature globally
- Clear description of what the feature does

### 5. API Endpoints

#### `app/api/leads/[id]/best-contact-times/route.ts`
- `GET`: Retrieve best contact times for a lead
- `POST`: Compute and update best contact times

#### `app/api/cron/process-scheduled-messages/route.ts`
- Cron job endpoint to process pending scheduled messages
- Runs every minute (configured in `vercel.json`)

## How It Works

### 1. Best Time Computation
- Analyzes conversation history to find when contacts reply fastest
- Builds activity histogram (7 days × 24 hours = 168 time slots)
- Identifies top 5-7 best contact time windows per week
- Stores results with confidence scores and metadata

### 2. Message Scheduling
When a workflow needs to send a follow-up message:
1. Checks if best time contact is enabled (global or per-lead)
2. If enabled:
   - Checks if currently in a best contact time window
   - If yes → sends immediately
   - If no → schedules for next best contact time
3. If disabled → sends immediately (normal behavior)

### 3. Message Processing
- Cron job runs every minute
- Checks for scheduled messages ready to send
- Re-validates best contact time before sending
- Sends message if in optimal window, otherwise reschedules
- Handles retries and error recovery

## Database Setup

Run these migrations in Supabase SQL Editor:

1. **Add Best Contact Times Fields**:
   ```sql
   -- Run: supabase/migrations/add_best_contact_times.sql
   ```

2. **Create Scheduled Messages Table**:
   ```sql
   -- Run: supabase/migrations/create_scheduled_messages.sql
   ```

## Configuration

### Enable/Disable Feature

1. **Global Setting** (affects all leads):
   - Go to Settings → Bot Configuration
   - Find "Best Time to Contact" section
   - Toggle on/off
   - Click "Save Changes"

2. **Per-Lead Override** (future enhancement):
   - Can be set via API or database directly
   - `NULL` = use global setting
   - `true` = always enabled for this lead
   - `false` = always disabled for this lead

### Compute Best Contact Times

Best contact times are automatically computed when:
- A lead has sufficient message history (≥2 messages)
- Messages are exchanged with the contact

You can also manually trigger computation:
```typescript
POST /api/leads/{leadId}/best-contact-times
```

## Features

### ✅ Implemented
- ✅ ML-based best time computation from message history
- ✅ Multiple time windows per week (5-7 windows)
- ✅ Real-time checking if current time is optimal
- ✅ Automatic scheduling of follow-up messages
- ✅ Global enable/disable toggle
- ✅ Per-lead override support (database level)
- ✅ Fallback to immediate sending if disabled
- ✅ Cron job for processing scheduled messages
- ✅ Retry logic for failed messages
- ✅ Integration with workflow engine

### 📊 Best Contact Times Format

```json
{
  "bestContactTimes": [
    {
      "dayOfWeek": "Monday",
      "timeRange": "9:00 AM - 11:00 AM",
      "startHour": 9,
      "endHour": 11,
      "confidence": 85,
      "averageReplyTime": 15,
      "messageCount": 45
    },
    {
      "dayOfWeek": "Tuesday",
      "timeRange": "2:00 PM - 4:00 PM",
      "startHour": 14,
      "endHour": 16,
      "confidence": 82,
      "averageReplyTime": 18
    }
    // ... more windows
  ],
  "totalMessagesAnalyzed": 45,
  "averageReplyTime": 18,
  "fastestReplyTime": 5,
  "slowestReplyTime": 120,
  "computedAt": "2025-01-15T10:30:00.000Z",
  "timezone": "Asia/Manila",
  "isDefault": false
}
```

## Usage Flow

1. **User enables feature** in Settings
2. **Chatbot receives message** from contact
3. **Workflow triggers** follow-up message
4. **System checks** if best time contact is enabled
5. **If enabled**:
   - Checks if currently in best contact time
   - If yes → sends immediately
   - If no → schedules for next best time
6. **Cron job processes** scheduled messages
7. **Message sent** at optimal time

## Testing

1. **Enable the feature** in Settings
2. **Send messages** to a contact (need at least 2 messages)
3. **Trigger a workflow** with a follow-up message
4. **Check scheduled_messages table** to see if message was scheduled
5. **Wait for best contact time** or manually trigger cron job
6. **Verify message** was sent at optimal time

## Notes

- All times are in **Philippine Time (PHT, UTC+8)**
- Best contact times are computed automatically as conversations happen
- Default times are used if insufficient message history
- Feature can be toggled on/off without affecting existing scheduled messages
- Messages scheduled before disabling will still be sent

## Next Steps (Optional Enhancements)

- Add UI to view best contact times per lead
- Add manual "Update Best Times" button per lead
- Add analytics dashboard showing best contact time effectiveness
- Add per-lead toggle in lead detail page
- Add notification when message is scheduled vs sent immediately

