# Force Highlight Rerender - Quick Reference Guide

This guide provides common usage patterns for the `force-highlight-rerender.ts` migration script.

## Common Use Cases

### 1. Algorithm Update Rollout

**Scenario**: You've improved the span labeling algorithm and want all existing prompts to use the new version.

**Recommended Approach**:

```bash
# Step 1: Test on a small sample
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts --limit=10 --dry-run

# Step 2: Clear cache for all prompts (fast, ~1 second per prompt)
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts --mode=clear

# Step 3 (Optional): Regenerate immediately for production
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts --mode=regenerate
```

**Why Clear Mode?**

- Fast execution (~0.04s per document)
- Highlights regenerate automatically when users view prompts
- Lower API costs (only regenerates when needed)
- Users always see highlights immediately (from cache or fresh)

### 2. Pre-Production Warmup

**Scenario**: Before a major release, you want all prompts to have fresh highlights ready.

**Recommended Approach**:

```bash
# Regenerate all highlights immediately
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts --mode=regenerate

# This ensures all prompts have fresh highlights before users access them
```

**When to Use Regenerate Mode?**

- Before major product launches
- After significant algorithm improvements
- When you want guaranteed consistency across all prompts
- During off-peak hours (slower but thorough)

### 3. User-Specific Testing

**Scenario**: Testing new highlighting on a specific user's prompts before rolling out.

```bash
# Dry run first
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts \
  --userId=abc123 \
  --mode=clear \
  --dry-run

# Apply changes
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts \
  --userId=abc123 \
  --mode=clear
```

### 4. Incremental Rollout

**Scenario**: You want to test the impact on a subset of prompts first.

```bash
# Phase 1: Test with 100 prompts
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts \
  --limit=100 \
  --mode=clear \
  --dry-run

tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts \
  --limit=100 \
  --mode=clear

# Phase 2: Monitor for issues, then roll out to all
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts --mode=clear
```

## Mode Comparison

| Feature         | Clear Mode             | Regenerate Mode    |
| --------------- | ---------------------- | ------------------ |
| **Speed**       | Very Fast (~0.04s/doc) | Slower (~2-5s/doc) |
| **API Calls**   | None                   | Immediate          |
| **Best For**    | Regular updates        | Pre-deployment     |
| **User Impact** | Minimal                | None               |
| **Cost**        | Free                   | API costs          |

## Performance Estimates

### Clear Mode

- **Small deployment** (100 prompts): ~4 seconds
- **Medium deployment** (1,000 prompts): ~40 seconds
- **Large deployment** (10,000 prompts): ~7 minutes

### Regenerate Mode

- **Small deployment** (100 prompts): ~5-8 minutes
- **Medium deployment** (1,000 prompts): ~50-80 minutes
- **Large deployment** (10,000 prompts): ~8-13 hours

## Workflow Integration

### Continuous Deployment Pipeline

```bash
# In your CI/CD pipeline after deploying algorithm updates:

# Option 1: Fast clear (recommended)
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts \
  --mode=clear \
  2>&1 | tee logs/highlight-rerender-$(date +%Y%m%d).log

# Option 2: Pre-warm cache (optional, run during off-peak)
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts \
  --mode=regenerate \
  2>&1 | tee logs/highlight-regen-$(date +%Y%m%d).log
```

### Manual Algorithm Update

```bash
# 1. Deploy new algorithm version
git pull origin main
npm run build

# 2. Clear all highlight caches
tsx --tsconfig server/tsconfig.json scripts/migrations/force-highlight-rerender.ts --mode=clear

# 3. (Optional) Backfill any missing highlights
tsx --tsconfig server/tsconfig.json scripts/migrations/backfill-highlight-cache.ts

# Done! Highlights will regenerate with new algorithm on next load
```

## Monitoring & Verification

After running the migration, verify the changes:

```bash
# Check Firestore console for recent version entries
# Look for entries like: "rerender-clear-{timestamp}"

# Or query programmatically:
firebase firestore:query prompts \
  --where "versions[array-contains-any]:[{versionId:rerender-clear}]" \
  --limit 10
```

## Troubleshooting

### "No documents found matching criteria"

**Cause**: Query returned no results.

**Solutions**:

- Remove `--userId` filter to process all users
- Check that documents have existing `highlightCache` fields
- Verify Firebase connection and permissions

### High error count

**Cause**: API failures or invalid prompt data.

**Solutions**:

- Review failed documents in the summary report
- Check API keys and rate limits
- Verify prompt text is valid
- Run with `--limit=10` to isolate issues

### Slow performance in regenerate mode

**Cause**: API rate limiting or network issues.

**Solutions**:

- Run during off-peak hours
- Use `--mode=clear` instead for faster execution
- Consider processing in batches with `--limit`

## Best Practices

1. **Always dry-run first**: Test with `--dry-run` to preview changes
2. **Start small**: Use `--limit=10` for initial testing
3. **Prefer clear mode**: Unless you need immediate regeneration
4. **Monitor logs**: Save output to log files for audit trail
5. **Off-peak execution**: Run large regenerations during low-traffic periods
6. **Version tracking**: Check `versions` array in Firestore for change history

## Safety Checks

The script includes built-in safety features:

- ✅ Dry-run mode prevents accidental changes
- ✅ Only processes documents with existing cache
- ✅ Tracks all changes in document versions
- ✅ Provides detailed error reporting
- ✅ Idempotent (safe to run multiple times)
- ✅ Progress tracking with ETA estimates

## Related Scripts

- **Backfill missing highlights**: `backfill-highlight-cache.ts`
- **Verify API keys**: `verify-api-keys.ts`
- **Performance monitoring**: `get-highlight-stats.ts`

## Questions?

See `scripts/migrations/README.md` for detailed documentation and prerequisites.
