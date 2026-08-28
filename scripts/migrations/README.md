# Firestore Migrations

This directory contains migration scripts for updating Firestore data structures and related GCS objects.

## Script Catalog

| Script                        | Type             | Purpose                                                                 |
| ----------------------------- | ---------------- | ----------------------------------------------------------------------- |
| `backfill-highlight-cache.ts` | Backfill         | Generate `highlightCache` for prompts that lack it                      |
| `force-highlight-rerender.ts` | Reusable utility | Invalidate or regenerate `highlightCache` after algorithm/model changes |

**Status policy:** the seven already-run one-time migrations were deleted 2026-08-27 (git history is the archive — recover a script from there if a migration ever needs re-running). The two scripts above are the live operator tools; both are type-checked by the root tsconfig and smoke-tested against the Firestore emulator.

**Helper module:** `firebase-admin-init.ts` is the shared Firebase Admin initialiser. Migration scripts import it; do not run it directly.

**Companion docs:**

- [SETUP_GUIDE.md](./SETUP_GUIDE.md) — Firebase service-account auth setup. Read this once before running any migration.
- [QUICK_START.md](./QUICK_START.md) — common-command cheat sheet for `force-highlight-rerender` and `backfill-highlight-cache`.
- [FORCE_RERENDER_GUIDE.md](./FORCE_RERENDER_GUIDE.md) — deep usage patterns for the rerender script.

## Available Migrations

### 1. Force Highlight Rerender (`force-highlight-rerender.ts`)

Forces all existing prompts to regenerate their highlights by clearing or regenerating the `highlightCache` field. Use this when you've updated the span labeling algorithm, highlighting model, or want to apply new labeling templates to existing prompts.

#### When to Use This

- You've updated the span labeling algorithm or model
- You've made improvements to the highlighting logic
- You want all prompts to use the latest highlighting version
- Similar to how changing `templateVersion` invalidates caches

#### Prerequisites

Same as Highlight Cache Backfill (see section 2 below).

#### Usage

**Dry Run (Preview changes without committing):**

```bash
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts --dry-run
```

**Clear cache (forces rerender on next load - FAST):**

```bash
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts --mode=clear
```

**Clear and regenerate immediately (slower but complete):**

```bash
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts --mode=regenerate
```

**Process specific user's prompts:**

```bash
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts --userId=YOUR_USER_ID --mode=clear
```

**Test on limited documents:**

```bash
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts --limit=10 --dry-run
```

**Custom batch size:**

```bash

```

#### Modes

- **`clear`** (default): Removes the `highlightCache` field from all prompts. Highlights will be regenerated automatically when users load those prompts. This is fast and recommended for most use cases.

- **`regenerate`**: Immediately generates new highlights for all prompts using the current algorithm. This takes longer but ensures all prompts have fresh highlights immediately. Useful before a production deployment.

#### What It Does

For each prompt document with existing `highlightCache`:

**Clear Mode:**

1. Removes the `highlightCache` field
2. Adds a version entry tracking the cache invalidation
3. Prompts will regenerate highlights on next load

**Regenerate Mode:**

1. Extracts the prompt text
2. Calls the ML span labeling service to generate new highlights
3. Updates the document with fresh `highlightCache`
4. Adds a version entry tracking the regeneration

#### Output Example

```
🔧 Force Highlight Rerender Migration

Configuration:
  Mode: CLEAR
  Dry Run: ✗ NO (will update Firestore)
  User Filter: ALL USERS
  Batch Size: 10
  Limit: NONE

ℹ️  Clear mode: Will remove highlightCache to force rerender on next load

📥 Fetching documents from Firestore...
✓ Found 150 document(s)

🔄 Processing documents...

[1/150] (1%) abc12345 (video, 1200 chars)
  ✓ Cleared cache in 0.043s
  Speed: 25.2 docs/min | ETA: 5.9 min

[2/150] (1%) def67890 (default, 800 chars)
  ✓ Cleared cache in 0.038s
  Speed: 27.1 docs/min | ETA: 5.5 min

...

============================================================
📊 Migration Summary
============================================================
Total documents found:        150
Documents processed:          150
Caches cleared:               145 ✓
Documents skipped:            5
  - No existing cache:        5
  - No prompt text:           0
Errors:                       0

Total time:                   5.8 minutes
Average time per document:    0.041s
============================================================

✓ Migration completed! 145 documents cleared, 0 failed.

💡 Next steps:
   - Highlights will be regenerated automatically when prompts are loaded
   - Or run: tsx --tsconfig server/tsconfig.json scripts/migrations/backfill-highlight-cache.ts
```

#### Safety Features

- **Two-mode operation**: Choose between fast cache clearing or immediate regeneration
- **Dry-run mode**: Test the migration without making changes
- **Idempotent**: Skips documents without existing cache
- **Progress tracking**: Real-time progress with ETA estimates
- **Version tracking**: All changes are logged in document versions
- **Error handling**: Gracefully handles errors and provides detailed reports

---

### 2. Highlight Cache Backfill (`backfill-highlight-cache.ts`)

Generates and populates `highlightCache` data for existing prompt documents that don't have ML-powered highlighting data.

#### Prerequisites

Before running the migration, you need to:

1. **Install Firebase Admin SDK** (if not already installed):

   ```bash
   npm install firebase-admin
   ```

2. **Set up Firebase authentication** using one of these methods:

   **Option A: Service Account (Recommended for local development)**

   a. Download your service account key:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project (`flibberai`)
   - Go to Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file somewhere secure (e.g., `~/firebase-service-account.json`)

   b. Add to your `.env` file:

   ```bash
   FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/your/service-account.json
   ```

   **Option B: Application Default Credentials (For Cloud environments)**

   Run this command to authenticate with your Google Cloud account:

   ```bash
   gcloud auth application-default login
   ```

#### Usage

**Dry Run (Preview changes without committing):**

```bash
tsx --tsconfig server/tsconfig.json scripts/migrations/backfill-highlight-cache.ts --dry-run
```

**Run the migration:**

```bash
tsx --tsconfig server/tsconfig.json scripts/migrations/backfill-highlight-cache.ts
```

**Process specific user's prompts:**

```bash
tsx --tsconfig server/tsconfig.json scripts/migrations/backfill-highlight-cache.ts --userId=YOUR_USER_ID
```

**Process limited number of documents (for testing):**

```bash
tsx --tsconfig server/tsconfig.json scripts/migrations/backfill-highlight-cache.ts --limit=10 --dry-run
```

**Custom batch size:**

```bash

```

#### What It Does

For each prompt document without `highlightCache`:

1. Extracts the `optimizedPrompt` or `prompt` text
2. Calls the ML span labeling service (`labelSpans`) to generate highlights
3. Creates a signature hash for cache validation
4. Updates the document with:
   - `highlightCache`: Object containing `spans`, `meta`, `signature`, `timestamp`
   - `versions`: Array with version entry tracking the migration

#### Output

```
🔧 Firestore Highlight Cache Backfill Migration

Configuration:
  Dry Run: ✗ NO (will update Firestore)
  User Filter: ALL USERS
  Batch Size: 5
  Limit: NONE

📥 Fetching documents from Firestore...
✓ Found 42 document(s)

🔄 Processing documents...

[1/42] Processing: abc12345...
    Mode: video
    Created: 2025-10-20T10:30:00.000Z
  📝 Generating highlights for doc abc12345... (456 chars)
    ✓ Updated with 12 spans (signature: 3f7c2a8b)

[2/42] Processing: def67890...
    Mode: default
    Created: 2025-10-21T14:20:00.000Z
    ⊘ Skipped: already-has-cache

...

============================================================
📊 Migration Summary
============================================================
Total documents found:        42
Documents processed:          42
Documents updated:            35 ✓
Documents skipped:            7
  - Already had cache:        5
  - No prompt text:           2
Errors:                       0
============================================================

✓ Migration completed successfully!
```

#### Error Handling

- **Automatic retries**: Failed API calls are retried up to 3 times with 1-second delays
- **Graceful skips**: Documents without prompt text or already having cache are skipped
- **Error tracking**: All errors are logged and counted in the summary

#### Safety Features

- **Dry-run mode**: Test the migration without making changes
- **Idempotent**: Safe to run multiple times (skips already-migrated documents)
- **Progress tracking**: Clear console output showing what's happening
- **Detailed statistics**: Summary report at the end

---

## Best Practices

1. **Always run with `--dry-run` first** to preview changes
2. **Test on limited dataset** using `--limit=10` before full migration
3. **Run during low-traffic periods** to minimize API quota usage
4. **Monitor console output** for errors or unexpected behavior
5. **Back up critical data** before running migrations (Firestore exports)

## Troubleshooting

### "Failed to initialize Firebase Admin"

**Solution**: Make sure you've set up authentication (see Prerequisites above)

### "Permission denied" errors

**Solution**: Your service account needs Firestore read/write permissions. Check IAM roles in Firebase Console.

### Rate limiting / quota errors

### "labelSpans is not a function"

**Solution**: Make sure your server dependencies are installed (`npm install`)

---

## Creating New Migrations

When creating new migration scripts:

1. Copy `backfill-highlight-cache.ts` as a template
2. Use `initializeFirebaseAdmin()` from `firebase-admin-init.ts`
3. Include `--dry-run` flag support
4. Add progress tracking and statistics
5. Handle errors gracefully with retries
6. Document usage in this README
