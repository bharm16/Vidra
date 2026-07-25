# System Design Audit — 2026-07-24

Eight parallel dimension audits (core architecture, data storage, async jobs, API contracts,
reliability, performance, security/cost, observability), followed by a 13-agent adversarial
verification pass over every unconfirmed Critical/High claim.

**Verification outcome: 7 `CONFIRMED_WITH_CORRECTION`, 6 `OVERSTATED`, 0 clean `CONFIRMED`.**
Not one finding survived exactly as first written. The corrections are recorded in
[§5](#5-what-verification-corrected) because several of them would otherwise have sent work in
the wrong direction — including one whose proposed fix was actively harmful.

Calibration: Vidra is pre-launch with zero users, and per
[ADR-0002](../adr/0002-vidra-is-an-authoring-tool-for-non-experts.md) the credits/payment,
video-job-resilience, and continuity/convergence stacks are frozen. Every finding therefore
carries a **horizon** — when it starts to hurt — not just a severity.

---

## 1. The headline

**The Cloud Run deploy workflow has never executed.** `gh run list` returns zero runs for
`deploy-cloudrun-firebase.yml`; its only triggers are `workflow_dispatch` and `push: tags:
v*.*.*`, and no `v*` tag exists. Six independent defects sit between the repo and a working
deploy. Three specialist agents each labelled these `Horizon: now`, implying live breakage —
the accurate framing is that they are **first-deploy blockers**, and the ordered list below is
the pre-flight checklist.

Separately, three GitHub workflows are **permanently red**, which is why a genuinely new
failure has been indistinguishable from the standing ones for weeks:

| Workflow                           | Trigger              | Recent runs        | Red since    |
| ---------------------------------- | -------------------- | ------------------ | ------------ |
| `deploy.yml` (targets **AWS ECS**) | every push to `main` | 8/8 failure, 8–18s | ≥ 2026-06-05 |
| `security-scan.yml`                | nightly              | 6/6 failure        | ≥ 2026-07-19 |
| `span-labeling-eval.yml`           | nightly              | 6/6 failure        | ≥ 2026-07-19 |

---

## 2. Tier 0 — First-deploy blockers

All six personally verified against source and CI history.

### T0-1. The build cannot succeed — no Dockerfile at the build root

[`deploy-cloudrun-firebase.yml:64`](../../.github/workflows/deploy-cloudrun-firebase.yml:64) runs
`gcloud builds submit --tag "$IMAGE_URI" .` from the repo root. `--tag` means "use the Dockerfile
at the source root." The only Dockerfile in the repo is `infrastructure/docker/Dockerfile`. A
root `.dockerignore` exists, suggesting a root build was once intended.

**Fix (S):** move the Dockerfile to the root, or switch to `--config` with a `cloudbuild.yaml`
that names the real path.

### T0-2. `/api/llm/*` would 503 permanently — a fail-closed inversion

```
deploy sets NODE_ENV=production, no REDIS_URL / REDIS_HOST
        ↓
redis.ts:39-45            createRedisClient() → null      ("Redis is optional")
        ↓
middleware.config.ts:344    if (redisClient || NODE_ENV === "production")
                                setRedisRateLimitHealth(false)      ← fires
        ↓
middleware.config.ts:346        if (redisClient) subscribe…         ← unreachable (null)
        ↓                       ∴ no path back to healthy, ever
middleware.config.ts:504    app.use("/api/llm/", createFailClosedLlmRateLimit())
        ↓
rateLimitHealth.ts:78-95    → 503 RATE_LIMIT_UNAVAILABLE, permanently
```

`POST /api/llm/label-spans` — the first call in the authoring loop — is dead on arrival. The
comment at `middleware.config.ts:340-343` states the intent as _"when Redis was NEVER configured
… keep working — but only outside production."_ The code does the opposite of its own comment in
exactly the deployed configuration. Tests cannot catch it: `applyRateLimitingMiddleware` returns
early under `NODE_ENV=test`.

The defect is conflating **"my dependency is down"** with **"I was never configured to have that
dependency."** The second has no recovery event to subscribe to, so fail-closed becomes
fail-permanent.

**Fix (S):** either set `REDIS_URL` on the service, or make the guard fire only when
`redisClient` exists. Any fail-closed guard needs its recovery path to exist in every branch
that can trip it.

### T0-3. The deployed SPA cannot reach its own API

[`api.config.ts:12`](../../client/src/config/api.config.ts:12) resolves
`import.meta.env.VITE_API_URL || "/api"`. `VITE_API_URL` is set nowhere — not in the workflow,
not in any env file — so the built client uses the relative `/api`. But `firebase.json` rewrites
`**` → `/index.html` with **no `/api/**`→ Cloud Run rule**. Every API call returns`index.html` at HTTP 200 and dies in JSON parsing. The whole product is non-functional, failing
in the shape most likely to be misdiagnosed as a client bug.

**Fix (S):** add a Firebase Hosting rewrite for `/api/**` to the Cloud Run service, or set
`VITE_API_URL` at build time.

### T0-4. Provider keys for half the active loop are never passed

The deploy's `--set-env-vars` / `--set-secrets` carry `OPENAI_API_KEY` and `GROQ_API_KEY`.
Absent: **`GEMINI_API_KEY`** (span labeling's default provider per `modelConfig.ts:393`),
**`REPLICATE_API_TOKEN`**, **`FAL_KEY`** (live editor), `STRIPE_*`, `REDIS_URL`, and
**`POSTHOG_API_KEY`** — the last of which makes `PostHogClient.ts:84-87` return
`PostHogClientNoop`, so every telemetry dashboard would be fed by local dev and synthetic
traffic only.

### T0-5. `PROCESS_ROLE` is unset, so all nine background loops are dead code

Found independently by the architecture and async agents. `feature-flags.ts:391-393` defaults
`resolveProcessRole()` to `"api"`; `services.initialize.ts:536-541` starts workers only under
`"worker"`. The deploy sets it nowhere, and neither does the Dockerfile. **Every killswitch row
in `CLAUDE.md`'s feature-flag table documents a service that would never run** — including Stripe
webhook reconciliation and the credit refund sweeper.

The only surviving executor is [`inlineProcessor.ts:44`](../../server/src/services/video-generation/jobs/inlineProcessor.ts:44):
a detached `setTimeout(…, 300)` fired _after_ the 202 response, untracked by
`videoJobWorker.shutdown()`, on a `--min-instances 0` CPU-throttled instance. A killed instance
leaves the job `processing` with credits debited and no sweeper to reclaim it.

### T0-6. Firestore rules and indexes are never deployed

`firebase.json` declares both `firestore.rules` and `firestore.indexes.json`, but the workflow
only runs `firebase deploy --only hosting:production|staging`
([lines 103,105](../../.github/workflows/deploy-cloudrun-firebase.yml:103)). There is no
`--only firestore` anywhere.

This matters because **the client talks to Firestore directly**:
[`useUserCreditBalance.ts:2`](../../client/src/hooks/useUserCreditBalance.ts:2) opens an
`onSnapshot` on `users/{uid}`. For that read path, `firestore.rules` **is** the authorization
boundary. The rules file itself is well written (deny-by-default on `sessions`/`video_jobs`,
`users` write:false) — but an undeployed rules file is equivalent to no rules file.

Also: **`storage.rules` does not exist anywhere in the repo** and is not declared in
`firebase.json`. And the rules reference a `prompts` collection with **zero** server-side
references, while `assets`, `shares`, `credit_*`, `billing_profiles`, `request_idempotency`, and
`stripe_webhook_events` have no entries.

**Before anything else:** run `gcloud firestore indexes composite list` to find out whether the
live project matches the repo. The repo cannot tell you.

---

## 3. Tier 1 — Live in dogfooding today

### T1-1. Unauthenticated read oracle for the entire media bucket — **Critical**

[`motion.registration.ts:38`](../../server/src/routes/motion/motion.registration.ts:38) mounts
`/api/motion/media` with **no auth middleware**; the very next line mounts `/api/motion` _with_
it. The file's own docblock says "Auth required." It is a mount-order accident.

The `/proxy` handler then takes a user-supplied URL and calls
`storageService.refreshSignedUrl(upstreamUrl)`
([convergenceMedia.routes.ts:182](../../server/src/routes/convergence/convergenceMedia.routes.ts:182)),
re-signing the object with the Cloud Run service account and streaming it back.

**Precision correction to the original finding:** this is **not** open SSRF. The handler requires
`https:` and `extractObjectPath` (lines 41-65) rejects any host that is not GCS or any bucket that
is not the configured one. The accurate statement is narrower and still Critical:

> `GET /api/motion/media/proxy?url=…` is an unauthenticated read oracle for **any object in the
> project's media bucket**. The signature on the supplied URL is never verified before re-signing,
> so expired URLs, revoked shares, and any guessable object path are readable by anyone on the
> internet.

All user media shares one bucket (`storage.services.ts:61`), and convergence uploads are keyed
`{Date.now()}-{originalFilename}` ([convergenceMedia.routes.ts:101](../../server/src/routes/convergence/convergenceMedia.routes.ts:101))
— near-enumerable, far weaker than the 64-bit scheme at `pathUtils.ts:28`.

**Fix (S):** add `apiAuthMiddleware` to the `/api/motion/media` mount and an ownership check on
the derived `objectPath`. The allowlist already works — do not rewrite it.

### T1-2. Removing a node from the space is silently undone — **High**, verdict `CONFIRMED_WITH_CORRECTION`

`SessionService.archiveGeneration` writes `archived: true` server-side
([SessionService.ts:487](../../server/src/services/sessions/SessionService.ts:487)), but the
client never learns it: `archiveGeneration` discards the response
([spaceApi.ts:16-27](../../client/src/features/space/api/spaceApi.ts:16)) and
`handleRemoveSpaceNode` only adds the id to a local `locallyArchivedIds` Set without refetching
([CanvasWorkspace.tsx:454-465](../../client/src/features/workspace-shell/CanvasWorkspace.tsx:454)).

The client's in-memory `versions` array still holds the record **without** `archived`. Any
subsequent change — a new generation, a job-status tick, a signed-URL refresh, a reword — fires a
debounced PATCH of the **entire** versions array. Server-side `mergeGeneration`
([immutableMedia.ts:173-213](../../server/src/utils/immutableMedia.ts:173)) does `{...incoming}`
and restores only `mediaUrls`, `thumbnailUrl`, and `mediaAssetIds` from the stored record.
`archived` is not on that allowlist, so it is dropped and the removal is reverted.

ADR-0012's "nothing vanishes" inverts into "nothing stays removed." `SPACE_LINEAGE` is
default-on, so no flag is needed to reach this.

**Fix (S):** add `archived` and `ancestorGenerationId` to the `mergeGeneration` allowlist.

### T1-3. A failed span-labelling is cached as a success for 24 hours — **High**, verdict `CONFIRMED_WITH_CORRECTION`

Found independently by the API and reliability agents; the refuter was told to attack the
_shared_ reasoning and it held.

The server emits `{"error":"Streaming failed","degraded":…,"partialCount":N}` as an NDJSON line
**inside a 200-OK body** ([streamingHandler.ts:99-117](../../server/src/routes/labelSpans/streamingHandler.ts:99));
the 502 branch is unreachable because `:58` flushes headers first — a fact codified in
`pipeline.test.ts:327-361`. The client detects that line and throws
([spanLabelingStream.ts:42-44](../../client/src/features/span-highlighting/api/spanLabelingStream.ts:42)),
but its own `catch` at `:51` swallows it into a `parseErrors` counter that is only logged. The
promise resolves, so `useAsyncScheduler.ts:97` routes to `onSuccess`, which commits
`status: "success", error: null` **and writes the result to the localStorage-backed cache**
([useSpanLabeling.ts:363-373](../../client/src/features/span-highlighting/hooks/useSpanLabeling.ts:363)).
`SpanLabelingCache.set` has no empty/partial guard and persists 24h.

Retyping the same prompt then hits that cache entry and returns the failed result **with no
network call, surviving reload**. This is the same silent-failure class as the fal relay bug
fixed in `cd0d45e4` — that fix was client-side and did not generalize.

**Fix (S):** treat the error line as a rejection through to `onError`, and guard
`SpanLabelingCache.set` against degraded/partial results.

### T1-4. Both secret scanners have been dead every night — **High**

`security-scan.yml` applies `continue-on-error: true` to npm audit (`:35`), Snyk (`:40`), and
ESLint (`:149`) — but **not** to TruffleHog (`:61`). Gitleaks (`:69`) sits immediately after it in
the same job. On a `schedule` trigger there is no diff range, so TruffleHog aborts with
`##[error]BASE and HEAD commits are the same. TruffleHog won't scan anything.`, the job dies, and
**Gitleaks never runs.** Verbatim on all six of the last six nightlies.

Given the July 2026 leaked-key incident that suspended the GCP project, this is precisely the
control meant to prevent recurrence.

**Fix (S):** add `continue-on-error: true` to the TruffleHog step, and give it an explicit
base/head range for scheduled runs.

### T1-5. The nightly eval gate misreports an infrastructure failure as a model regression — **High**

The standing hypothesis was "Groq baseline drift — investigate vs re-bless." **Re-blessing would
have been the wrong action** and would have permanently baked in a degraded baseline.

```
GLiNER worker init fails   →  logged at :361, non-fatal
        ↓
labeling runs without it   →  every LLM call succeeds, error rate 0%
        ↓
setup_error guard          →  NOT triggered (it only watches LLM error rate)
        ↓
F1 drops 0.728 → 0.661     →  scored as a Groq QUALITY REGRESSION, exit 1
```

The harness already has the right concept:
[`golden-set-relaxed-f1.ts:374-381`](../../scripts/evaluation/golden-set-relaxed-f1.ts:374)
defines `outcome = "setup_error"; return 2` with the comment _"partial F1 numbers can't be
trusted."_ But that guard watches only the **LLM** error rate, and the GLiNER worker dies inside
`warmupNlpServices()` at [`:361`](../../scripts/evaluation/golden-set-relaxed-f1.ts:361).

Secondary, real staleness: `action.gesture` and `camera.angle` are new categories absent from the
baseline, and `groq.json` records `blessedAt` and `provider` but **no model and no commit** — so
provenance is unrecoverable.

**Fix (S):** make `warmupNlpServices()` failure set `outcome = "setup_error"` and `return 2`.
**Fix (S):** add `model` and `commit` to the blessed baseline schema.

### T1-6. The benchmark surface has zero server-side observability — **High**

[`fal-i2i.routes.ts`](../../server/src/routes/fal-i2i.routes.ts) is 62 lines with no logger
import, no telemetry, and it mirrors fal's status verbatim (`:56-57`). The 2026-07-24 balance-lockout
fix (`cd0d45e4`) was entirely client-side — the server still has no record that N frames failed.
Reproduce that incident today and you still diagnose it from a screenshot.

The same route also passes **no `signal`** (`:48`), so every watchdog-aborted frame still runs to
completion and still bills.

---

## 4. Tier 2 — At first deploy / first user

| ID    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Severity | Horizon                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------- |
| T2-1  | **No spend caps on paid endpoints.** Credits gate `/api/preview` only. `/api/fal/i2i` proxies to a paid provider with no reservation and no dedicated limiter; `/api/llm/label-spans` has **no `.max()`** on `text` (`requestParser.ts:32`) where optimize correctly caps at 10k. Rate limits are per-IP with no `keyGenerator` anywhere — and per-instance, so N instances mean N× the limit.                                                                                                                                                                                                             | High     | at first user                   |
| T2-2  | **Buffered optimize.** `optimize.ts:156-203` awaits 2–6 sequential LLM calls before one `res.json()`. A working NDJSON streaming pattern already exists for span labeling, client wired up and nginx buffering disabled — it was simply never applied here.                                                                                                                                                                                                                                                                                                                                                | High     | now (dogfood UX)                |
| T2-3  | **401 → fabricated success persisted to history.** Any production 401/403 on `/api/optimize` returns a hardcoded "✨ Offline Prompt Assistant" block as a successful `OptimizeResult`. Nothing inspects `metadata.usedFallback`, so it is scored by `calculateQualityScore` and written to prompt history. _Correction:_ the text does say it is offline, so this is an error message misrouted into the content channel and into durable storage — not an undetectable fabrication. Reachable from a logged-out user dismissing the sign-in dialog.                                                       | Medium   | at first deploy                 |
| T2-4  | **API key is the user identity.** `apiAuth.ts:118` sets uid to `api-key:${key}` verbatim — no hash, no truncation — and it propagates into (1) the `userId` field of `sessions` documents, (2) GCS paths as `users/api-key:<secret>/…`, and (3) pino logs, which `Logger.ts` configures with **no `redact`**. The repo is public (verified).                                                                                                                                                                                                                                                               | Medium   | at first deploy                 |
| T2-5  | **Session document has a hard ceiling.** The whole authoring loop persists into one `sessions/{id}` doc; merges are union-only and `archiveGeneration` only sets a flag. ~2.8 KB per image generation, dominated by two copies of the _same_ ~900-char v4 signed URL. At 1 MiB the doc freezes: writes that grow it are rejected, reads keep working, and the failure is silent both ways. _Correction:_ a recovery path does exist — `PATCH /sessions/:id/versions {versions: []}` is schema-valid and wipes the array — so no migration is needed, but it is a nuclear wipe and no client code calls it. | Medium   | ~300 generations in one session |
| T2-6  | **No smoke test, no rollback,** and a `v*.*.*` tag fires two contradictory deploy workflows (GCP + the dead AWS one).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Medium   | at first deploy                 |
| T2-7  | **LLM failures cannot be attributed to a provider.** `AIModelService.ts:53-54` reads provider from `response?.metadata`, which is `undefined` on every error → `provider: null`. The documented "error rate by provider" query is structurally incapable of a correct answer. `recordAlert` calls in `llm.services.ts:186-192` are permanent no-ops.                                                                                                                                                                                                                                                       | High     | at first deploy                 |
| T2-8  | **Refusals return as success.** `ResponseValidator.ts:103-109` detects refusals; all three adapters write the verdict to `metadata.validation` and return the text anyway. Zero readers of `isRefusal`.                                                                                                                                                                                                                                                                                                                                                                                                    | Medium   | at first user                   |
| T2-9  | **Route documentation misstates a third of the API.** 59 of 178 rows in `architecture-map.json` / `ROUTE_MAP.md` are phantom (`route-map-walker.ts:475-481` documents the defect). Real surface is 120 routes. `POST /api/fal/i2i` — the paid hot path — is in neither artifact. `verify:drift` gates on these documents. Also ~29 routes have zero client callers, including a live wildcard `DELETE /api/storage/:path(*)`.                                                                                                                                                                              | Medium   | now                             |
| T2-10 | **Cache coherence.** `cache.services.ts:9` constructs `new CacheService({})` — the general cache has no Redis path at all, so optimization/enhancement/observation caches are per-instance unconditionally and `delete()`/`flush()` reach only the calling process. (`spanLabelingCacheService` _does_ get a real client.)                                                                                                                                                                                                                                                                                 | Medium   | at 2+ instances                 |

---

## 5. What verification corrected

Six claims were downgraded. These are recorded because acting on them as first written would
have wasted effort — and in one case caused harm.

**`PERF-F3` — "users are served each other's enhancement suggestions" → Low.** The normalization
is real: `CacheKeyFactory.ts:70-72` passes `highlightedText`/`contextBefore`/`contextAfter` raw
into a path that lowercases and strips filler phrases before hashing, inconsistent with the
sibling fields hardened in `5c67b68b2`. But the key **also** carries `sha256Hex(fullPrompt)`,
which pins the document case-sensitively, and `highlightWordCount`, a raw integer immune to the
normalizer. The refuter executed both alleged collision scenarios against the live modules and
neither collides. Worth tidying for consistency; it is not a correctness bug.

**`API-F3` — "backpressure is dropped and then retried" → Low.** The two incompatible error
shapes are real (`errorHandler.ts:161-169` nests `error` as an object; the canonical branches at
`:221-226` put a message string there). But backpressure travels on the **`Retry-After` HTTP
header** (`errorHandler.ts:160,194`), which `FetchHttpTransport._getBackoffDelay:79-85` reads.
The body code was never the transport. The real defect is that a 503 degrades to the text
"HTTP 503" instead of "Service is busy."

**`ASYNC-F4` — the proposed fix was harmful.** The missing `workerId` fence on
`markCompleted`/`markFailed` is real. The credit consequence is not: `markFailed`'s guard rejects
jobs already `completed`, and refunds are idempotent via `refundKey`
(`UserCreditService.ts:268-277`). More importantly — the one path that genuinely can refund a
completed job is `processVideoJob.ts:302-329`, and **adding the requested fence to
`markCompleted` would make that leak deterministic rather than fixing it.**

**`DATA-F8` — "pictures can never be shared" → Low.** The `storagePath` is not lost; it is
recoverable by reconstruction (`pathUtils.ts:28`) and by parsing the stored URL, which the
codebase already does at `usePromptVersioning.ts:615`. A refresh-on-read path exists and works —
gallery URLs self-repair. Only the space canvas renders the unrefreshed `node.mediaUrl`. The
share consequence is "never."

**`REL-F13` — "an unclassified rejection kills the instance" → Low.** True but intentional and
test-locked (`server-unhandled-rejection.regression.test.ts:79`), and gentler than the Node 20
default. The fal example does not hold: `fal-i2i.routes.ts` mirrors the 403 rather than throwing,
and `asyncHandler` catches everything else.

**`ASYNC-F3` / `ASYNC-F5` → Medium, frozen.** The `generateVideo` arity mismatch hidden behind
`videoGenerationService as never` and the write-only DLQ (every `enqueueDeadLetter` passes
`retryable: false`, so the reprocessor's `pending` query never matches) are both real and total —
but unreachable until the worker path is unfrozen and deployed.

---

## 6. What is genuinely solid

Worth stating so it is not disturbed by remediation:

- **`shared/` is verifiably pure** — all 25 files, zero Node APIs, zero framework imports, zero
  client↔server leaks.
- **Constructor injection holds** — zero `container.resolve()` calls in service code.
- **`VideoJobStore.claimFromQuery`** does `transaction.get(query)` → `transaction.update` inside
  `runTransaction` with composite indexes declared. Two instances cannot claim the same job.
- **`createJobWithReservation`** closes credit reservation and job creation in one transaction.
- **Credit refunds are idempotent** via `refundKey`.
- **`routes/optimize/sse.ts`** propagates client disconnect correctly, and `/api/optimize`'s
  cancellation plumbing is correct end-to-end. **This is the pattern to copy** for the fal relay
  and the preview poller.
- **Real per-provider bulkheads and two layers of circuit breaker.**
- **The media proxy's bucket/host allowlist works** — the defect is the missing auth, not the
  allowlist.
- **Telemetry substrate is good** — four operational events with content fields, ALS-stamped
  `source`, `requestId` correlation, snapshot-locked schemas, Pino structured logs, zero
  `console.*` in server business code. It is the _sink_ that is unconfigured.
- **The eval harness already models `setup_error` vs. regression** — GLiNER just falls outside its
  coverage.

---

## 7. Suggested order

1. **Un-red the CI.** Delete or disable `deploy.yml` (dead AWS ECS path, red on every push to
   main). `continue-on-error` on TruffleHog. Make `warmupNlpServices()` failure return exit 2.
   Until red is abnormal, no other signal is trustworthy.
2. **Close T1-1** (auth on `/api/motion/media`) — one middleware argument.
3. **Fix the two silent-failure bugs** (T1-2 merge allowlist, T1-3 error-line routing + cache
   guard). Both are small and both are live in dogfooding.
4. **Walk the Tier 0 checklist** and make one real deploy. Every item is independently verifiable
   before you push a tag; run `gcloud firestore indexes composite list` first.
5. **Then** T2 by horizon.

---

## Appendix — source reports

Full per-dimension reports (with the route/auth matrix, the collection diagram, the latency
budget tables, and the 7×13 telemetry coverage table) are in the session scratchpad:
`audit-01-core-architecture.md` … `audit-08-observability.md`.
