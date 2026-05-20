# Async Job Unification — Migration Plan

**Status:** Proposed
**Owner:** backend platform
**Depends on:** Removal of `VIDEO_JOB_INLINE_ENABLED` (shipped prior to this plan)

## Why this plan exists

The Vidra backend has one good answer for long-running provider calls — the firestore-backed job system in `server/src/services/video-generation/jobs/` — and applies it to exactly one feature (video generation). At least two other features that do the same kind of work — image preview generation (Flux Schnell, 15-30s) and continuity shot generation (30-120s+) — block the HTTP request thread synchronously instead.

The result is three different shapes for the same problem:

| Feature                    | Transport               | Latency  | Durable? | Retry?      | Client poll?       |
| -------------------------- | ----------------------- | -------- | -------- | ----------- | ------------------ |
| Video generation           | 202 + job record + poll | 30s–5min | Yes      | Yes         | Yes                |
| Image generation (Flux)    | sync HTTP               | 15–30s   | No       | Inline only | No (request hangs) |
| Continuity shot generation | sync HTTP               | 30–120s+ | No       | No          | No                 |

This plan takes the existing video job system, generalizes it into a reusable `JobEngine` with pluggable handlers, and migrates the other two features onto it. Refund state — today stranded in a separate `RefundFailureStore` with its own sweeper worker — becomes a property of the job record, collapsing one background worker into the job state machine.

## Non-goals

- **Not changing the client-server transport shape of non-async endpoints.** Prompt optimization (SSE), span labeling, enhancement, model intelligence — all stay as they are. They complete fast enough to not need durability.
- **Not introducing event-driven queue infrastructure.** No pub/sub, no firestore triggers. Continue with the existing claim-and-poll model; revisit only if firestore read cost becomes a measurable problem.
- **Not touching external reconcilers.** The Stripe webhook replay worker, the Stripe invoice reconciler, and the GCS asset reconciler consume external event streams and are correctly independent of the internal job pipeline.

## End state

```
┌────────────────────────────────────────────────────────────────┐
│ POST /api/jobs/{type}      →  202 { jobId }                   │
│   idempotency, credit reservation, job record created atomic  │
│ GET  /api/jobs/:id         →  poll (REST)                     │
│ GET  /api/jobs/:id/events  →  SSE (progress, result, errors)  │
│   (optional) firestore listener directly from client          │
└───────────────────────┬───────────────────────────────────────┘
                        │
             ┌──────────▼────────────────┐
             │  firestore: jobs/{jobId}  │
             │    type, status,          │
             │    refundStatus,          │
             │    leasedBy, leaseExpiry, │
             │    attempts, lastError,   │
             │    input, result          │
             └──────────┬────────────────┘
                        │
        ┌───────────────┴──────────────────┐
        │                                  │
┌───────▼──────────┐              ┌────────▼─────────┐
│ JobEngine (api)  │              │ JobEngine (wkr)  │
│  low concurrency │              │ high concurrency │
│  fresh-job boost │              │  polling loop    │
└───────┬──────────┘              └────────┬─────────┘
        │                                  │
        └────────────────┬─────────────────┘
                         │
              ┌──────────▼──────────────┐
              │ HandlerRegistry         │
              │   videoHandler          │
              │   imageHandler          │
              │   continuityShotHandler │
              └─────────────────────────┘
```

Workers after the migration: **4** (JobEngine, StripeWebhookReconciler, StripeInvoiceReconciler, GcsAssetReconciler) — down from 7.

## Migration steps

The plan is strictly incremental. Every step is independently shippable, independently reversible, and independently observable in production.

### Step 2 — Extract `JobEngine` from `VideoJobWorker`

**Status:** Next up
**Scope:** ~20-40 files. Behavior-preserving refactor. No new features.

**Plan:**

1. Introduce `server/src/services/jobs/` (new directory):
   - `JobEngine.ts` — class, renamed copy of `VideoJobWorker.ts` with video specifics extracted
   - `JobHandler.ts` — interface: `{ type: string; claim(record): Promise<ClaimedJob|null>; process(job, ctx): Promise<JobResult>; }`
   - `types.ts` — generic `JobRecord<TInput, TResult>`, discriminated by `type`
2. Move video-specific code:
   - `server/src/services/video-generation/jobs/VideoJobHandler.ts` — implements `JobHandler`. Wraps current `processVideoJob.ts` logic unchanged.
3. Wiring: `server/src/config/services/video-generation.services.ts` registers `JobEngine` with `[videoHandler]` as the only handler. The old `VideoJobWorker` DI token becomes an alias for the engine for one release, then is removed.
4. Inline processor in `server/src/routes/preview/inlineProcessor.ts` still uses `videoJobStore.claimJob` directly — it doesn't need the engine. No change here.
5. Tests: all existing `VideoJobWorker` tests move to `JobEngine` tests, semantically identical.

**Acceptance criteria:**

- Running video generation end-to-end produces identical metrics, logs, and job-record transitions
- `npx tsc --noEmit`, `npx eslint`, `npm run test:unit`, bootstrap+DI integration gate, `npm run build` all green
- Prod deploy surfaces zero new error categories in the 24h following rollout

**Rollback:** revert the PR. DI alias means in-flight jobs are unaffected.

### Step 3 — Refund-as-job-field; collapse `CreditRefundSweeper`

**Status:** Requires prod observation window
**Scope:** ~15-25 files. Schema change + dual-run.

**Plan:**

1. Add `refundStatus: "n/a" | "pending" | "committed" | "failed"` to `VideoJobRecord` (default `"n/a"` for new jobs; `"n/a"` for legacy jobs at read time via schema normalization).
2. On any status transition to `"failed"`, inside the same firestore transaction set `refundStatus = "pending"`. Keep writing to `RefundFailureStore` as before (mirror writes).
3. Extend `JobEngine` with a post-process step: if `status === "failed" && refundStatus === "pending"`, call `refundWithGuard`, then set `refundStatus = "committed"`.
4. **Observe for 1-2 weeks**: instrument a metric comparing `RefundFailureStore` entries vs. jobs in `refundStatus = pending`. They must stay in sync. If they diverge, abort and investigate.
5. Flip reads: any code that queried `RefundFailureStore` now queries jobs with `refundStatus = pending`. Keep writes to both stores.
6. **Observe for another week.** Then delete `RefundFailureStore` + `CreditRefundSweeper` + associated DI wiring.

**Acceptance criteria:**

- Zero discrepancies between mirror and primary during observation windows
- Credit reconciliation reports show no unexpected deltas
- The number of background workers decreases by exactly 1 after cleanup

**Rollback:** while mirror-writes are running, either read source is authoritative. Post-cutover, rollback requires restoring the store, which is a data-migration rollback and must be explicitly approved.

### Step 4 — Migrate continuity shot generation onto `JobEngine`

**Status:** After Step 2 lands
**Scope:** ~25-40 files. User-facing behavior change (async instead of sync).

**Plan:**

1. New handler: `server/src/services/continuity/shot-generation/ContinuityShotHandler.ts` implementing `JobHandler`. Wraps current sync generation logic.
2. Route change: `POST /api/v2/sessions/:id/shots/:shotId/generate` returns `202 { jobId }` instead of blocking. The existing shot status endpoint (`GET /api/v2/sessions/:id/shots/:shotId/status`) is extended to surface job state.
3. Client change in `client/src/features/continuity/`: replace the blocking `await generate()` with job-id + polling (same shape as `pollJobStatus.ts`).
4. Credit reservation moves from inline to `createJobWithReservation` at the handler entry.

**Acceptance criteria:**

- Continuity shot flows produce visibly identical outputs to users
- Credit balances stay correct across generation + refund scenarios (property test: generate N shots, cancel half, assert final balance)
- No regression in continuity-session integration tests

**Rollback:** keep the old sync endpoint behind a `CONTINUITY_SHOT_JOB_ENABLED` boolean flag (temporary — deleted when step 6 ships). If jobs misbehave, flip the flag, sync path returns.

### Step 5 — Migrate image generation (Flux Schnell) onto `JobEngine`

**Status:** After Step 2 lands; can be parallel with Step 4
**Scope:** ~20-30 files. User-facing latency change (mitigable).

**Plan:**

1. New handler: `server/src/services/image-generation/ImageGenerationHandler.ts` implementing `JobHandler`.
2. Route change: `POST /api/preview/image/generate` becomes async.
3. **Latency mitigation:** the route handler synchronously waits up to 2000ms for the handler to complete. If it finishes in time, return 200 with the image URL (sync-appearing). Otherwise return 202 + jobId, and the client resolves via listener/poll. Fast-path preserves the current perceived-latency in the happy case.
4. Client change in `client/src/features/preview/`: accept either shape from the endpoint.
5. Credit reservation moves to handler entry.

**Acceptance criteria:**

- P50 latency to first pixel is unchanged within ±200ms
- P99 latency to first pixel improves (long-tail no longer holds the request socket)
- Credit lifecycle remains exactly-once

**Rollback:** `IMAGE_GEN_JOB_ENABLED` flag, same pattern as Step 4.

### Step 6 — Client-side: firestore listener replaces polling

**Status:** After Steps 4 & 5
**Scope:** ~15-25 client files. Transport swap, feature-flag gated.

**Plan:**

1. Add `client/src/features/jobs/useJobListener.ts` — firebase SDK subscribe to `jobs/:id`. Returns the same hook shape as the existing `usePolledJob` (drop-in).
2. Gate behind `VIDRA_JOB_LISTENER_ENABLED` (client-side flag). Ship off; enable for a canary population; then full.
3. Once stable, delete `client/src/features/preview/api/pollJobStatus.ts` and migrate all callers.

**Acceptance criteria:**

- Zero-polling mode: instrumentation confirms `GET /api/jobs/:id` request rate drops to ~0 for users with the flag on
- Time-to-visible-result improves by the previous polling interval on average (~1-4s)
- No increase in "job stuck" user reports

**Rollback:** flip the flag. Client falls back to polling.

## Cross-cutting concerns

### Observability

Each step must land instrumentation before the code path is exercised:

- Step 2: `job_engine.handler.invocations{type}`, `job_engine.handler.errors{type}`
- Step 3: `job.refund_status_transitions{from,to}`, `refund_store.divergence_count`
- Step 4/5: `jobs.created{type}`, `jobs.completed{type}`, `jobs.duration{type}` histograms
- Step 6: `client.listener.attach`, `client.listener.update_latency_ms`

### Schema evolution

`VideoJobRecord` (→ generalized `JobRecord`) must remain backwards-readable across the migration:

- Step 2: no field changes; just new `type` field defaulted to `"video"` for legacy records
- Step 3: `refundStatus` defaults to `"n/a"` for legacy records at read time
- Steps 4/5: new job type values — readers must tolerate unknown types (log + skip, not throw)

### Rollback posture

Every step ships with a bypass: either a feature flag (Steps 4, 5, 6) or a mirror write (Step 3) or a DI alias (Step 2). No step requires a "flag day" deploy.

## Referenced files

| Path                                                           | Role                                 |
| -------------------------------------------------------------- | ------------------------------------ |
| `server/src/services/video-generation/jobs/VideoJobWorker.ts`  | Source for JobEngine extraction      |
| `server/src/services/video-generation/jobs/processVideoJob.ts` | Wrapped by VideoJobHandler           |
| `server/src/services/video-generation/jobs/VideoJobStore.ts`   | Generalizes to JobStore              |
| `server/src/routes/preview/inlineProcessor.ts`                 | Unchanged — continues direct claim   |
| `server/src/routes/preview/handlers/videoGenerate.ts`          | Entry point — unchanged after Step 2 |
| `server/src/services/image-generation/`                        | Step 5 migration target              |
| `server/src/services/continuity/`                              | Step 4 migration target              |
| `server/src/services/credits/CreditRefundSweeper.ts`           | Deleted after Step 3                 |
| `server/src/services/credits/RefundFailureStore.ts`            | Deleted after Step 3                 |
| `client/src/features/preview/api/pollJobStatus.ts`             | Replaced by listener in Step 6       |

## Open questions to resolve before starting each step

- **Step 2:** do we generalize `VideoJobStore` into `JobStore<T>`, or keep it video-specific and have each handler bring its own store? (Recommendation: generalize; sole store keeps observability simple.)
- **Step 3:** what's the upper bound on how long `refundStatus = "pending"` jobs can sit? (Propose: 24h, then pager. Credits are money.)
- **Step 4:** does the client UI need a progress indicator for shot generation, or is a spinner sufficient? (Ask UX.)
- **Step 5:** what's the right value for the sync-wait ceiling? 2s is a guess — we should measure P50 Flux latency and set it above that. (Instrument first.)
- **Step 6:** firebase SDK size impact on the client bundle? Measure before rollout.
