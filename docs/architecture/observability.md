# Observability

This document tracks where production telemetry lives and how to query it.

## Telemetry source discriminator

Every operational event in PostHog carries a `source` property classifying the traffic origin:

| Value       | Meaning                                                                                 |
| ----------- | --------------------------------------------------------------------------------------- |
| `user`      | Real frontend user (`X-Telemetry-Source: user` set by production client builds).        |
| `synthetic` | Pre-launch traffic harness (`scripts/synthetic/`).                                      |
| `ci`        | Continuous integration run (`CI=true` env or explicit `X-Telemetry-Source: ci` header). |
| `dev`       | Local dev server (`NODE_ENV !== "production"` and no override).                         |
| `unknown`   | Production fallback when no signal resolves — a bug signal worth alerting on.           |

Source is resolved once per request by [`telemetrySourceMiddleware`](../../server/src/middleware/telemetrySource.ts) and stamped on every event automatically by `PostHogClient.capture()`. Telemetry services don't pass source explicitly — it's a cross-cutting concern, added at the infrastructure layer.

Header precedence over inference. Inference order: `CI=true` env → `"ci"`; otherwise `NODE_ENV === "production"` → `"unknown"`, else `"dev"`. The shared `TelemetrySource` union and `TELEMETRY_SOURCE_HEADER` constant live in [`shared/types/telemetry.ts`](../../shared/types/telemetry.ts) and are imported by both the server middleware, the client interceptor, and the synthetic harness.

`dogfood` is reserved for future use (team-member traffic distinguished from real-stranger traffic) and is **not active pre-launch** — Vidra has no real users yet. Adding `dogfood` later is roughly half a day (enum value + `DOGFOOD_UIDS` env var + middleware check) and isn't needed until real users arrive.

## Content fields (quality review, not just counts)

Every operational event now carries **content fields** alongside the operational metadata, so dashboards can show what the model actually produced — not just how often or how fast. Without these, "count distribution" tiles were the only quality signal, which isn't a quality signal at all.

| Event                   | Content fields added                                                       | What you can see                                                                      |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `optimize.completed`    | `inputPrompt`, `outputPrompt` (null on error/abort)                        | Side-by-side: what the user wrote vs the final optimized output.                      |
| `suggestions.completed` | `highlightedText`, `fullPrompt`, `suggestions` (string[])                  | Selected text + category + the alternative phrases returned.                          |
| `label-spans.completed` | `inputText`, `spans` (`Array<{text, category}>`)                           | Each labeled span (text + category) the model returned, alongside the full input.     |
| `eval.completed`        | `examples?` (per-prompt array, polymorphic by `evalType`)                  | Per-prompt predicted vs ground-truth spans (F1), or judge total + notes (judge eval). |
| `quality.scored`        | `reasoning`, `dimensions`, `totalScore`, `scoredEventId` (joins to source) | LLM judge output linked back to the source event so dashboards can sort by quality.   |

**HogQL patterns for content tiles:**

- Non-exploded ("recent N calls with content"): `SELECT properties.spans FROM events WHERE event = 'label-spans.completed' LIMIT 30` — the array renders as JSON in the table cell.
- Exploded ("one row per span/suggestion/example"): `ARRAY JOIN JSONExtractArrayRaw(assumeNotNull(toString(properties.spans))) AS span`, then `JSONExtractString(span, 'text')`. The `assumeNotNull` is required — PostHog wraps property access in `Nullable` and `ARRAY JOIN` rejects nullable arrays.
- For plain-string arrays (like `suggestions`): `JSONExtractString(suggestion)` with **no JSONPath argument** strips the surrounding quotes from the raw JSON string element.

**Privacy note:** content fields put prompt text + LLM output into PostHog. Pre-launch this is fine (only Bryce + harness traffic). When real users arrive, a redaction policy is needed — likely a `REDACT_CONTENT_FIELDS=true` env var that replaces content with hashes server-side before emit, or per-field allow-listing.

## T2V Optimize Health (PostHog)

**Project:** [Default project (id `417445`)](https://us.posthog.com/project/417445) inside the **Vidra** organization (slug `vidra`). This project is dedicated to backend optimize-pipeline telemetry — separate from the NextReel org's `Default project` (id `399973`) which receives client-side product analytics.

**Dashboard:** [T2V Optimize Health (id `1565688`)](https://us.posthog.com/project/417445/dashboard/1565688)

**What it answers:** where is the time going on each `/api/optimize` call, what's the LLM call count, cache hit rate, outcome distribution, and per-model latency.

### Tiles

| Tile                              | Insight ID | URL                                                             |
| --------------------------------- | ---------- | --------------------------------------------------------------- |
| Optimize duration over time (avg) | `bzjLNbOL` | [view](https://us.posthog.com/project/417445/insights/bzjLNbOL) |
| Per-stage avg latency             | `0kIMg93G` | [view](https://us.posthog.com/project/417445/insights/0kIMg93G) |
| Outcome breakdown                 | `vlokRJzW` | [view](https://us.posthog.com/project/417445/insights/vlokRJzW) |
| LLM calls per Optimize click      | `oGToOJ17` | [view](https://us.posthog.com/project/417445/insights/oGToOJ17) |
| Cache hit rate                    | `XoNJNWiQ` | [view](https://us.posthog.com/project/417445/insights/XoNJNWiQ) |
| Avg duration by target model      | `rJ3JVWWL` | [view](https://us.posthog.com/project/417445/insights/rJ3JVWWL) |
| Recent Optimize calls (last 50)   | `GetT3sOp` | [view](https://us.posthog.com/project/417445/insights/GetT3sOp) |
| Recent input → output (quality)   | `bhJKbPOp` | [view](https://us.posthog.com/project/417445/insights/bhJKbPOp) |

### Event schema (`optimize.completed`)

Emitted once per `/api/optimize` call by `OptimizeTelemetryService` (see `server/src/services/observability/OptimizeTelemetryService.ts`). The schema is locked by a snapshot test at `server/src/services/observability/__tests__/optimize-event-schema.snapshot.test.ts` — changes to the property set are visible in PR diffs.

Top-level event properties:

- `requestId` — `req.id`, correlation key for cross-system traces
- `userId` — Firebase UID, or `null` for anonymous (matched by `distinctId = "anon-<uuid>"`)
- `outcome` — `"success" | "error" | "aborted"`
- `errorMessage` / `errorStage` — present only when `outcome !== "success"`
- `durationMs` — wall-clock end-to-end (integer ms)
- `llmCallCount` — incremented at each `aiService.execute` call site within `optimizeFlow.ts`
- `cacheHit` — boolean; when `true`, all `stages.*` are `null`
- `targetModel` — the requested compilation target (e.g. `"sora-2"`, `"kling-2.5"`); `null` for generic optimization
- `mode` — currently always `"video"`
- `promptLength`, `outputLength`, `lockedSpanCount`, `hasContext`, `hasBrainstormContext`, `hasShotPlan`, `useConstitutionalAI` — input-shape dimensions for cohort analysis
- `stages` — nested object of per-stage timings (or `null` if the stage was skipped):
  - `shotInterpreterMs`, `strategyOptimizeMs`, `constitutionalMs`, `intentLockMs`, `compilationMs`, `promptLintMs`

### Configuration

Telemetry is gated by the presence of `POSTHOG_API_KEY` in the server environment. When unset, `OptimizeTelemetryService` uses a no-op stub and no events are emitted — local dev works unchanged.

| Environment | `POSTHOG_API_KEY`                                               | `POSTHOG_HOST`             |
| ----------- | --------------------------------------------------------------- | -------------------------- |
| Local dev   | unset (no-op) — or set to the Vidra project key for testing     | `https://us.i.posthog.com` |
| Staging     | unset (decide before staging deploy)                            | n/a                        |
| Production  | set to the Vidra `Default project` key (begins `phc_pmJDnB...`) | `https://us.i.posthog.com` |

The full key lives in your `.env`; PostHog rotates `phc_` keys via the Settings UI if compromise is suspected.

### How to query

Use the PostHog MCP (`mcp__posthog__query-run` with a `HogQLQuery`) or the PostHog SQL editor. Example:

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  avg(properties.durationMs) AS avg_ms,
  quantile(0.95)(properties.durationMs) AS p95_ms,
  count() AS calls
FROM events
WHERE event = 'optimize.completed'
GROUP BY day
ORDER BY day DESC
LIMIT 30
```

Make sure the MCP is in the right project context first:

```
mcp__posthog__switch-organization 019e1071-cc96-0000-e1ef-1ccfb297b6c0  # Vidra
mcp__posthog__switch-project       417445                                 # Default project
```

### Related design docs

- Spec: [`docs/superpowers/specs/2026-05-09-t2v-optimize-telemetry-design.md`](../superpowers/specs/2026-05-09-t2v-optimize-telemetry-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-05-09-t2v-optimize-telemetry.md`](../superpowers/plans/2026-05-09-t2v-optimize-telemetry.md)

### Open follow-ups

- ✅ **Approach C — per-LLM-call events** — done; see "Per-LLM-call telemetry (`llm.call.completed`)" below.
- ✅ **M3b — suggestions / enhance endpoints** — done; see "Suggestions telemetry (`suggestions.completed`)" below.
- ✅ **Prom-client cleanup** — done in `9d9698a5`. The `/metrics` and `/stats` endpoints and `MetricsService.ts` are gone.
- **Production deploy env var** — `POSTHOG_API_KEY` is currently set in local `.env` only. To begin capturing real production traffic, the same key needs to be set in the production deploy environment (deploy platform TBD).
- **Live PostHog smoke test** — once `POSTHOG_API_KEY` is wired in production, fire one optimize click + one click-to-enhance and confirm `optimize.completed`, `llm.call.completed`, and `suggestions.completed` events all land in project `417445`.
- **Dashboard tiles for the new events** — the T2V Optimize Health dashboard does not yet surface `llm.call.completed` or `suggestions.completed`. Add tiles once enough events have accrued to be useful (per-provider duration, LLM cost-per-click, suggestions cache hit rate, suggestions latency over time).

---

## Per-LLM-call telemetry (`llm.call.completed`)

**What it answers:** which provider/model is each LLM hop using, how long does it take, how many tokens does it consume, and which calls error out. One event fires per `aiService.execute` invocation — a single `/api/optimize` request typically generates 2–4 of these.

**Project / dashboard:** Same project as Optimize (`417445`). Surfaced on [LLM Calls Health (id `1571045`)](https://us.posthog.com/project/417445/dashboard/1571045) — per-`executionType` breakdown so each LLM hop is independently measurable. See that section below for the tile inventory.

### Event schema

Emitted by `LlmCallTelemetryService.record` (see [`server/src/services/observability/LlmCallTelemetryService.ts`](../../server/src/services/observability/LlmCallTelemetryService.ts)). The wrapper that calls `record` is in `AIModelService.execute`, where stage timing is captured in a `try / finally` so even thrown errors emit a final event.

The schema is locked by a snapshot test at [`server/src/services/observability/__tests__/llm-call-event-schema.snapshot.test.ts`](../../server/src/services/observability/__tests__/llm-call-event-schema.snapshot.test.ts) — changes to the property set are visible in PR diffs (matches the `optimize.completed` and `suggestions.completed` pattern).

Top-level event properties:

- `executionType` — caller-supplied string identifying the call site (e.g. `"image_observation"`, optimize-stage names)
- `provider` — `"openai" | "groq" | "gemini"`, or `null` if the underlying call failed before resolving
- `model` — concrete model id (e.g. `"gpt-4o-mini-2024-07-18"`); `null` on early failure
- `durationMs` — wall-clock LLM call duration (integer ms)
- `promptTokens`, `completionTokens`, `totalTokens` — token counts from the provider response; `null` when usage is not reported
- `finishReason` — provider-supplied stop reason (e.g. `"stop"`, `"length"`, `"tool_calls"`); `null` when not provided
- `outcome` — `"success" | "error"`
- `errorMessage` — present only when `outcome === "error"`
- `requestId` — present only when the call originated inside an HTTP request (set via AsyncLocalStorage in `requestIdMiddleware`). Out-of-request calls omit the field so they can be distinguished in queries.
- `userId` — Firebase UID, or `null` for system / out-of-request calls (the `distinctId` falls back to `"system"` in that case)

### How to query

Top-level cost / latency by provider over a recent window:

```sql
SELECT
  properties.provider AS provider,
  properties.model AS model,
  count() AS calls,
  avg(properties.durationMs) AS avg_ms,
  quantile(0.95)(properties.durationMs) AS p95_ms,
  sum(properties.totalTokens) AS total_tokens
FROM events
WHERE event = 'llm.call.completed'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY provider, model
ORDER BY calls DESC
```

Correlate an `optimize.completed` slow tail with its underlying LLM hops by joining on `requestId`:

```sql
SELECT
  llm.properties.executionType AS stage,
  llm.properties.provider AS provider,
  llm.properties.durationMs AS llm_ms,
  opt.properties.durationMs AS total_ms
FROM events AS llm
JOIN events AS opt
  ON llm.properties.requestId = opt.properties.requestId
WHERE llm.event = 'llm.call.completed'
  AND opt.event = 'optimize.completed'
  AND opt.properties.durationMs > 5000
ORDER BY opt.timestamp DESC
LIMIT 100
```

---

## Suggestions telemetry (`suggestions.completed`)

**What it answers:** how long does click-to-enhance take per request, what's the cache hit rate, how many suggestions come back, which engine mode ran, and which span category was selected. One event fires per `POST /api/enhancement/suggestions` request.

**Project / dashboard:** Same project as Optimize (`417445`). Surfaced on [Suggestions Health (id `1571039`)](https://us.posthog.com/project/417445/dashboard/1571039) — see that section below for the tile inventory.

### Event schema

Emitted by `SuggestionsTelemetryService.SuggestionsTrace.complete` (see [`server/src/services/observability/SuggestionsTelemetryService.ts`](../../server/src/services/observability/SuggestionsTelemetryService.ts)). The trace is constructed by the route handler in [`server/src/routes/enhancement/enhancementSuggestionsRoute.ts`](../../server/src/routes/enhancement/enhancementSuggestionsRoute.ts) and threaded through `EnhancementService.getEnhancementSuggestions`, which records stage timings, cache hits, and the final outcome.

The schema is locked by a snapshot test at [`server/src/services/observability/__tests__/suggestions-event-schema.snapshot.test.ts`](../../server/src/services/observability/__tests__/suggestions-event-schema.snapshot.test.ts) — changes to the property set show up in PR diffs.

Top-level event properties:

- `requestId` — `req.id`, correlation key for cross-system traces
- `userId` — Firebase UID, or `null` for anonymous (matched by `distinctId = "anon-<uuid>"`)
- `outcome` — `"success" | "error"` (no `"aborted"` path on this endpoint today)
- `errorMessage` / `errorStage` — present only when `outcome === "error"`; `errorStage` is one of `"video_context" | "span_context" | "cache" | "v2_engine" | "post_processing"`
- `durationMs` — wall-clock end-to-end (integer ms)
- `cacheHit` — boolean; when `true`, the v2 engine was skipped and `stages.v2EngineMs` / `postProcessingMs` are `null`
- `suggestionCount` — total returned suggestions (handles both flat-array and grouped-array response shapes)
- `highlightedCategory` — the labeled-span category clicked (e.g. `"lighting"`, `"camera.movement"`); `null` when no category was provided
- `isVideoPrompt`, `isPlaceholder` — input-shape flags for cohort analysis
- `modelTarget`, `promptSection`, `phraseRole`, `categoryId` — derived context from the span / video prompt detection
- `engineMode` — `"guided_llm" | "fallback" | null` (path the v2 engine took)
- `modelCallCount` — number of `aiService.execute` calls made for this request (typically 1; >1 when a rescue call fired)
- `fallbackApplied` — `true` when the result came from the fallback path
- `policyVersion` — engine policy version active at request time (e.g. `"2026-03-v2a"`)
- `promptLength` — input prompt char length
- `debug` — `true` when the request was made with the `x-debug: true` header (dev only)
- `stages` — nested object of per-stage timings (or `null` if the stage was skipped):
  - `videoContextMs`, `spanContextMs`, `cacheCheckMs`, `v2EngineMs`, `postProcessingMs`

### How to query

Latency and cache hit rate by day:

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  countIf(properties.cacheHit) / count() AS cache_hit_rate,
  avg(properties.durationMs) AS avg_ms,
  quantile(0.95)(properties.durationMs) AS p95_ms,
  count() AS calls
FROM events
WHERE event = 'suggestions.completed'
  AND timestamp > now() - INTERVAL 14 DAY
GROUP BY day
ORDER BY day DESC
```

Per-category outcome breakdown (where are users hitting errors?):

```sql
SELECT
  properties.highlightedCategory AS category,
  properties.outcome AS outcome,
  count() AS n
FROM events
WHERE event = 'suggestions.completed'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY category, outcome
ORDER BY n DESC
```

---

## Eval telemetry (`eval.completed`)

**What it answers:** how often does each eval run, what does it produce, when does it regress. One event fires per `scripts/evaluation/*` run (passing, regressing, or setup-error). Three discriminator values today: `span_labeling_judge`, `span_labeling_f1`, `recommendation`.

**Project / dashboard:** Same project as Optimize (`417445`). Dashboard ["Eval Health" (id `1567504`)](https://us.posthog.com/project/417445/dashboard/1567504).

### Tiles

| Tile                                         | Insight ID | URL                                                             |
| -------------------------------------------- | ---------- | --------------------------------------------------------------- |
| Latest eval runs                             | `0ielZbLB` | [view](https://us.posthog.com/project/417445/insights/0ielZbLB) |
| F1 outcome breakdown (span_labeling_f1)      | `Wd430XAy` | [view](https://us.posthog.com/project/417445/insights/Wd430XAy) |
| Judge avg score trend (span_labeling_judge)  | `cFTTiOQg` | [view](https://us.posthog.com/project/417445/insights/cFTTiOQg) |
| Judge score distribution by day              | `yYJvMSB6` | [view](https://us.posthog.com/project/417445/insights/yYJvMSB6) |
| Recommendation drift events                  | `7BQcqEsc` | [view](https://us.posthog.com/project/417445/insights/7BQcqEsc) |
| Per-category F1 over time (span_labeling_f1) | `RGAb2MH4` | [view](https://us.posthog.com/project/417445/insights/RGAb2MH4) |
| Setup error count (24h)                      | `VJnURwpV` | [view](https://us.posthog.com/project/417445/insights/VJnURwpV) |
| Gate failure count (24h)                     | `icjwJljU` | [view](https://us.posthog.com/project/417445/insights/icjwJljU) |
| F1 examples — predicted vs ground-truth      | `yCPKQxN3` | [view](https://us.posthog.com/project/417445/insights/yCPKQxN3) |
| Judge examples — prompts, spans, scores      | `hG3zqiHs` | [view](https://us.posthog.com/project/417445/insights/hG3zqiHs) |

Tiles are built as `DataVisualizationNode` over HogQL. Visualization type (table/line/bar/donut) is selectable per-tile in the UI; the query defines the data shape, the user picks the chart.

### Alerts

| Alert                                 | Insight (Trends version)                                              | Trigger                                               | Status   |
| ------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- | -------- |
| Eval setup error in last 24h          | [`zpHsNS5k`](https://us.posthog.com/project/417445/insights/zpHsNS5k) | `outcome = "setup_error"` count > 0 in 24h            | Active   |
| Eval gate failure streak (> 2 in 24h) | [`oWlELANW`](https://us.posthog.com/project/417445/insights/oWlELANW) | `outcome = "regression"` count > 2 in 24h             | Active   |
| F1 regression — any category          | TBD                                                                   | Any `perCategoryF1[*]` drops > 5% run-over-run        | Deferred |
| Judge avg score regression            | TBD                                                                   | `metrics.avgScore` drops > 0.5 from rolling 7-day avg | Deferred |

The two deferred alerts need anomaly-detection configuration (relative_decrease against historical data) and so make more sense to wire after sufficient real data accumulates. The two active alerts use threshold-based detection on absolute count and work from day one.

PostHog's alert engine only supports `TrendsQuery` insights, not `DataVisualizationNode`/HogQL. The dashboard tiles (HogQL) and alert sources (TrendsQuery) are therefore separate insights even when measuring the same thing — see the `Setup error count (24h)` HogQL tile vs the `Setup error trend (alertable)` TrendsQuery insight that the alert points at.

### Event schema

Emitted by [`scripts/evaluation/posthog-emitter.ts`](../../scripts/evaluation/posthog-emitter.ts). The schema is locked by snapshot tests at [`scripts/evaluation/__tests__/eval-event-schema.snapshot.test.ts`](../../scripts/evaluation/__tests__/eval-event-schema.snapshot.test.ts) — one snapshot per `evalType`.

Top-level event properties:

- `evalType` — `"span_labeling_judge" | "span_labeling_f1" | "recommendation"` — discriminator for the polymorphic `metrics` shape
- `outcome` — `"passed" | "regression" | "setup_error"`
- `errorMessage` — present only when `outcome !== "passed"`
- `commit` — Git SHA the eval ran against; `"unknown"` if not provided
- `runId` — present only when run from GitHub Actions (matches `GITHUB_RUN_ID`)
- `provider` — `"groq" | "openai" | null` for span-labeling evals; absent for recommendation
- `sourceFile` — path to prompt fixture (optional)
- `durationMs`, `promptCount`, `errorCount` — wall-clock + counts
- `metrics` — polymorphic by `evalType`:
  - `span_labeling_judge` → `{ avgScore, maxScore: 25, scoreDistribution, avgCategoryScores?, latencyStats?, judgeModel }`
  - `span_labeling_f1` → `{ overallF1, overallPrecision, overallRecall, perCategoryF1, baselineCommit? }`
  - `recommendation` → `{ driftDetectedCount, totalPrompts, newPromptsCount, baselineName }`

`distinctId` convention: `ci-<GITHUB_RUN_ID>` in CI, `local-<username>` locally, `anon-<uuid>` fallback. Use `distinctId LIKE 'ci-%'` to filter CI-only runs in dashboards.

### How to query

Outcome breakdown last 7 days:

```sql
SELECT
  properties.evalType AS evalType,
  properties.outcome AS outcome,
  count() AS n
FROM events
WHERE event = 'eval.completed'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY evalType, outcome
ORDER BY evalType, outcome
```

Overall F1 trend by day:

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  avg(properties.metrics.overallF1) AS avg_f1,
  count() AS runs
FROM events
WHERE event = 'eval.completed'
  AND properties.evalType = 'span_labeling_f1'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY day
ORDER BY day DESC
```

### Open follow-ups

- **`POSTHOG_API_KEY` repo secret** — must be added in GitHub Settings → Secrets and variables → Actions before the nightly workflow can emit events. Same value as the server's production env (`phc_pmJDnB...`). Until this lands, the dashboard tiles for `span_labeling_judge` and `span_labeling_f1` will only have local-dev data.
- **F1 / judge regression alerts** — two deferred alerts in the Alerts table above; meaningful only after sufficient `span_labeling_*` events accumulate to threshold against.
- **Recommendation eval cron** — currently manual; add a workflow to run on schedule once dashboard signal is interesting.
- **CI smoke verification** — once the repo secret is set, trigger `gh workflow run "Span Labeling Golden-Set Eval" --ref main -f provider=groq` and confirm the resulting event has a `runId` matching the workflow's `GITHUB_RUN_ID`. This is plan task 9's CI-portion closure.

---

## Quality telemetry (`quality.scored`)

An LLM judge (GPT-4o-2024-08-06) runs nightly via [`scripts/quality-judge/run-judge.ts`](../../scripts/quality-judge/run-judge.ts). For each recent `optimize.completed` / `suggestions.completed` / `label-spans.completed` event with `source IN ('synthetic','dogfood','user')`, it loads the surface's markdown rubric, scores 5 dimensions 0–5, and emits one `quality.scored` event linked back to the source via `scoredEventId`.

Pre-launch (per the [Measurement Program](../superpowers/programs/measurement.md)) this is the primary quality signal: with zero real users, we judge the output ourselves.

### Event schema

[`scripts/quality-judge/judge-event-types.ts`](../../scripts/quality-judge/judge-event-types.ts) is the source of truth. Locked by [`judge-event-schema.snapshot.test.ts`](../../scripts/quality-judge/__tests__/judge-event-schema.snapshot.test.ts).

| Property          | Meaning                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `scoredEvent`     | The source event name (`optimize.completed`, `suggestions.completed`, `label-spans.completed`)                 |
| `scoredEventId`   | PostHog `uuid` of the source event — join key                                                                  |
| `surface`         | `optimize` / `suggestions` / `span-labeling`                                                                   |
| `rubricVersion`   | 8-char sha256 prefix of the rubric markdown content; bumps on rubric change                                    |
| `judgeModel`      | `gpt-4o-2024-08-06`                                                                                            |
| `judgeDurationMs` | Wall-clock judge latency                                                                                       |
| `judgeCostUsd`    | OpenAI cost from `tokensIn × $/1K + tokensOut × $/1K` ([`pricing.ts`](../../scripts/quality-judge/pricing.ts)) |
| `totalScore`      | Sum of 5 dimensions, 0–25                                                                                      |
| `dimensions`      | Per-surface keyed object, each value 0–5 integer                                                               |
| `reasoning`       | Verbatim LLM judge explanation                                                                                 |
| `source`          | Carried from the source event                                                                                  |

### Dashboard tiles

> **PENDING — Task 15.** Dashboard tile authoring is blocked on real `quality.scored` events existing in PostHog. After the calibration sets are hand-authored and the first nightly judge run lands events, fill in the tile IDs below via PostHog MCP. See plan Task 15 in `docs/superpowers/plans/2026-05-12-llm-judge-framework.md` for the tile specs.

| Dashboard            | Tile A (trend) | Tile B (low scorers) | Tile C (quality vs cost) |
| -------------------- | -------------- | -------------------- | ------------------------ |
| T2V Optimize Health  | `<tile-id-A1>` | `<tile-id-B1>`       | `<tile-id-C1>`           |
| Suggestions Health   | `<tile-id-A2>` | `<tile-id-B2>`       | `<tile-id-C2>`           |
| Span Labeling Health | `<tile-id-A3>` | `<tile-id-B3>`       | `<tile-id-C3>`           |

### Calibration

The judge is gated by hand-scored calibration sets ([`scripts/quality-judge/calibration/<surface>.calibration.json`](../../scripts/quality-judge/calibration/)) — Spearman ρ ≥ 0.7 against human scores. Re-run weekly:

```bash
OPENAI_API_KEY=sk-... npm run judge:calibrate
```

Any PR touching `scripts/quality-judge/rubrics/**` or `**/calibration/**` runs this in CI (`quality-judge-calibration.yml`) and cannot merge below the threshold. If a weekly local run drops below ρ=0.6 for a surface, re-author calibration entries or revise the rubric.

### How to query

Per-surface 7-day average score trend:

```sql
SELECT
  surface,
  toDate(timestamp) AS day,
  avg(toFloat(properties.totalScore)) AS avg_score
FROM events
WHERE event = 'quality.scored'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY surface, day
ORDER BY day ASC
```

Worst-scoring optimize outputs in the last 24h, joined back to source content:

```sql
SELECT
  q.properties.totalScore,
  q.properties.reasoning,
  s.properties.inputPrompt,
  s.properties.outputPrompt
FROM events q
JOIN events s ON s.uuid = q.properties.scoredEventId
WHERE q.event = 'quality.scored'
  AND q.properties.surface = 'optimize'
  AND q.timestamp > now() - INTERVAL 24 HOUR
ORDER BY toInt(q.properties.totalScore) ASC
LIMIT 10
```

---

## Suggestions Health (PostHog)

**Dashboard:** [Suggestions Health (id `1571039`)](https://us.posthog.com/project/417445/dashboard/1571039)

**What it answers:** how long does click-to-enhance take per request, what's the cache hit rate, how many suggestions come back, which category is being enhanced, which `errorStage` is the biggest failure source. One tile per question.

### Tiles

| Tile                                | Insight ID | URL                                                             |
| ----------------------------------- | ---------- | --------------------------------------------------------------- |
| Duration over time (avg / p95)      | `ERU8lSYh` | [view](https://us.posthog.com/project/417445/insights/ERU8lSYh) |
| Cache hit rate                      | `3tso7anm` | [view](https://us.posthog.com/project/417445/insights/3tso7anm) |
| Outcome breakdown                   | `WvmLNOMP` | [view](https://us.posthog.com/project/417445/insights/WvmLNOMP) |
| Errors by errorStage                | `ZQlKwBi8` | [view](https://us.posthog.com/project/417445/insights/ZQlKwBi8) |
| Suggestions returned (distribution) | `hwChFlIs` | [view](https://us.posthog.com/project/417445/insights/hwChFlIs) |
| Per-category breakdown              | `9eqWssAw` | [view](https://us.posthog.com/project/417445/insights/9eqWssAw) |
| Recent 50 calls                     | `6kCPJnPv` | [view](https://us.posthog.com/project/417445/insights/6kCPJnPv) |
| Recent suggestions (quality)        | `JxAnTP5L` | [view](https://us.posthog.com/project/417445/insights/JxAnTP5L) |
| Suggestions exploded (one per row)  | `hfthQdB3` | [view](https://us.posthog.com/project/417445/insights/hfthQdB3) |

All tiles are `DataVisualizationNode` over HogQL against `suggestions.completed` events.

---

## Span Labeling Health (PostHog)

**Dashboard:** [Span Labeling Health (id `1571040`)](https://us.posthog.com/project/417445/dashboard/1571040)

**What it answers:** how long does `/llm/label-spans` take per call, what's the cache hit rate, which provider handled it, how many spans were returned, error breakdown by stage.

### Tiles

| Tile                           | Insight ID | URL                                                             |
| ------------------------------ | ---------- | --------------------------------------------------------------- |
| Duration over time (avg / p95) | `pBWbfDIo` | [view](https://us.posthog.com/project/417445/insights/pBWbfDIo) |
| Cache hit rate                 | `EAcRTM10` | [view](https://us.posthog.com/project/417445/insights/EAcRTM10) |
| Outcome breakdown              | `z0WjrrCj` | [view](https://us.posthog.com/project/417445/insights/z0WjrrCj) |
| Provider breakdown             | `3lmYpFIR` | [view](https://us.posthog.com/project/417445/insights/3lmYpFIR) |
| Errors by errorStage           | `ZjhgZ0Fz` | [view](https://us.posthog.com/project/417445/insights/ZjhgZ0Fz) |
| Recent 50 calls                | `9qQIbiOm` | [view](https://us.posthog.com/project/417445/insights/9qQIbiOm) |
| Recent outputs (quality)       | `QOYQG6mB` | [view](https://us.posthog.com/project/417445/insights/QOYQG6mB) |
| Spans exploded by category     | `O6kY1HlU` | [view](https://us.posthog.com/project/417445/insights/O6kY1HlU) |

### Event schema (`label-spans.completed`)

Emitted once per `/llm/label-spans` request by [`SpanLabelingTelemetryService`](../../server/src/services/observability/SpanLabelingTelemetryService.ts). Schema locked by a snapshot test at [`label-spans-event-schema.snapshot.test.ts`](../../server/src/services/observability/__tests__/label-spans-event-schema.snapshot.test.ts).

Top-level event properties:

- `requestId` — `req.id`, correlation key
- `userId` — Firebase UID, or `null` for anonymous (matched by `distinctId = "anon-<uuid>"`)
- `source` — added automatically by the PostHogClient wrapper; one of `user`/`synthetic`/`ci`/`dev`/`unknown`
- `outcome` — `"success" | "error"`
- `errorMessage` / `errorStage` — present only when `outcome === "error"`; `errorStage` is one of `"validation" | "llm_call" | "cache" | "post_processing"`
- `durationMs` — wall-clock end-to-end (integer ms)
- `promptLength` — input character count
- `spanCount` — labeled spans returned (0 on error)
- `cacheHit` — boolean. Only TTL cache hits count; request-coalescing single-flight (`X-Cache: COALESCED`) does **not** set this flag.
- `provider` — `string | null` (LLM provider name as reported by the underlying client; intentionally not narrowed)
- `model` — concrete model id, or `null` on early failure

---

## LLM Calls Health (PostHog)

**Dashboard:** [LLM Calls Health (id `1571045`)](https://us.posthog.com/project/417445/dashboard/1571045)

**What it answers:** per-`executionType` health for every LLM hop in the system (image observation, strategy optimize, constitutional, suggestions engine, span labeling, etc.). Surfaces latency, error rate, and token cost independently per call type — so a single regression in (e.g.) the constitutional stage is visible without being averaged into a per-surface tile.

### Tiles

| Tile                             | Insight ID | URL                                                             |
| -------------------------------- | ---------- | --------------------------------------------------------------- |
| Calls by executionType over time | `BjpowD5I` | [view](https://us.posthog.com/project/417445/insights/BjpowD5I) |
| p95 latency by executionType     | `iePOeLxo` | [view](https://us.posthog.com/project/417445/insights/iePOeLxo) |
| Error rate by executionType      | `BTkvc18K` | [view](https://us.posthog.com/project/417445/insights/BTkvc18K) |
| Total tokens by executionType    | `rzguuD0B` | [view](https://us.posthog.com/project/417445/insights/rzguuD0B) |
| Token use by provider × model    | `KXkzJ894` | [view](https://us.posthog.com/project/417445/insights/KXkzJ894) |

The underlying event is `llm.call.completed` (documented above); see that section for the full property schema. The dashboards use the `executionType` property as the per-tile breakdown dimension.

---

## Sub-project #1 alerts and follow-ups

Sub-project #1 of the [Measurement Program](../superpowers/programs/measurement.md) ships **no live alerts**. Two alerts were specified in the design (`unknown`-in-production ratio and "synthetic harness silent"), and both are intentionally deferred for the same reason: Vidra has no deployed production environment yet, so production-traffic-based thresholds have nothing to compute against and the CI cron is committed-but-disabled.

| Alert                          | Trigger                                                                                                                         | Status                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Source `unknown` in production | Among `optimize.completed` events with `distinctId NOT LIKE 'synthetic-%'`, share with `source = 'unknown'` exceeds 1% over 24h | Deferred — needs production traffic baseline |
| Synthetic harness silent       | Count of events with `distinctId LIKE 'synthetic-%'` over 24h is zero                                                           | Deferred — needs the CI cron enabled         |

Wire both when production deploys and the CI cron is uncommented in `.github/workflows/synthetic-harness.yml`.

### Follow-ups

- **T2V Optimize Health default-view filter** — when the harness starts producing data regularly, add a `properties.source != 'synthetic'` dashboard-level filter to dashboard `1565688` so synthetic runs don't dominate the average. Deferring until there's actual data to be polluted by.
- **Sibling "T2V Optimize — Synthetic" dashboard** — when worth its weight, duplicate dashboard `1565688` with `properties.source = 'synthetic'` filter so harness performance can be tracked independently.
- **Production deploy** — the prerequisite that unlocks the two deferred alerts and the CI cron in `synthetic-harness.yml`.
- **End-to-end harness validation** — running `npm run synthetic` against a local server (with `POSTHOG_API_KEY` set in the server's env) is the day-one validation that the source-stamping pipeline works end-to-end. Plan task 19.
