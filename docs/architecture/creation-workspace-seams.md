# Creation and workspace seams

The creation lifecycle owns acceptance and delivery. The workspace authoring module owns working words, retention and intent admission. Their subfolders are private; named root entry points are enforced by dependency-cruiser, including for type-only imports and external tests. Internal implementation and its own tests may compose freely.

## Confirmed output and delivery

A native invocation returns either text or a `provider-media` descriptor with its provider prediction identity. The lifecycle checkpoints that descriptor under the permanent execution attempt before media download, upload or publication. Delivery uses a deterministic, owner-scoped destination with immutable request/slot/snapshot provenance. An uncertain upload response is reconciled by inspecting that destination. Delivery failures never authorize another provider invocation or another spend reservation.

Historical image/audio storage paths and video asset IDs remain readable. Provider evidence lives in an additive child record, fenced to the attempt token and snapshot. Parent attempt records retain the previous serialized format, including after publication. Older code can read completed requests; drain unfinished provider-evidence deliveries or retain a compatible repair executor when rolling back. No historical records are migrated or deleted.

Pictures/audio and provider-video downloads use the owned-media transport. It owns validated DNS connections, redirects, cancellation and actual streamed-byte limits; storage owns content verification and immutable destination identity. Initial delivery shares the attempt deadline and the executor’s shutdown signal. A previously confirmed result can be repaired later under a new bounded delivery window without provider invocation.

## Complete lists

Project, folder, conversation, draft, media and request reads accept `page=true`, an optional `limit` (1–200), and an opaque `cursor`. Responses contain `items` and an optional `nextCursor`. Traversal orders by document ID; cursors are bound to owner, list, project/conversation and applicable filters. Display ordering is applied after traversal.

Updated client modules traverse every page through the owned-request module. Previous-server array responses remain readable during rollout. Older clients retain the complete-array response when they omit `page=true`; these reads traverse bounded database batches instead of silently truncating. Identity-based conversation reads are independent of browsing.

## Authoring and transport

The view consumes authoring read models: current content, local edit identity, retention facts/errors, blocking reasons and typed resource state. It does not inspect checkpoint/server-acknowledgment arithmetic or prepared snapshot hashes. Authoring receives explicit server/device/frame adapters at composition; history observation and URL/hydration selection have separate owners. Setup reuse, word reuse, frame capture and area completion are authoring intents; late completion cannot replace independently edited words or attach a mask to another draft.

Desktop Focus visibility and exact version derive from the URL. Explicit open, selection and close intents own navigation; a media refresh cannot push a duplicate entry, and Back closes Focus even during an opening navigation. This preserves the existing Escape/Back/feed contract; no layout changed.

`OwnedRequest` owns checks before authentication, after token minting and after response decoding, canonical response envelopes, error status, uncached requests and page traversal. It never automatically replays a mutation after authentication failure. Feature modules retain exact-record/schema checks and typed domain error decoding. Public reads and the legacy interactive authentication client keep their separate policies.

## Legacy delivery, text observation and native work

Legacy video jobs retain validated provider-result evidence in their existing record. Continuation consumes that evidence before model qualification, storage or completion, including for historical models that can no longer dispatch. A consumed generation without recoverable evidence cannot authorize another invocation; an explicit new request has a new job identity and reservation. Legacy delivery addresses a create-only destination bound to job, asset and provider result, and reconciles that destination after a lost storage response. Existing refunds and attachment debt keep their separate contracts. When rolling back, drain unfinished legacy deliveries or retain this compatible continuation executor; older workers do not consume the evidence.

Labeling owns an effective request identity: authenticated owner, words, effective policy, processing options, repair behavior and exact provider/model. Unscoped callers compute without a private result cache. Fallback execution selects its own provider profile and stamps actual provenance; a fallback result cannot populate the healthy primary's cache entry. Request-owned cancellation never aborts a coalesced computation belonging to another observer. Failed chunks do not become successful partial results or cache entries.

Span stream version 2 is negotiated by `streamVersion: 2` and `X-Span-Stream-Version: 2`. It sends provisional `span` events, an authoritative `complete` result and explicit `error` events. The client replaces provisional highlights with completion and caches only success; a versioned EOF without completion fails. Older clients retain the prior line format; a new client can still read an older server. Provider consumption owns cancellation and its deadline through the response body, and closing an observer aborts its producer. Existing prompt templates and configured models are unchanged.

Sketch retention flushes until the confirmed device snapshot is still current, so closing during a write cannot strand a later stroke. Frame derivation awaits storage before removing temporary bytes. Upload progress and continuation follow the acknowledged range, with invalid or non-advancing acknowledgements refused.

One injected native-media runtime admits expensive work per API process: one active task and at most eight waiting tasks, each with a 30-second admission deadline. Export/preview decoding, frame derivation, import verification and generated-output verification share it; the image installs procps and monitor errors fail closed; native child RSS is capped at 256 MiB against the checked-in 512 MiB deployment. Preview quota pruning through publication stays serialized by its owner. Native draining starts before HTTP closure waits for active requests, rejects waiting work, and confirms active closure after its grace window. Feature receipts and recovery remain with their owning modules. Native integration fixtures validate supported rendering under these limits; they do not establish production load capacity.

## Audit coverage

| Finding | Owning implementation | Behavioral evidence |
| --- | --- | --- |
| F01 | Native executor, execution store and workflow delivery | Confirmed provider output survives staging failure and restart without regeneration; lost upload response reuses identical bytes. |
| F02 | Workflow lists, project routes and owned client traversal | More than 200 records, tied timestamps, cursor ownership, HTTP continuation, old-client arrays and direct conversation access. |
| F03 | Workspace authoring intents and read models | Existing selection/retention journeys plus stale setup and area completion tests; browser journeys preserve the existing presentation. |
| F04 | Creation lifecycle and private native admission; shared operation-identity authority | Prepare/accept/dispatch route tests; durable receipt races and cross-kind identity exclusions stay covered. |
| F05 | Owned-request transport | Account switch during response decoding, authentication refusal without replay and cache policy. |
| F06 | Owned-media transport and delivery | Invalid redirects/types, streamed limits, ownership and deterministic storage recovery. |
| F07 | Named root entry points and dependency rules | Positive entry-point imports and rejected private imports, including external type-only tests. |
| F08 | Shared pure media lineage | Client tree and server preferred-version operations use the same parent/family definition; display layout remains client-owned. |
| F09 | Injected session/job/dead-letter persistence | Isolated database adapters, existing legacy recovery tests and prompt tests through existing constructor seams. |
| F10 | Legacy job continuation, persisted provider evidence and deterministic delivery | Storage failure/reclaim uses one invocation/reservation; missing evidence fails closed; historical models still deliver; uncertain upload reuses its destination. |
| F11 | Frame derivation's temporary-file lifetime | Delayed storage can read the file before cleanup. |
| F12 | Sketch retention | Immediate close and strokes during a slow write retain the latest drawing; failed retention refuses a safe close. |
| F13 | Resumable upload transport | Partial acknowledgements determine the next offset; non-advancing positions are refused. |
| F14 | Effective labeling request/cache identity | Budgets, confidence and authenticated owners stay independent; fallback cannot poison a primary entry. |
| F15 | Bound text execution/profile selection | Actual fallback provenance and circuit-aware streaming. |
| F16 | Versioned span observation | Authoritative merged completion and explicit failure, with legacy line compatibility. |
| F17 | Provider and observer lifetimes | Generator close aborts its producer; provider deadlines include body consumption. |
| F18 | Injected native-media admission and drain | Shared capacity, bounded waiting, cancellation and closure; existing immutable render/preview contracts remain covered. |

These checks establish local behavior with controlled providers and persistence emulators. They do not establish live provider quality or authorize new spending.
