# Data Recovery Instructions

## Problem
Documents, categories, and other data are missing from the database.

## Immediate Recovery Steps

### Step 1: Restore Default Data
1. Open Supabase Dashboard → SQL Editor
2. Run the `restore_default_data.sql` script
3. This will:
   - Restore default knowledge categories (General, Pricing, FAQs, Product Info)
   - Restore default bot settings
   - Restore default product category
   - Create default pipeline stages if missing
   - Show a summary of what data exists

### Step 2: Check Database State
1. Run `diagnose_data_loss.sql` in Supabase SQL Editor
2. Review the output to see:
   - Current data counts in all tables
   - Recent delete operations from audit log
   - Potentially recoverable documents

### Step 3: Check Debug Logs
1. Check `.cursor/debug.log` for:
   - DELETE operations (look for `knowledge/route.ts:DELETE`)
   - GET operations showing empty results (look for `knowledge/route.ts:GET`)
   - Categories queries (look for `categories/route.ts:GET`)

### Step 4: Verify Data Restoration
1. Refresh your application
2. Check if categories appear
3. Check if documents appear (if any were recoverable)
4. Review the debug logs to see what the API is returning

## Prevention Measures

### Already Implemented:
1. ✅ DELETE operations are now logged with full details
2. ✅ GET operations are instrumented to track empty results
3. ✅ Categories endpoint is instrumented

### Recommended Next Steps:
1. Implement soft deletes (mark as deleted instead of actually deleting)
2. Add confirmation dialogs for bulk operations
3. Set up database backups
4. Add audit logging for all data modifications

## If Data Cannot Be Recovered

If documents cannot be recovered from the audit log:
1. You'll need to recreate them manually
2. Consider implementing a backup system
3. Review the DELETE instrumentation logs to understand what happened

## Contact Points

- Check Supabase dashboard for database backups
- Review application logs for error messages
- Check if there were any recent migrations that might have affected data


