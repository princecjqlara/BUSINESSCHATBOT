# Migrate All Media to Cloudinary

## Overview

This guide helps you ensure all media files (images, videos, documents) are uploaded to Cloudinary.

## Step 1: Check Current Media Status

### Option A: Use SQL Script
1. Open Supabase Dashboard → SQL Editor
2. Run `check_media_urls.sql`
3. Review the results to see:
   - Which documents have media URLs
   - Which URLs are already on Cloudinary
   - Which URLs need migration

### Option B: Use API Endpoint
1. Open your browser or use curl:
   ```bash
   curl http://localhost:3000/api/media/migrate-to-cloudinary
   ```
2. This will show:
   - Total media URLs
   - How many are on Cloudinary
   - How many need migration
   - List of URLs that need migration

## Step 2: Dry Run Migration

Before actually migrating, do a dry run to see what would be migrated:

```bash
curl -X POST http://localhost:3000/api/media/migrate-to-cloudinary \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "table": "documents"}'
```

This will show you:
- Which URLs would be migrated
- What the new Cloudinary URLs would be
- Any potential errors (without actually migrating)

## Step 3: Perform Migration

Once you've reviewed the dry run results, perform the actual migration:

```bash
curl -X POST http://localhost:3000/api/media/migrate-to-cloudinary \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false, "table": "documents"}'
```

Or use Postman/Thunder Client:
- Method: POST
- URL: `http://localhost:3000/api/media/migrate-to-cloudinary`
- Body (JSON):
  ```json
  {
    "dryRun": false,
    "table": "documents"
  }
  ```

## Step 4: Verify Migration

After migration, check the results:

1. **Check API response**: The migration endpoint returns:
   - Number of URLs migrated
   - Number of errors
   - Details of each migration

2. **Check database**: Run `check_media_urls.sql` again to verify all URLs are now Cloudinary URLs

3. **Check application**: Refresh your app and verify media still displays correctly

## What Gets Migrated

The migration script:
- ✅ Finds all media URLs in documents that are NOT from Cloudinary
- ✅ Downloads each file from its current location
- ✅ Uploads it to Cloudinary in the `documents` folder
- ✅ Updates the database with the new Cloudinary URL
- ✅ Preserves original URLs if migration fails (for safety)

## Supported Media Types

- Images (jpg, png, gif, webp, etc.)
- Videos (mp4, mov, etc.)
- Documents (pdf, doc, docx, etc.)
- Any file type supported by Cloudinary

## Important Notes

1. **Backup First**: Consider backing up your database before migration
2. **Test First**: Always run dry-run first to see what will happen
3. **Check Cloudinary Limits**: Ensure you have enough Cloudinary storage/quota
4. **Network Required**: Migration requires internet connection to download and upload files
5. **Time**: Migration may take time depending on number of files and their sizes

## Troubleshooting

### Migration Fails for Some URLs
- Check if the original URLs are still accessible
- Verify Cloudinary credentials are correct
- Check Cloudinary storage limits

### Media Doesn't Display After Migration
- Clear browser cache
- Check that Cloudinary URLs are valid
- Verify media_urls column was updated in database

### Dry Run Shows Errors
- Review error messages
- Fix issues before running actual migration
- Some URLs may be inaccessible (404, expired, etc.)

## Monitoring

Check `.cursor/debug.log` for detailed migration logs:
- Look for `media/migrate-to-cloudinary/route.ts` entries
- See which files are being downloaded/uploaded
- Track any errors during migration


