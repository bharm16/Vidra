# Performance Monitoring Scripts

This directory contains utility scripts for monitoring and verifying the application's performance and configuration.

## Available Scripts

### 1. API Key Verification (`verify-api-keys.ts`)

Validates all configured API keys and tests their response times.

```bash
npm run verify-keys
```

**Features:**

- Validates OpenAI and Groq API keys
- Shows available models for each service
- Tests response times for both APIs
- Provides helpful error messages if keys are invalid

### 2. Highlighting Performance Stats (`get-highlight-stats.ts`)

Extracts and displays real-time performance metrics for text highlighting/span labeling.

```bash
# Run once
npm run highlight-stats

# Continuous monitoring (updates every 5 seconds)
npm run highlight-stats:watch
```

**Prerequisites:**

- App must be running on localhost:5173
- Navigate to a page with highlighting before running for best results

**Metrics Displayed:**

- **Critical Metric**: Total time from prompt input to highlights rendered (target: ≤290ms)
- **Cache Performance**: Hit rate, average response times
- **API Performance**: Call count, response times
- **Optimization Performance**: Draft generation and refinement times
- **Performance Grade**: A+ to C based on critical metric timing

**Performance Grades:**

- **A+**: ≤200ms (Exceptional)
- **A**: 200-290ms (Excellent, meets target)
- **B+**: 290-400ms (Good, slightly over target)
- **B**: 400-600ms (Acceptable)
- **C**: >600ms (Needs optimization)

### Getting Accurate Measurements

1. **Warm up the cache**: Navigate through a few prompts before measuring
2. **Test different scenarios**:
   - Short prompts (1-2 sentences)
   - Long prompts (multiple paragraphs)
   - Complex prompts with many technical terms
3. **Monitor consistently**: Use `npm run highlight-stats:watch` during development

### Interpreting Results

- **Cache Hit Rate**: Should be >70% for optimal performance
  - Low rates indicate first-time prompts or cache invalidation
  - Consider pre-warming cache for common terms

- **API Response Times**:
  - Groq (draft): Should be <500ms for fast draft generation
  - OpenAI (refinement): Typically 1-3 seconds for quality optimization

- **Critical Metric Breakdown**:
  - Text parsing: ~50ms
  - Span identification: ~100ms (cached) or ~400ms (API call)
  - Rendering: ~50-100ms
  - **Target Total**: ≤290ms

### Troubleshooting Performance Issues

If highlighting is slower than expected:

1. **Check cache hit rate**: Low rates mean more API calls
2. **Verify Groq API**: Ensure two-stage optimization is working
3. **Monitor API response times**: Network issues can cause slowdowns
4. **Review browser performance**: Use Chrome DevTools Performance tab
5. **Check for memory leaks**: Long sessions may accumulate memory

## Related Commands

```bash
# View application stats
npm run perf:stats

# Run performance E2E tests
npm run test:e2e:latency
```

## Environment Variables

Ensure these are properly configured in your `.env` file:

- `OPENAI_API_KEY`: Required for prompt optimization
- `GROQ_API_KEY`: Optional but recommended for fast draft generation

## Questions or Issues?

Run `npm run verify-keys` first to ensure your API configuration is correct.

## 4. Capability Registry Sync (`sync-capabilities.ts`)

Pulls model metadata from OpenAI, Luma, Fal, and Google (docs/API where available),
then writes `server/src/services/capabilities/registry.generated.json` for the backend
to load at runtime.

```bash
npm run sync:capabilities
```

**Notes:**

- Uses `.env` in the repo root for API keys (OPENAI_API_KEY, LUMA_API_KEY/LUMAAI_API_KEY, FAL_KEY, GEMINI_API_KEY/GOOGLE_API_KEY).
- Optional override: `npm run sync:capabilities -- --env-file=/path/to/.env`.
- Falls back to manual defaults when provider metadata is unavailable.

