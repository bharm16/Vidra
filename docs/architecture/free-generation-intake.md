# Free active generation intake

Issue #124 implements the accepted [ADR-0023 operating policy](../adr/0023-bounded-free-validation-proposal.md).
Creators can use the active quick-picture and clip HTTP paths without a credit
balance, reservation or refund. Per-creator spend caps (#123) are explicitly
deferred; this change does not invent or enforce them. The separate $10 live
validation allowance is operator authorization for controlled testing, not a
customer credit balance or a production cap.

## Boundary and operating mode

This supplements ADR-0002's freeze and ADR-0022 decision 6 exactly at the active
picture/clip intake, durable job publication and zero-reservation failure
bookkeeping. It does not thaw billing, paid Keep, credit UI, provider retry
orchestration, the sweeper/reconciler, or the consistency stack.

`POST /api/preview/generate` and `POST /api/preview/video/generate` require
verified authentication and an `Idempotency-Key`. The existing client sends that
header. Free clip publication requires a durable receipt even if a legacy
operator configured the old `VIDEO_GENERATE_IDEMPOTENCY_MODE=soft` setting.
Missing idempotency storage fails closed before dispatch; no anonymous or
credit-service fallback is introduced.

The active handlers do not call credit reservation, refund, balance lookup or
starter-grant APIs. A free job retains `creditsReserved: 0` inside the existing
job-record schema solely for compatibility with the worker and historical
records. New acceptance and polling responses expose no credit amounts for
these zero-reservation jobs.

Preview registration applies the old starter-grant middleware only to the
explicitly frozen storyboard and face-swap POST routes. Active POSTs, media
reads, polling, downloads and attachment-recovery requests bypass it. Every
route retains authentication. In particular, viewing media or checking a job
cannot create a credit grant or wait for the credit store.

## Ownership and provider boundaries

A session destination must name both its session and words-version. The existing
session service proves ownership before any provider dispatch. A clip's named
source generation must be a live picture in that owned session. A supplied
foreign session, partial destination or foreign/non-picture source is refused.
The existing URL safety and owned-media URL refresh boundaries remain in place.

Intake and the shared worker consume the release support policy from
`shared/videoModels.ts`. Explicit excluded requests are refused before
preprocessing, publication or provider dispatch, even when a substituted service
reports the model available. Saved records retain their original model IDs and
remain readable; a generation request is not silently redirected to another
provider. Availability and provider configuration still govern included models.

The free path accepts ordinary text generation or a supplied first frame.
Requests that would invoke frozen automatic character keyframes or face-swap
preprocessing return an explicit 400. Those credit-bearing preprocessing
implementations remain dormant rather than receiving a fake credit service or
a silent free-mode switch.

## Publication and recovery

The former clip path queued/scheduled a job before storing its 202 response. The
free path uses one existing Firestore transaction:

1. The route claims its authenticated request and fixed payload.
2. `VideoJobStore.createJobWithReceipt` establishes one job ID and response.
3. `RequestIdempotencyService.completeInTransaction` verifies the matching owned
   pending claim, then the transaction publishes both its completed receipt and
   the queued zero-reservation job.
4. Only after commit can the existing inline/background worker observe or claim
   that job. Scheduling follows publication.

A failed transaction exposes no job and schedules no provider work. An ambiguous
commit is recovered from the authoritative receipt. If publication cannot be
confirmed, its claim is retained rather than marked failed and reopened for a
possible duplicate. A lost response replays the same job ID.

A scheduling failure leaves the accepted job and completed receipt durable; it
cannot refund, release the claim or mint a replacement. Concurrent same-payload
claims across a pending-lock expiry can publish only one job: the loser reads
and returns the winner's receipt. A late failure callback cannot overwrite a
completed receipt because `markFailed` now checks status transactionally.

Free worker failures still retain the existing job error, terminal/retry outcome
and dead-letter bookkeeping. Zero-reservation jobs never invoke a refunder.
Previously charged records still require their original refund dependency and
retain their compatibility behavior; no
credit-service implementation or payment workflow changes here.

The quick-picture path likewise retains its request claim after ambiguous
provider/storage/completion failure, preventing an immediate same-key
regeneration. Existing picture attachment discovery/repair remains separate
from generating another picture.

## Evidence and limits

`tests/unit/video-generate.contract.test.ts` exercises real Express handlers,
registration/auth, the real idempotency and job adapters, and the real inline
worker. Only process-external Firebase, provider and media-storage ports are
controlled. Its cases cover free picture/clip acceptance at zero balance,
read-only registration with a throwing credit store, auth and foreign-session
refusal, excluded models, frozen preprocessing refusal, atomic publication,
lost responses, scheduling failure, ambiguous commit, a concurrent publication
loser, and free worker terminal failure without refunds.

The motion HTTP test preserves the creator's visible words verbatim. Existing
picture and clip attachment tests continue to cover durable recovery without
regeneration. These offline checks establish the control/data contracts; live
provider completion and actual media playback are separate evidence. No live
provider call was needed to implement this change.
