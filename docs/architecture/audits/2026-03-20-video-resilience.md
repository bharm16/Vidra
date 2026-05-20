# Video Generation Pipeline — Resilience Audit

**Date:** 2026-03-20
**Scope:** End-to-end video generation workflow: prompt optimization → preview generation → video job processing → asset storage → client polling

---

## Executive Summary

The video generation pipeline has solid architectural bones — DI-based service composition, nullable service guards at route entry, idempotency support, credit reservation with refund paths, and a job queue with sweeper/reconciler/DLQ. However, there are **critical gaps in the failure paths between these components** that can cause stuck jobs, lost videos, credit leaks, and silent failures. The issues cluster into four themes:

1. **Job state machine race conditions** — video stored but job never marked completed; lease expiration during active processing
2. **Credit accounting inconsistencies** — DLQ reprocessing with zero credits; concurrent refund races; no audit trail linking reservations to refunds
3. **Provider-level fragility** — no polling backoff/jitter across any provider; lenient output parsing; no pre-flight credential validation
4. **Missing observability in failure paths** — escalated DLQ entries with no alerting; orphaned assets with no cleanup; silent worker startup failures

---

## Critical Issues (Fix First)

### 1. Video Stored But Job Never Marked Completed

**Location:** `VideoJobWorker.ts` (~lines 477-519)
**Impact:** User never receives their video. Credits may be double-refunded.

When `markCompleted` fails after the video is already stored in GCS, the worker refunds credits and returns early without updating the job record. The job stays in `processing` forever until the sweeper picks it up — which then fails it _again_ and potentially issues another refund.

**Fix:** Implement a two-phase completion: (1) write a `completion_pending` marker with the asset URL before storage, (2) then mark completed. If `markCompleted` fails, the reconciler can detect the marker and complete the job. Alternatively, make `markCompleted` idempotent with retries that survive lease expiration.

### 2. Heartbeat Renewal Failures Cause Zombie Jobs

**Location:** `VideoJobWorker.ts` (~lines 406-425)
**Impact:** Job lease expires while worker is still processing. Sweeper reclaims and fails the job. Worker then can't mark completion.

Lease renewal failures are logged but never escalated. If Firestore is degraded, renewals silently fail, the lease window closes, and the job enters a zombie state where no terminal action (complete or fail) succeeds because the worker ID no longer matches.

**Fix:** Track consecutive renewal failures. After N failures (e.g., 2), abort the current job immediately and release it to the queue with a clear error. Don't wait for the lease to expire passively.

### 3. DLQ Reprocessing Creates Jobs With `creditsReserved: 0`

**Location:** `DlqReprocessorWorker.ts` (~line 190-194)
**Impact:** Successfully reprocessed videos consume no credits. Audit trail becomes inconsistent.

When a DLQ entry is reprocessed, the new job is created with `creditsReserved: 0` on the assumption credits were already refunded. But if the original job reserved credits and was partially processed, this creates a free generation. No validation links the refund to the re-creation.

**Fix:** Either (a) re-reserve credits during DLQ reprocessing and track the new reservation, or (b) add an explicit `creditStatus` field to DLQ entries to record whether credits were refunded before reprocessing.

### 4. Shutdown Doesn't Reset Job State Consistently

**Location:** `VideoJobWorker.ts` (~lines 376-403)
**Impact:** Jobs stuck in `processing` state after worker restart.

On graceful shutdown, the worker releases its claim and creates a DLQ entry, but doesn't update the job record's status. The DLQ entry has status `queued` but the Firestore job record may still show `processing`. This mismatched state confuses the sweeper and reconciler.

**Fix:** Atomically update the job status to `queued` (or a new `released` status) when releasing the claim during shutdown. Use a Firestore transaction to ensure the DLQ entry and job status update are consistent.

---

## High Severity Issues

### 5. Storage Failures Lose Generation Results Permanently

**Location:** `VideoJobWorker.ts` (~lines 451-458)
**Impact:** Provider-generated video URL expires (~24h), user gets credit refund but cannot retry.

If `storageService.saveFromUrl` fails transiently, the job is marked failed and credits refunded. But the original provider URL has a short TTL. There's no mechanism to retry the storage step independently of the full generation.

**Recommendation:** Persist the provider URL to the job record on generation success (before attempting storage). Add a recovery workflow that retries storage from persisted provider URLs within their TTL window.

### 6. No Polling Backoff or Jitter in Any Video Provider

**Location:** All provider files (sora, veo, kling, luma)
**Impact:** Thundering herd on provider APIs during degradation; unnecessary API load.

Every provider uses fixed polling intervals (Sora 2s, Luma 3s, Veo 10s, Kling 2s) with no exponential backoff or jitter. When providers are slow, all concurrent jobs hammer the status endpoint at the same fixed rate.

**Recommendation:** Add jitter (±20-30% of interval) to all polling loops. Consider mild exponential backoff after the first 30 seconds of polling (e.g., double interval after 30s, cap at 2x original).

### 7. Replicate Provider Output Parsing Is Dangerously Lenient

**Location:** `replicateProvider.ts` (~lines 334-365)
**Impact:** Silent acceptance of malformed output; potential runtime errors downstream.

The output parsing chain: (1) checks if string starts with "http" — if not, logs warning but _continues_ to next check instead of throwing; (2) calls `.url()` as a function without checking if it's callable; (3) accepts first array element without type validation. A malformed response could pass through and cause a downstream crash when the "URL" is used.

**Recommendation:** Fail explicitly on each branch. If the output is a string that doesn't start with "http", throw immediately with the actual value logged. Add Zod validation on the output structure before extraction.

### 8. Sweeper Has No Awareness of Provider Circuit Breaker State

**Location:** `VideoJobSweeper.ts`, `ProviderCircuitManager.ts`
**Impact:** Hot retry loops — sweeper requeues jobs for open-circuit providers, worker immediately rejects, sweeper requeues again.

The sweeper reclaims stale jobs and requeues them without checking if the target provider's circuit breaker is open. This creates a fast loop of requeue → reject → sweep → requeue with no forward progress.

**Recommendation:** Inject `ProviderCircuitManager` into the sweeper. Before requeuing a stale job, check the provider's circuit state. If open, either delay requeue until cooldown expires or move directly to DLQ.

### 9. Escalated DLQ Entries Have No Recovery Path

**Location:** `VideoJobStore.ts` (~lines 451-488)
**Impact:** Permanently lost jobs with no operational visibility.

When a DLQ entry exceeds `maxDlqAttempts` (3), it's marked `escalated`. No process monitors escalated entries. No webhook, alert, or admin UI surfaces them. Users whose jobs reach this state never learn about it.

**Recommendation:** Add an alerting hook (e.g., metrics counter, Slack webhook, or Sentry event) when entries are escalated. Provide an admin API endpoint to list and manually retry escalated entries.

---

## Medium Severity Issues

### 10. Provider Circuit Breaker State Lost on Restart

**Location:** `ProviderCircuitManager.ts` (~line 37)

Circuit breaker state is in-memory. After restart, all circuits reset to closed, allowing a thundering herd against a degraded provider. Consider persisting circuit state to Redis (when available) or at minimum logging circuit state changes so ops can detect pattern.

### 11. Concurrent Refund Race Condition

**Location:** `refundGuard.ts` (~lines 36-104)

If two workers process the same job (race on lease), both call `refundWithGuard`. First succeeds, second enqueues to `RefundFailureStore`. The `CreditRefundSweeper` retries the second refund, potentially causing a duplicate. De-duplication relies on `refundKey` in `UserCreditService` but there's no verification that dedup actually worked.

**Recommendation:** Make `refundWithGuard` check whether a refund was already issued for the same `refundKey` before attempting.

### 12. Orphaned Storage Assets Never Cleaned

**Location:** `VideoJobReconciler.ts` (~lines 150-157)

Reconciler detects orphaned assets (video in GCS but no matching job) and logs alerts but doesn't clean them up. Storage costs accumulate indefinitely.

**Recommendation:** Add a configurable retention window (e.g., 7 days) after which orphaned assets are deleted. Gate behind a feature flag initially.

### 13. No Readiness Gate for Video Generation Routes

**Location:** `health.routes.ts`, `services.initialize.ts`

The `/health/ready` endpoint checks Firestore and LLM providers but does NOT check whether `videoGenerationService` initialized successfully. Video routes are mounted regardless and return 503 at request time rather than being excluded from load balancer rotation.

**Recommendation:** Add a `videoExecution` readiness check callback during initialization that validates at least one video provider is available.

### 14. Veo Provider Error Message Fallback to `undefined`

**Location:** `veo/operations.ts` (~line 95)

If the Veo API returns an error where `error.message` is undefined, the thrown error becomes `"Veo generation failed: undefined"`. This is unhelpful for debugging and could confuse error classification.

**Recommendation:** Default to `JSON.stringify(error)` or `'unknown error'` when `error.message` is falsy.

### 15. Kling Provider Zod Parse Without Try-Catch

**Location:** `klingProvider.ts` (lines 175, 193, 211, 266)

All `.parse()` calls lack error context. If the API response shape changes, the error is a raw Zod validation error with no indication that it came from the Kling provider or which endpoint failed.

**Recommendation:** Wrap `.parse()` calls with try-catch that adds provider context: `throw new VideoProviderError('kling', 'Unexpected API response structure', { cause: zodError })`.

### 16. No Pre-Flight API Key Validation in Any Provider

**Location:** All provider files

No provider validates that its API key/token is non-empty before making the first request. A misconfigured key results in an opaque 401 error from the provider API rather than a clear startup-time error.

**Recommendation:** Add a `validateCredentials()` check during DI registration (in `video-generation.services.ts`) that verifies keys are non-empty strings. This already exists implicitly for some services (e.g., FAL_KEY check) but not for Sora/Luma/Kling.

---

## Low Severity / Hardening

### 17. Lease Renewal Interval Not Validated Against Sweeper Grace Period

`heartbeatIntervalMs` in the worker must be less than `processingGraceMs` in the sweeper, but this invariant isn't enforced at initialization. A misconfiguration causes the sweeper to reclaim actively-processing jobs.

### 18. Worker Startup Failures Are Non-Blocking

If `videoJobWorker.start()` throws during initialization, it's caught and logged as a warning. The server continues serving video generation requests that will queue jobs nobody processes.

### 19. Prompt Compilation Timeout in Client Video Preview

`useVideoPreview` calls `compilePrompt()` with a 4-second timeout before video generation for Wan models. If compilation times out, it falls back to the uncompiled prompt. This is correct behavior, but there's no metric tracking how often this fallback fires — could mask a systemic compilation issue.

### 20. Client Polling Has No Circuit Breaker

`waitForVideoJob()` in the client polls the server every 2-8 seconds for up to 20 minutes. If the server is returning errors (500s), the client keeps polling without backing off, adding load to an already degraded server.

---

## Architecture Observations (Not Bugs)

These aren't failures but structural observations worth noting:

- **Good:** The `RefundManager` pattern in `videoGenerate.ts` is well-designed for tracking multi-phase credit costs (video + keyframe + faceswap) with independent refund paths.
- **Good:** Idempotency support with `RequestIdempotencyService` prevents duplicate generation requests.
- **Good:** The `ProviderCircuitManager` with rolling-window failure tracking is a solid pattern.
- **Good:** Image generation has fallback provider ordering via `buildProviderPlan()`.
- **Missing:** Video generation has no provider fallback — if the requested model's provider fails, the job fails. Consider automatic fallback to an equivalent model/provider for non-model-specific requests.
- **Missing:** No end-to-end health check that exercises the full pipeline (create test job → process → verify asset). The readiness probe only checks component health, not integration health.

---

## Recommended Priority Order

| Priority | Issue                                  | Effort   | Impact                           |
| -------- | -------------------------------------- | -------- | -------------------------------- |
| P0       | #1 Video stored but job not completed  | Medium   | Users lose completed videos      |
| P0       | #2 Zombie jobs from heartbeat failures | Medium   | Jobs stuck forever               |
| P0       | #3 DLQ zero-credit reprocessing        | Low      | Credit accounting integrity      |
| P1       | #4 Shutdown state inconsistency        | Medium   | Jobs stuck after deploys         |
| P1       | #5 Storage failure loses generation    | Medium   | Unrecoverable failed generations |
| P1       | #9 Escalated DLQ with no alerting      | Low      | Permanent silent failures        |
| P1       | #8 Sweeper ignores circuit breaker     | Low      | Hot retry loops                  |
| P2       | #6 Polling backoff/jitter              | Low      | Provider API health              |
| P2       | #7 Replicate output parsing            | Low      | Silent malformed data            |
| P2       | #10 Circuit state lost on restart      | Medium   | Post-deploy thundering herd      |
| P2       | #11 Concurrent refund race             | Medium   | Duplicate refunds                |
| P2       | #13 Readiness gate for video routes    | Low      | Cleaner load balancer behavior   |
| P3       | #12, #14-#20                           | Low each | Hardening and observability      |
