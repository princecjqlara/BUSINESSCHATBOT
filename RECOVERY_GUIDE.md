# Database Recovery Guide

## If you've lost all data and functions, follow these steps:

### Step 1: Verify Database Connection
1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Run this query to check connection:
```sql
SELECT version();
```

### Step 2: Run Complete Migration
Run the complete migration script in Supabase SQL Editor:
- File: `supabase/migrations/00_complete_migration.sql`

This will create all core tables and functions.

### Step 3: Run Additional Migrations
Run these migrations in order:
1. `supabase/migrations/add_ml_chatbot_tables.sql`
2. `supabase/migrations/add_ai_edit_tracking.sql`
3. `supabase/migrations/add_message_ratings.sql`
4. `supabase/migrations/add_max_sentences_setting.sql`
5. `supabase/migrations/add_best_contact_times.sql`

### Step 4: Verify Tables Exist
Run `check_tables.sql` to verify all tables are created.

### Step 5: Check Environment Variables
Ensure these are set in your `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NVIDIA_API_KEY`

### Step 6: Restart Application
Restart your Next.js dev server after running migrations.



