# ⚠️ CRITICAL: Supabase Configuration Required

## Problem Identified

Your application is currently using a **mock Supabase client** because the environment variables are not configured. This means:

- ❌ All database queries return empty arrays
- ❌ No data can be saved or retrieved
- ❌ Documents, categories, and all other data appear as "lost" but are actually not being queried from a real database

## Solution: Configure Supabase

### Step 1: Get Your Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (or create a new one)
3. Go to **Settings** → **API**
4. Copy these values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

### Step 2: Create `.env.local` File

Create a file named `.env.local` in the root of your project with:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 3: Restart the Development Server

After creating `.env.local`:

1. Stop the Next.js server (Ctrl+C)
2. Restart it: `npm run dev`
3. The server will now connect to your real Supabase database

### Step 4: Run Database Migrations

Once Supabase is configured, you need to set up your database:

1. Open Supabase Dashboard → **SQL Editor**
2. Run `supabase/migrations/00_complete_migration.sql` first
3. Then run the other migration files in order:
   - `create_knowledge_categories.sql`
   - `create_folders_table.sql`
   - `add_ml_chatbot_tables.sql`
   - `add_ai_edit_tracking.sql`
   - `add_message_ratings.sql`
   - `add_max_sentences_setting.sql`
   - `add_best_contact_times.sql`
   - `add_conversation_flow.sql`

### Step 5: Restore Default Data

After migrations, restore default data:

1. Run `restore_default_data.sql` in Supabase SQL Editor
2. This will create default categories and settings

### Step 6: Verify Connection

1. Refresh your application
2. Check the browser console - you should NOT see "Supabase URL or Key is missing" warnings
3. Check debug logs (`.cursor/debug.log`) - look for "Supabase client created successfully"
4. Data should now appear in your application

## Verification

After setup, check these:

- ✅ No "Supabase not configured" messages in logs
- ✅ Categories appear in the knowledge base
- ✅ You can create new documents
- ✅ Data persists after page refresh

## If You Don't Have a Supabase Account

1. Sign up at [supabase.com](https://supabase.com)
2. Create a new project
3. Follow the steps above to configure it

## Important Notes

- The `.env.local` file should NOT be committed to git (it's in `.gitignore`)
- Never share your Supabase keys publicly
- The `NEXT_PUBLIC_` prefix is required for these variables to be accessible in the browser


