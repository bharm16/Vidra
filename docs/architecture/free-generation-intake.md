# Free generation intake and legacy refund compatibility

Current contract after the October 9, 2026 separation.

Picture and clip HTTP intake is authenticated and free: new jobs reserve zero credits. Dispatch captures visible words, owned inputs, model/settings and the original session/words-version destination. Unsupported offers and implicit character preprocessing are refused before provider dispatch.

## Receipts

`services/admission/idempotency/RequestIdempotencyService.ts` owns claims and replay receipts. A matching repeated request returns its accepted artifact; changed inputs are refused. Clip publication through `video-generation/runtime/VideoJobStore.createJobWithReceipt` commits the queued job and receipt together. A lost response or scheduling failure cannot create a second job or release an accepted claim.

Explicit uploads and Studio/Sketch acceptance retain owned durable copies, exact admission identity and pending-reference/attachment repair. Ordinary saved session/camera/model records remain readable.

## Completion and attachment

Inline execution and the video worker share leases and completion. Durable media and the completed job precede attachment. A failed attachment records debt and retries the same media/take/session/version without provider replay or refunds. Worker startup exposes attachment recovery independently of generation-provider availability.

Terminal provider failure retains failed-job/dead-letter evidence. Broad automatic DLQ replay, stale-job sweeper and reconciler have been removed; terminal evidence remains.

## Legacy obligations

`video-generation/refunds/` preserves the original user ledger, refund keys and failed-refund store/worker. A charged legacy job requires a refunder and fails closed without one. Free jobs never reserve/refund; completed clip attachment never refunds. Older charged jobs/debts are not assumed drained and no data migration has run.

Paid intake, starter grants, storyboard/face-swap routes and commerce registrations are retired. `/api/preview` remains a saved-media URL compatibility prefix.

Verification: free intake contracts, admission/runtime/refund tests, bootstrap/DI tests, provider-free cross-mode replay and browser journeys. These prove local behavior; provider quality and hosted release qualification remain separate evidence.
