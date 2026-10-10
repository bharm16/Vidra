# Vidra workflow implementation plan

**Date:** 2026-10-10. **Baseline:** `0f541e60db3b3cf87405de1390e2257adf30d2b8`. **Status:** all work packages are planned. This document does not implement the redesigned workflow.

The plan has **26 work packages and 80 small implementation commits**, with explicit prerequisites and acceptance. WP identifiers are local planning IDs, not GitHub issue numbers.

Coverage assigns all **126 states, 348 declared transitions, 1032 rejected state/action pairs, 137 original acceptance cases and 5 reused state-group actors**. 33 additional cases cover implementation-specific rendering, commerce and cutover requirements. None is claimed to be a passing application test yet.

Read [the behavior contract](workflow-state-contract.md), [source/test disposition inventory](implementation-source-inventory.md), [complete state/transition coverage](implementation-coverage.md), [acceptance test assignments](implementation-tests.md), and [renderer decisions/evidence](video-export-implementation-research.md).

The authoritative plan data is `implementation-plan.json`. Run `python3 docs/design/workflow/validate_implementation_plan.py` to verify coverage, paths, test ownership, dependency acyclicity and generated-document drift. `--write` regenerates these readable files.

## What stays, changes, and is new

<!-- prettier-ignore -->
| Disposition | Implementation decision |
| --- | --- |
| Keep | Authentication SDK; aiService; span labeling/refinement; actual provider input shaping; owned media and grants; durable receipts/attachments; proven player/seek/fullscreen; bounded Sketch loop; Page 21 primitives; legacy refund obligations. |
| Keep and extend | Receipt authority and native workers with durable attempt evidence; immutable media/provenance with project destinations; upload admission with persistent staging/audio; observed results with uniform slots/recovery. |
| Replace | Starting-frame inference of task; one workspace stage; job-gated/fragmented drafts; Studio viewer-as-edit-source; whole-thread implicit context; automatic stale-job/provider retry; unsafe sign-in replay; old share/trash semantics. |
| Build | Project/conversation envelopes, execution-draft revision protocol, exact branch context, customer usage/entitlements, durable clarifications, recovery inbox, small composition editor, real renderer and isolated export deployment. |

The source inventory names the exact existing modules/tests and their limitations. A current test that enforces a rejected workflow is replaced with the new behavior's test in the same implementation work; ownership, identity, data and refund protection tests remain.

## Ready to start Figma design

WP-12 can begin now from the behavior contract, state map, acceptance cases and existing Page 21 components. Schema and test-harness implementation are not design prerequisites. Start with linked wireframes; approval of a replacement layout remains required before its production UI implementation.

Decide during that first design pass:

- Project/conversation navigation and workspace layout
- Explicit action and source display versus read-only media inspection
- Conversation history, version browsing, old-result edits and parked drafts
- Running/unknown/partial/recovery presentation without losing current work
- Image, Sketch and video-editor entry/return behavior plus mobile/keyboard treatment

Map backend states to understandable status/actions and reusable component variants. The 126 internal states do not require 126 full-page mockups. Cover combinations that can coexist, such as viewing an older result while a new draft is edited and another request finishes.

## Architecture decisions for implementation

### One new project identity, explicit legacy origins

Add creation_projects with owner/revision and conversation/draft/media/edit subcollections. Map each legacy session or Studio project through an explicit origin record; never join by title, prompt or timestamp. Legacy readers remain. Adoption uses a dry-run manifest and revision-checked writer switch, not bulk rewriting of old records.

### One acceptance authority, native executors retain their own duties

Extend RequestIdempotencyService and its bindings rather than opening a second acceptance ledger. New creation_requests own immutable intent, fixed slots and aggregate outcomes. Existing video_jobs and provider/Studio attempts own actual execution facts. A unique request+slot native-executor mapping and versioned observations connect them. The outbox cannot dispatch until receipt/reservation/consumed-draft facts commit.

### Independent execution drafts and exact history

Creation, assistance, export settings, imports and Sketch acceptance each have their own execution-draft identity. Their contextual media/editor/draft IDs remain inputs. Media versions and exports are immutable; branch context is stored at acceptance. UI selection, provider completion and project preference cannot rewrite those references.

### Separate state groups without one collection per group

Connection, playback and viewer state are local. Draft save acknowledgments are owner-scoped and revisioned. Request outcome, attempt evidence, cancellation, delivery and usage are separate facts on their appropriate records. The 22 control groups are not 22 database tables or another global state enum.

### Delivery extends existing media ownership

Retain owned-media/storage/admission/grant boundaries. Generalize destination through typed legacy-session, project and owner-recovery adapters. A version becomes deliverable only after verified storage plus authoritative association. Copy creates a new association; repair never changes the original destination or invokes generation.

### Provider capability evidence controls recovery

Every offered provider action must declare external start/status/cancel/result support and captured deadlines. Persist external operation identity and request hash before treating a later browser/worker event as recoverable. When status/cancel is unavailable, expose unable/unknown/needs-attention; do not invent support or retry uncertain generation.

### Deterministic video editing and isolated export

Add shared/video-edit pure commands/validation and a versioned render manifest. Use exact 30 fps frame intervals and 48 kHz samples, fixed initial presets and bundled typography. A dedicated pinned FFmpeg renderer uses bounded local inputs and a private Cloud Run task service with Firestore outbox/Cloud Tasks; it is not a generation provider or the API service at concurrency 80. See the export research for exact proposed limits and qualification gates.

### New customer ledger, preserved existing obligations

New usage/entitlement records own quotes, per-slot reservations/settlement and new purchases. Existing Studio/Sketch provider budgets and legacy refund ledger remain separate. Paid mode stays disabled until server enforcement, production offer configuration and hosted acceptance are complete. Text help/Sketch retain the current bounded free semantics specified by the contract. New v2 provider executor jobs keep native creditsReserved=0 even when their canonical request has a paid usage reservation. Native refund compatibility must never refund or settle v2 customer usage; the canonical request/slot ledger alone does that. The UI reads canonical usage rather than interpreting a native zero-credit field as a free customer request.

### Hosted checkout and deterministic grants

Use provider-hosted checkout rather than a custom checkout UI. A verified paid invoice/purchase identity grants allowance exactly once; redirects and duplicate/out-of-order webhook deliveries cannot grant it. Initial offer has explicit monthly allowance and manual usage purchases only. Cancellation/past-due stops new grants/admission when paid access ends, while captured accepted reservations and owned results remain recoverable. Exact price/allowance/expiry policy is immutable release configuration, not an inferred legacy credit value.

### Feature routing and rollback preserve new data

New project writes are server-gated. Once a legacy origin activates the new writer, stale legacy writes are refused. Rollback disables admission and uses retained v2 read/recovery UI; it does not squeeze new records into old prompt shapes. Existing refunds/attachments/in-flight outcome observation remain operational.

### Adoption fences new authoring, not previously accepted completion

Adoption first commits a source writer epoch/fence that every legacy authoring/intake transaction checks. New legacy authoring and acceptance stop; existing accepted native jobs/turns/admission debts are inventoried under their immutable owner/receipt/native IDs and original destinations. Only allowlisted completion/attachment/refund operations may continue. Their new versions/checkpoints project into the adopted project once using native ID+slot/version keys and a durable cursor/outbox; already copied results deduplicate. Do not trust caller timestamps to claim pre-fence acceptance. Unknown or untraceable in-flight legacy work blocks activation until drained or explicitly resolved; it is never guessed or silently cancelled. Existing charged refund debt keeps its original ledger. Rollback retains the allowlist, projector and canonical read/recovery authority. The completion exception is an internal executor/repair authority: a browser cannot claim it by sending a native ID or purpose flag. Verify the stored receipt/attempt/output binding on every permitted completion.

### Legacy public links require evidence-based binding

Old ShareRecord lacks owner/project/version fields. Bind a legacy link only when authoritative owned-media/version records establish exactly one immutable origin and owner for its storage object; do not infer from prompt, description, title or time. Store the binding/revocation gate before serving it through the new resolver. Zero/multiple possible origins or unverifiable immutable bytes leave the old link unavailable with generic public copy; an authenticated proven owner may explicitly publish a new link from a selected version. Never silently choose a project. Thus saved owned media and uniquely verifiable links survive; preserving every ambiguous old public link is not a promise. Project trash/revocation/rollback must continue to deny bound links, and restoring a project never republishes them.

### Normalization and renderer version are executable identities

WP-21 owns probe/normalized preview proxy creation, cache and cleanup bounds as well as exports. Keys include exact source version/object generation/checksum, normalization version and required decoder/renderer fingerprint; customer-owned originals never change. Accepted exports route to the exact recorded renderer implementation/image digest. Deploying B does not execute A requests under B; retain A routing until its requests/recovery close or report that exact implementation unavailable. Proxy failure pauses preview media time without letting captions/audio drift; it does not imply the source generation failed.

## Dependencies and safe order

These are engineering dependencies, not a sequence imposed on creators. Packages in one wave have their prerequisites available; overlapping files/registrations still require one integration owner. The shared schemas, container/route registration, cross-mode harness and common native worker files are serialized when touched by more than one package.

<!-- prettier-ignore -->
| Wave | Ready packages | Result |
| --- | --- | --- |
| 1 | WP-01, WP-12 | Freeze versioned contracts and adoption boundaries; Approve concrete workspace and state presentations |
| 2 | WP-02 | Build the provider-free acceptance and concurrency harness |
| 3 | WP-03 | Add project/conversation identity and legacy read adapters |
| 4 | WP-04 | Persist execution drafts and edit revisions with compare-and-swap |
| 5 | WP-05, WP-06 | Replace client draft saving and implement offline/auth recovery; Build media history and branch-specific conversation context |
| 6 | WP-07 | Make action preparation and capability validation explicit |
| 7 | WP-08 | Extend receipts into atomic request admission in free mode |
| 8 | WP-09, WP-10 | Adapt real image/video/Studio execution to durable attempt and slot contracts; Extend durable output and attachment repair with owner recovery inbox |
| 9 | WP-11 | Implement truthful cancellation, reconciliation and recovery deadlines |
| 10 | WP-13, WP-22 | Replace the main workspace controller and explicit history/actions UI; Build the new usage ledger, quotes and entitlement enforcement |
| 11 | WP-14, WP-15, WP-16 | Integrate text assistance and durable clarification without hidden execution; Extend imports, staged files and explicit input roles; Reuse media access and player while adding version-aware viewing/download state |
| 12 | WP-17, WP-18, WP-19 | Adapt Sketch acceptance and persist local drawing state; Implement project lifecycle, archive/hide and immutable public shares; Build composition documents and deterministic editing semantics |
| 13 | WP-21, WP-23 | Build deterministic render/export execution and deployment; Build provider-hosted checkout and subscription/usage grant integration |
| 14 | WP-20 | Build the small video editor and preview |
| 15 | WP-25 | Cut over legacy routes/writers and retire contradicted code/tests |
| 16 | WP-24 | Prove full jobs and establish release evidence |
| 17 | WP-26 | Enable the reviewed public offer and close delivery |

WP-25 builds/tests adoption and writer-switch machinery on fixture copies. Production adoption belongs to WP-26 after WP-24 and G-ADOPTION; this avoids a validation/cutover dependency cycle. WP-21 produces the real renderer/reference frames before WP-20's editor parity gate.

## Work packages

### WP-01 — Freeze versioned contracts and adoption boundaries

**Owner:** Shared contracts and architecture. **Depends on:** none. **Status:** planned.

**Keep:** Legacy session/Studio schemas and stored IDs; ADR history; current free mode and provider exclusions.

**Replace:** The old one-global-stage and prompt-as-project assumptions as authorities for new work.

**Build:** Pure action, execution-draft, context, immutable request, slot, version, delivery, composition and usage schemas in shared/schemas/workflow/. A versioned capability/policy manifest and ownership/mapping rules; no new provider or billing activation.

**Existing code boundaries:** `shared/schemas/session.schemas.ts`, `shared/schemas/studio.schemas.ts`, `shared/videoModels.ts`.

**New proposed boundaries:** `shared/schemas/workflow/`, `shared/workflow/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Record adoption of ADR-0025 for implementation and the decisions/rollback boundaries in this plan.
2. Add strict additive wire schemas and tagged IDs; run root typecheck immediately after each shared contract change.
3. Add public-boundary fixtures for unknown legacy metadata, incompatible schema versions, pending versus resolved inputs and zero-credit mode.

**Acceptance:**

- No new writer interprets old fields as new authority; unsupported schema/policy data fails explicitly.
- Contracts include separate execution draft and contextual target identities, immutable destination, per-slot costs and external attempt handles.
- Decode valid legacy and new records; reject malformed IDs, unresolved accepted inputs, unknown action types and missing catalog policies.

**Primary original case IDs:** No original case is uniquely owned here; infrastructure/design/release acceptance is specified above and in supplemental cases/gates..

**Rollback:** Schemas are additive; remove new registrations/feature exposure while retaining readers for records already written.

### WP-02 — Build the provider-free acceptance and concurrency harness

**Owner:** Test infrastructure. **Depends on:** WP-01. **Status:** planned.

**Keep:** Existing Vitest configurations, cross-mode real routes, replay outbound guard and controlled media fixtures.

**Replace:** Fixed-port browser startup and fake transactional tests that cannot reproduce concurrent claims.

**Build:** Parameterized harness URLs/output directories; independent browser contexts/tabs; real Firestore-emulator race profile; barriers and fault injection at external boundaries. A state/event conformance driver and acceptance IDs in application test titles; no production interpreter generated from the design JSON.

**Existing code boundaries:** `tests/e2e/cross-mode/serve.ts`, `tests/e2e/cross-mode/playwright.config.ts`, `tests/integration/helpers/cross-mode/`, `config/test/`.

**New proposed boundaries:** `tests/integration/helpers/workflow/`, `tests/e2e/workflow/`, `tests/fixtures/workflow/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Parameterize the existing controlled browser server and config without changing production networking.
2. Add barriers for acceptance, provider start/status, object write, attachment and billing ack; preserve outbound denial.
3. Add fixture builders and test registration that fail on missing state/case IDs or unavailable mandatory emulator profile.

**Acceptance:**

- The harness can lose any response, restart observations/workers and reorder callbacks deterministically.
- An occupied unrelated server is never killed/reused; the selected test run has its own URL and artifacts.
- Harness self-checks prove a delayed accepted response remains recoverable and two competing real transactions cannot both own one claim.

**Primary original case IDs:** No original case is uniquely owned here; infrastructure/design/release acceptance is specified above and in supplemental cases/gates..

**Rollback:** Harness/config changes land separately; retain the previous cross-mode command until the replacement runs the same proven journeys.

### WP-03 — Add project/conversation identity and legacy read adapters

**Owner:** Project persistence and API. **Depends on:** WP-01, WP-02. **Status:** planned.

**Keep:** SessionStore, StudioProjectStore data and durable owned media; original URLs/IDs and ownership checks.

**Replace:** Implicit project identity from route/global prompt state and timestamp/title-based joins.

**Build:** Project and conversation stores/routes with owner+revision guards, per-conversation acceptance sequence and explicit native-origin mapping. Legacy read adapters that expose honest unknown context and exact original IDs; no eager destructive migration.

**Existing code boundaries:** `server/src/services/sessions/`, `server/src/services/studio/storage/`, `server/src/config/services/`.

**New proposed boundaries:** `server/src/services/projects/`, `server/src/routes/projects.routes.ts`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Add project/conversation repository contracts and owner-scoped stores with idempotent creation.
2. Add legacy-origin adapters and fixture-backed read routes; namespace IDs instead of rewriting them.
3. Add list/open/retry/permission behavior with no silent project creation on lookup failure.

**Acceptance:**

- Legacy sessions and Studio work reopen with the same owned files, ancestry and unknowns.
- Every new project/conversation has one authoritative owner/ID and stable ordered history.
- Equal titles/timestamps do not merge; duplicate creation converges; cross-owner reads/writes fail; missing versus transient load failures differ.

**Primary original case IDs:** HISTORY-01.

**Rollback:** Turn off new-project writes; preserve all v2 records/read routes. Legacy native stores remain byte-compatible.

### WP-04 — Persist execution drafts and edit revisions with compare-and-swap

**Owner:** Draft persistence and API. **Depends on:** WP-03. **Status:** planned.

**Keep:** Existing safe session mutation patterns and server authentication.

**Replace:** Unsubmitted work stored inside current prompt output/version arrays and autosave suppressed during execution.

**Build:** Independent revisioned draft store with open/parked/submitted/discarded lifecycle, immutable submitted snapshots, metadata revisions and retained conflict copies. Separate assistance/export/import/Sketch execution drafts that reference contextual targets without consuming them.

**Existing code boundaries:** `server/src/services/sessions/SessionStore.ts`.

**New proposed boundaries:** `server/src/services/creation-drafts/`, `server/src/routes/creation-drafts.routes.ts`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Add draft creation/save/park/restore APIs with owner and expected-revision checks.
2. Add server CAS, current-revision reads and retained loser/conflict records.
3. Add execution-draft consumption/reuse ports and editor-revision history without coupling to a running job.

**Acceptance:**

- Edits during jobs always have their own recoverable revision.
- Two tabs cannot overwrite one another or mutate an accepted execution draft.
- Real-emulator competing writes preserve both versions; restore appends a revision; same-revision submitted targets refuse proposal mutation.

**Primary original case IDs:** No original case is uniquely owned here; infrastructure/design/release acceptance is specified above and in supplemental cases/gates..

**Rollback:** Disable new draft writes and retain draft recovery/export. Never project new drafts back into a lossy old prompt record.

### WP-05 — Replace client draft saving and implement offline/auth recovery

**Owner:** Client draft/session controller. **Depends on:** WP-04, WP-12. **Status:** planned.

**Keep:** Firebase auth SDK/gates, HTTP validation, navigation shell and working media access.

**Replace:** Global browser keys, local-only Studio text, job-dependent save suppression, implicit POST replay after reauthentication and unscoped hydration cache.

**Build:** Owner-scoped IndexedDB draft/blob/outbox store, local and remote revision acknowledgments, CAS conflict UI, cross-tab coordination, guest adoption and job-independent restore.

**Existing code boundaries:** `client/src/features/prompt-optimizer/context/hooks/useDraftHistorySync.ts`, `client/src/features/prompt-optimizer/PromptOptimizerContainer/hooks/useAutoSave.ts`, `client/src/repositories/AuthRepository.ts`, `client/src/services/http/AuthRetryTransport.ts`.

**New proposed boundaries:** `client/src/features/creation-drafts/`, `client/src/repositories/workflow/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Add local checkpoint/outbox layer with per-owner and per-draft keys, then prove local failure and stale-ack behavior.
2. Replace draft autosave/scope hooks and preserve meaningfully parked work across navigation.
3. Wire reconnect, sign-in/out, account switch and conflicts; never silently submit a never-accepted request after reconnect.

**Acceptance:**

- Exact current revision durability is visible; local failure does not block remotely acknowledged work.
- Another account cannot adopt prior private drafts; accepted jobs reconnect separately from draft hydration.
- Offline edits, two-tab CAS, reload during submission, anonymous adoption collision, sign-out with unprotected changes and all connection/auth states.

**Primary original case IDs:** DRAFT-03, DRAFT-10, DRAFT-11, DRAFT-12, DRAFT-14, JOB-04, RESTORE-01, RESTORE-02, RESTORE-03, RESTORE-04, RESTORE-06, RESTORE-07, RESTORE-08.

**Rollback:** Keep both storage readers and an explicit local export path; disable new editor writes without deleting either outbox.

### WP-06 — Build media history and branch-specific conversation context

**Owner:** History and context services. **Depends on:** WP-03, WP-04. **Status:** planned.

**Keep:** Recorded take ancestry, sourceInputs/provenance and stable Studio call indices.

**Replace:** Whole-thread/current-selection context inference and treating the last prompt version as the sole edit base.

**Build:** Immutable media version index, exact input-role references, request lineage, revised-message links, preferred/favorite metadata and captured branch context. Explicit context-change proposal, unknown-history handling and validated mask/base transform binding.

**Existing code boundaries:** `shared/schemas/session.schemas.ts`, `server/src/services/studio/StudioPolicyEngine.ts`, `client/src/features/space/lineage/`.

**New proposed boundaries:** `server/src/services/media-history/`, `server/src/services/creation-context/`, `server/src/routes/project-history.routes.ts`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Adapt old ancestry and add new media-item/version and ordered request-history readers.
2. Implement branch-context assembly from exact ancestor IDs and project-instruction revisions; persist the materialized context.
3. Implement edit-old-message, variation/reuse, explicit base/context changes and context-limit/summary proposal contracts.

**Acceptance:**

- Old-version edits exclude sibling/later directions; all accepted history stays intact.
- Exact reuse refuses missing historical fields; copy-known-settings is visibly different.
- A→B→C plus A→D, multi-reference contexts, source copies, stale project notes, legacy unknowns, masks and immutable preference/input relationships.

**Primary original case IDs:** HISTORY-02, HISTORY-03, HISTORY-06, HISTORY-08, CONTEXT-01, CONTEXT-02, CONTEXT-03, CONTEXT-05, CONTEXT-06, CONTEXT-09, CONTEXT-13, CONTEXT-14, CONTEXT-15.

**Rollback:** Keep old IDs and original media. New history becomes read-only if writes are disabled; never flatten it into one legacy prompt.

### WP-07 — Make action preparation and capability validation explicit

**Owner:** Action preparation and catalog. **Depends on:** WP-01, WP-04, WP-06. **Status:** planned.

**Keep:** Current model offers/exclusions and proven provider input shaping; generation versus prompt-model IDs remain separate.

**Replace:** Task inferred from startFrame, silent capability clamping and automatic expansion-to-picture dispatch.

**Build:** Prepared action contract with named input roles, missing/invalid reasons, visible defaults, deterministic per-slot seed freeze, context/quote/policy validation and reviewed action hash. Free authorization port now; paid quote integration through the same acceptance interface later.

**Existing code boundaries:** `shared/videoModels.ts`, `shared/capabilities.ts`, `client/src/features/workspace-shell/hooks/useCapabilitiesClamping.ts`.

**New proposed boundaries:** `server/src/services/creation-requests/preparation/`, `client/src/features/project-workspace/api/actions.ts`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Create action registry for the explicitly scoped image/video/assistance/import/export operations.
2. Implement readiness/validation ordering and candidate setting/context changes without mutating existing drafts.
3. Add preparation endpoint and pure client presentation adapters; unsupported offers remain unavailable.

**Acceptance:**

- Run always names the requested action and exact sources/settings/destination.
- Unknown capability, missing recovery deadline or unsupported seed/mask behavior never defaults to permission.
- All ACTION cases; stale model/default changes, fresh seed per deliberate variation, frozen seed on retry, incompatible settings and server revalidation.

**Primary original case IDs:** ACTION-01, ACTION-03, ACTION-04, ACTION-05, ACTION-06, ACTION-07, ACTION-08, ACTION-09.

**Rollback:** Disable a catalog offer/action independently; existing saved results remain readable and active accepted requests retain their snapshots.

### WP-08 — Extend receipts into atomic request admission in free mode

**Owner:** Request admission and persistence. **Depends on:** WP-03, WP-04, WP-06, WP-07. **Status:** planned.

**Keep:** RequestIdempotencyService payload-hash receipts and VideoJobStore atomic publication principles; existing free intake remains zero-credit.

**Replace:** Receipt TTL/lock expiry treated as absence and Studio sequential duplicate checks without atomic uniqueness.

**Build:** Request/slot store, permanent consumed-draft uniqueness record, owner+submission hash binding, immutable snapshot and queue/outbox admission transaction. Query by submission identity, reconciled unknown/rejected outcomes and an injected usage-authorization port with free implementation.

**Existing code boundaries:** `server/src/services/admission/idempotency/RequestIdempotencyService.ts`, `server/src/services/video-generation/runtime/VideoJobStore.ts`.

**New proposed boundaries:** `server/src/services/creation-requests/admission/`, `server/src/services/creation-requests/storage/`, `server/src/routes/creation-requests.routes.ts`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Add durable execution-draft revision uniqueness and snapshot/slot schemas under the existing receipt owner.
2. Commit consumption, receipt, exact slots, authorization reservation and executable outbox visibility atomically.
3. Expose recover-by-submission and wire all new media/action adapters through that single admission gate.

**Acceptance:**

- Same ID/hash and different IDs for one execution-draft revision both converge; changed hash rejects.
- No worker can observe executable work without an authoritative accepted receipt; unresolved receipts cannot expire into duplicate execution.
- Firestore emulator barriers for double click/two tabs, response loss before/after commit, duplicate/changed hash, zero-reservation mode and unauthorized admission.

**Primary original case IDs:** HISTORY-07, DRAFT-04, ACTION-02, JOB-01, JOB-02, JOB-03, RESTORE-05, RESTORE-10, JOB-24, HISTORY-14.

**Rollback:** Stop v2 admission first; continue receipt reads and recovery for accepted work. Never delete consumed-draft tombstones on rollout rollback.

### WP-09 — Adapt real image/video/Studio execution to durable attempt and slot contracts

**Owner:** Provider execution adapters. **Depends on:** WP-08. **Status:** planned.

**Keep:** aiService, image providers, Studio image runners and video request shaping; active video worker/inline processing and lease mechanisms.

**Replace:** Opaque run-to-completion as the only provider contract, global busy/failure and retries based solely on transient error classification.

**Build:** Per-provider start/status/cancel/result contract with external operation handles, explicit unsupported/unknown responses and per-slot attempt history. Idempotent native executor mapping by request+slot; Studio stable batches feeding canonical request outcomes without a second customer ledger.

**Existing code boundaries:** `server/src/services/studio/providers/`, `server/src/services/video-generation/providers/`, `server/src/services/video-generation/runtime/`, `server/src/services/image-generation/`.

**New proposed boundaries:** `server/src/services/creation-requests/execution/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Add provider-attempt ports and external-handle persistence; qualify each currently offered adapter or expose unsupported recovery/cancel honestly.
2. Bridge image, Studio and video execution under accepted slots with one native executor ID per slot.
3. Replace retry classification with proven nonacceptance/nonbilling plus bounded accepted policy; persist provider expense independently.

**Acceptance:**

- Polling, browser abort or worker lease loss never authorize an unproven duplicate generation.
- Batch order is stable and failures preserve successful siblings; no excluded provider is reenabled.
- Contract fixtures for each offered adapter, interrupted dispatch/status, stable slot indices, true provider rejection, partial batches and observed-but-unknown external outcomes.

**Primary original case IDs:** HISTORY-04, JOB-06, JOB-10, JOB-11, JOB-13, JOB-15, JOB-25.

**Rollback:** Disable new adapter dispatch while retaining native job/status readers and durable attempts. Existing free and legacy charged jobs retain their native recovery paths.

### WP-10 — Extend durable output and attachment repair with owner recovery inbox

**Owner:** Media delivery and recovery. **Depends on:** WP-03, WP-08. **Status:** planned.

**Keep:** Owned-media resolvers, storage copy/grants, take identity, owed attachments and repair without regeneration.

**Replace:** Session/words-version-only destination assumptions and conflating generation success with delivery readiness.

**Build:** Generic version/slot output publication, independent storage and destination association states, authoritative owner recovery inbox and separate copy admission.

**Existing code boundaries:** `server/src/services/admission/`, `server/src/services/sessions/OwedTakeAttachmentStore.ts`, `server/src/services/owned-media/`, `server/src/services/storage/`.

**New proposed boundaries:** `server/src/services/media-delivery/`, `server/src/routes/recovery-inbox.routes.ts`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Add immutable version publication after verified owned storage and before delivery/settlement.
2. Adapt existing attachment debt/repair to original project or recovery inbox with exact result identity.
3. Add recovery listing/restore/copy, lost-output evidence and duplicate/contradictory result handling.

**Acceptance:**

- Stored-but-unlinked work is discoverable and repairable; destination loss never silently creates a project.
- Repair does not regenerate; copying creates a separate association and never retargets the original request.
- Storage copy failure/expiry, link failure, deleted destination, duplicate callbacks, failed/lost late outputs, same bytes versus conflicting extra bytes and ownership denial.

**Primary original case IDs:** JOB-08, JOB-09, JOB-14, RESTORE-09, RESTORE-11, JOB-26.

**Rollback:** Preserve recovery readers/debt processing even if the new workspace is disabled. Do not delete already stored versions or fall back to regeneration.

### WP-11 — Implement truthful cancellation, reconciliation and recovery deadlines

**Owner:** Execution recovery. **Depends on:** WP-09, WP-10. **Status:** planned.

**Keep:** Existing claims/leases, terminal evidence, attachment recovery and legacy charged-job refunds.

**Replace:** Browser abort as server failure; blind stale-job replay; unsupported cancellation reported as success.

**Build:** Cancellation intent/confirmation facts, bounded reconciliation using durable external handles, captured recovery policies, needs-attention state and release obligations. A narrowly scoped worker for new accepted requests; no resurrection of retired generic DLQ replay.

**Existing code boundaries:** `server/src/services/video-generation/runtime/processVideoJob.ts`, `server/src/services/video-generation/runtime/VideoJobWorker.ts`, `server/src/config/services.initialize.ts`.

**New proposed boundaries:** `server/src/services/creation-recovery/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Implement pre-dispatch cancel transaction and adapter-specific running cancel with explicit unable state.
2. Implement unknown/late/contradictory outcome reconciliation and same-identity manual recovery.
3. Implement captured deadline exhaustion, needs-attention delivery and idempotent customer-release obligations through the usage port.

**Acceptance:**

- Confirmed cancellation is never erased; late results are retained without re-debit.
- Every wait has a captured deadline/manual recovery path, and no unknown outcome is silently converted into failure or a new provider call.
- Both orders of cancel/start, cancel/complete, expiry/recovery and trash/complete; lease loss, provider status unsupported, manual recovery and no duplicate expense/charge.

**Primary original case IDs:** JOB-05, JOB-07, JOB-12, JOB-16, JOB-17, JOB-18, JOB-20, JOB-21.

**Rollback:** Stop new dispatch but retain reconciler/recovery worker for accepted requests; preserve legacy refund worker independently.

### WP-12 — Approve concrete workspace and state presentations

**Owner:** Product UI design. **Depends on:** none. **Status:** planned.

**Entry criteria:**

- The existing workflow contract, state map and acceptance scenarios are available as the design baseline; wire schemas and the executable application harness are not prerequisites.
- Inspect the current Page 21 component library before authoring; preserve existing pages and use a dedicated new design page.
- Use wireframes and linked interactions to review unresolved presentation choices before marking designs approved.

**Keep:** Page 21 components/tokens, existing Figma pages and the established inspection/ownership safeguards.

**Replace:** Visual layouts that imply one required creation order or one whole-workspace stage.

**Build:** Dedicated design page for the new workspace, conversation/history, draft/input controls, recovery and small video editor; per-state component/variant mapping. Include the account/usage, hosted-checkout return and entitlement-blocked presentations; retain Page 21 styling. Desktop/mobile/keyboard walkthroughs mapped to the readable state inventory; owner review of actual linked frames.

**Existing code boundaries:** `docs/design/page21-component-migration.md`, `docs/design/page21-tokens.json`, `packages/promptstudio-system/`.

**New proposed boundaries:** `docs/design/workflow/ui-state-evidence.json`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Choose the project/conversation navigation, workspace regions, visible edit target, history/version controls, draft switching and asynchronous status presentation in wireframes; map each user-visible state to a component variant or connected screen.
2. Create linked concrete screens for the principal jobs, cross-state failures, historical edits and mobile behavior.
3. Record approved frame/component IDs and coverage; amend visual guidance before implementing new compositions.

**Acceptance:**

- Each user-visible state has a reviewed presentation and action/wait reason.
- Existing tokens/components are reused; no acceptance claimed for an unseen layout.
- Walk all 137 cases through the specified controls; demonstrate active draft versus viewed result, pending result source, old-message revision and recovery without focus loss.

**Primary original case IDs:** No original case is uniquely owned here; infrastructure/design/release acceptance is specified above and in supplemental cases/gates..

**Rollback:** No production effect; retain rejected design alternatives as history rather than overwriting approved source pages.

### WP-13 — Replace the main workspace controller and explicit history/actions UI

**Owner:** Project workspace frontend. **Depends on:** WP-05, WP-06, WP-07, WP-08, WP-10, WP-12, WP-09, WP-11. **Status:** planned.

**Keep:** Design primitives, prompt editor/highlighting and read-only media viewing contracts.

**Replace:** CanvasWorkspace global deriveWorkspaceStage, CanvasSettingsRow inferred Generate, implicit expansion gate and Studio selection-as-edit-input state.

**Build:** Project/conversation workspace controller with separate viewer, active/parked drafts, explicit targets and request history; exact image follow-up behavior.

**Existing code boundaries:** `client/src/features/workspace-shell/CanvasWorkspace.tsx`, `client/src/features/workspace-shell/components/CanvasSettingsRow.tsx`, `client/src/features/workspace-shell/utils/deriveWorkspaceStage.ts`, `client/src/features/studio/hooks/useStudioProject.ts`.

**New proposed boundaries:** `client/src/features/project-workspace/`, `client/src/features/request-history/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Build the new shell/controller against contract fixtures with separate view/draft/request IDs.
2. Wire explicit Create/Edit/Animate/Variation/Reuse/Use words/history-revision actions to real feature APIs.
3. Add pending-result binding, multi-result choice, unavailable input and deterministic late-completion handling; remove old controller mount for v2 projects only.

**Acceptance:**

- Viewing never edits; background completion resolves only a recorded matching pending source.
- Every task is chosen explicitly and all old/new drafts and source versions remain reachable.
- Primary browser history/draft/input cases, mobile layout and keyboard actions; direct text-to-video never silently becomes picture generation.

**Primary original case IDs:** HISTORY-10, HISTORY-12, HISTORY-13, CONTEXT-04, DRAFT-01, DRAFT-02, DRAFT-05, DRAFT-06, DRAFT-07, DRAFT-08, DRAFT-09, DRAFT-15.

**Rollback:** Per-project feature routing restores the prior shell only for legacy records; v2 projects retain compatible read/recovery UI rather than being rendered by lossy legacy controllers.

### WP-14 — Integrate text assistance and durable clarification without hidden execution

**Owner:** Assistance service and UI. **Depends on:** WP-06, WP-07, WP-08, WP-12, WP-13. **Status:** planned.

**Keep:** aiService, span-labeling accuracy/eval path, suggestions and optimization engines as optional helpers.

**Replace:** Whole-thread implicit context, clarify-once policy, ephemeral streams and assistance consuming the target draft.

**Build:** Assistance execution drafts, saved response/proposal records, persistent question IDs, stale/frozen-target checks and explicit Apply/new-draft actions.

**Existing code boundaries:** `server/src/services/ai-model/`, `server/src/services/studio/StudioPolicyEngine.ts`, `server/src/services/prompt-optimization/`, `client/src/features/span-highlighting/`.

**New proposed boundaries:** `server/src/services/creation-assistance/`, `client/src/features/creation-assistance/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Add assistance-action receipt and final-response storage while retaining provisional stream separately.
2. Bind questions/answers/proposals to exact target revision, context and editability; allow clarification at every turn.
3. Wire explicit Apply/diff/new draft and context-summary actions without media dispatch.

**Acceptance:**

- Ask cannot consume/overwrite a media draft or execute generation.
- Late/stale/frozen-target responses are recoverable proposals with explicit destination, never silent edits.
- Branch-context capture, lost/interrupted streams, multiple questions, stale same-revision frozen target, summary review and negative dispatch count assertions.

**Primary original case IDs:** CONTEXT-07, CONTEXT-08, CONTEXT-10, CONTEXT-11, CONTEXT-12, JOB-23, CONTEXT-16.

**Rollback:** Disable optional helpers while preserving their conversation entries/proposals; keep the underlying media draft and baseline authoring usable.

### WP-15 — Extend imports, staged files and explicit input roles

**Owner:** Media admission and upload UI. **Depends on:** WP-05, WP-06, WP-07, WP-08, WP-10, WP-12, WP-13. **Status:** planned.

**Keep:** Owned upload/admission checks and durable copy isolation.

**Replace:** Filename/URL identity, mount-only pending references and input removal implicitly cancelling shared uploads.

**Build:** Owner-scoped staged blob checkpointing, idempotent upload/import intents, content/fingerprint verification, role binding and shared-upload cancellation scope. Audio admission for the new editor with explicit allowed types/size/duration and ownership validation.

**Existing code boundaries:** `server/src/services/admission/`, `server/src/services/storage/config/storageConfig.ts`, `client/src/features/prompt-optimizer/PromptOptimizerContainer/hooks/usePendingFirstFrame.ts`.

**New proposed boundaries:** `client/src/features/project-imports/`, `server/src/services/admission/project-inputs/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Extend admission for typed image/video/audio input handles and verified content metadata.
2. Persist staging and upload intent independently of draft associations; implement missing-bytes/reselect and cancellation races.
3. Wire import/copy/use actions and mask/context invalidation with the new draft model.

**Acceptance:**

- Only verified owned ready files enter requests; every pending input is recoverable or accurately missing.
- Removing one association never cancels another draft's upload; late uploads do not reattach themselves.
- All upload states, wrong-content extension, different bytes with same filename, two-draft shared upload, auth loss, role preservation and cross-owner denied import.

**Primary original case IDs:** HISTORY-11, MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04, MEDIA-05.

**Rollback:** Keep all accepted copies and legacy import paths; disable new media types/actions independently without deleting staged or admitted data.

### WP-16 — Reuse media access and player while adding version-aware viewing/download state

**Owner:** Viewer and media delivery UI. **Depends on:** WP-06, WP-10, WP-12, WP-13. **Status:** planned.

**Keep:** MediaUrlResolver, owned signed-URL grants, decoded playback/fullscreen/seek behavior and download utility.

**Replace:** Any viewport/result state inferred from active generation and any downloaded-to-disk claim without browser evidence.

**Build:** Version-aware display/error adapters, distinct media-access/playback/download state and exact selected-version refresh.

**Existing code boundaries:** `client/src/features/workspace-shell/components/SelectedResult.tsx`, `client/src/services/media/MediaUrlResolver.ts`, `client/src/utils/downloadMedia.ts`, `server/src/infrastructure/signedUrl/`.

**New proposed boundaries:** `client/src/features/project-workspace/media/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Connect stable version handles to existing media resolver and preserve source ownership checks.
2. Adapt player/fullscreen/selection to independent viewer state with explicit loading/denied/unavailable/buffering errors.
3. Implement file-transfer status and retry for the exact stored version without another render/generation.

**Acceptance:**

- Original proven playback/media handling remains functional across new histories.
- URL expiry and transfer failures cannot mutate generation outcome, input binding or usage.
- All access/player/download states, authentic Range/206 seek, autoplay refusal, fullscreen restore and negative stale-URL/other-owner access.

**Primary original case IDs:** MEDIA-06, MEDIA-07, MEDIA-08, MEDIA-09, LIFECYCLE-11.

**Rollback:** Retain existing media endpoints and view grants; old and new histories can still read/download stored assets.

### WP-17 — Adapt Sketch acceptance and persist local drawing state

**Owner:** Sketch integration. **Depends on:** WP-05, WP-08, WP-10, WP-12, WP-13, WP-15. **Status:** planned.

**Keep:** Bounded live-preview loop, one-in-flight/newest-pending discipline, exact displayed output capture and server Sketch budget.

**Replace:** Mount-scoped acceptance envelope, ephemeral drawing restore and acceptance automatically arming unrelated work.

**Build:** Local drawing/settings checkpoints, persistent action draft/receipt, explicit project admission and separate Use as input action.

**Existing code boundaries:** `client/src/features/realtime-sketch/`, `server/src/services/sketch-budget/`, `server/src/routes/sketch-accept.routes.ts`.

**New proposed boundaries:** `client/src/features/realtime-sketch/persistence/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Add owner-scoped local drawing restore without restarting dispatch.
2. Route exact displayed-output acceptance through durable execution identity and generic delivery.
3. Allow accepting retained valid output at error/paused/allowance-limit states; wire recovery and explicit use in current draft.

**Acceptance:**

- No preview rerun is needed to save or recover the displayed image.
- Allowance blocks new frames only; unaccepted outputs make no durable-history claim.
- Every Sketch state, O1/O2 acceptance race, double press/reload, allowance acceptance, changed settings, navigation/account switch and no retroactive customer charge.

**Primary original case IDs:** MEDIA-10, MEDIA-11, MEDIA-12, MEDIA-13, MEDIA-14.

**Rollback:** Preserve existing accepted images and budget ownership; feature flag can disable new handoff without erasing local drawings or admitted outputs.

### WP-18 — Implement project lifecycle, archive/hide and immutable public shares

**Owner:** Project lifecycle and sharing. **Depends on:** WP-03, WP-05, WP-06, WP-08, WP-10, WP-11, WP-12, WP-13, WP-16. **Status:** planned.

**Keep:** Existing clip rendering, owner checks, original share records and stored media.

**Replace:** Leaf-only removal presented as general history management and share resolution independent of authoritative project trash/revocation.

**Build:** Explicit hide/restore, conversation archive/restore, project trash/freeze, permanent recovery access and idempotent immutable-version publication/revocation.

**Existing code boundaries:** `server/src/services/share/`, `client/src/features/share/`, `client/src/pages/HistoryPage.tsx`.

**New proposed boundaries:** `server/src/services/projects/lifecycle/`, `client/src/features/project-workspace/lifecycle/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Add revisioned organization metadata and non-destructive hide/archive semantics.
2. Commit project non-writability/public denial before trash acknowledgment; apply dispatch and delivery race rules.
3. Add publication/revocation receipts and immutable version targets. Legacy links use verified owner/project/version bindings; unbound or ambiguous old links are unavailable and require explicit republish rather than bypassing denial.
4. Wire management UI and duplicate/unknown outcome recovery.

**Acceptance:**

- Trash denies links immediately and routes later outputs to recovery; restore never republishes/restarts work.
- Hide/archive do not destroy ancestry, active inputs or accepted jobs; permanent purge remains unavailable.
- Lifecycle cases and both race orders for archive/new submit, trash/start/complete/share resolution; link replay, lost revocation and owner denial.

**Primary original case IDs:** HISTORY-05, HISTORY-09, LIFECYCLE-01, LIFECYCLE-02, LIFECYCLE-03, LIFECYCLE-04, LIFECYCLE-05, LIFECYCLE-06, LIFECYCLE-07, LIFECYCLE-08, LIFECYCLE-09, LIFECYCLE-10.

**Rollback:** Keep deny checks and revoked records active even if management UI rolls back; never resurrect revoked links or old writers.

### WP-19 — Build composition documents and deterministic editing semantics

**Owner:** Video edit model and persistence. **Depends on:** WP-03, WP-04, WP-06, WP-07, WP-15. **Status:** planned.

**Keep:** Owned exact media version handles, draft CAS/revision principles and shared pure schema rules.

**Replace:** Any use of generation-history timeline or old continuity metadata as if it were a finished-video edit.

**Build:** New composition schema/store and pure editing/validation module: one visual track, per-clip audio/text, one background track, integer timing, fits/crops and immutable revisions.

**Existing code boundaries:** `shared/schemas/session.schemas.ts`.

**New proposed boundaries:** `shared/video-edit/`, `server/src/services/video-editing/`, `server/src/routes/video-edits.routes.ts`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Define/persist composition revisions and normalized media metadata without touching legacy continuity fields.
2. Implement insert/remove/reorder/trim/replace/text/audio operations and invalid-edit diagnostics.
3. Implement undo/restore as new revisions and exact export snapshot validation.

**Acceptance:**

- All timing, anchors and replacement conflicts follow E01-E09; unsupported effects/tracks are explicitly unavailable.
- No composition source follows a mutable preferred version; revision history never rewinds outputs.
- EDIT operation fixtures with exact frame/sample expectations, invalid source/timing/access, masks/aspect conflicts and generated result not auto-replacing chosen clip.

**Primary original case IDs:** DRAFT-13, EDIT-01, EDIT-02, EDIT-04, EDIT-08.

**Rollback:** Keep composition records read-only/exportable; disabling editing never deletes source media or older exports.

### WP-20 — Build the small video editor and preview

**Owner:** Video editing frontend. **Depends on:** WP-12, WP-13, WP-16, WP-19, WP-21. **Status:** planned.

**Keep:** Existing media player/decoder, design primitives and version viewer.

**Replace:** Any assumption that a completed generation is a finished edited video.

**Build:** Ordered visual editor, trims/reorder, fit/crop preview, timed text/manual captions, source/background audio controls, undo and explicit validation UI.

**Existing code boundaries:** `client/src/features/workspace-shell/components/SelectedResult.tsx`, `packages/promptstudio-system/`.

**New proposed boundaries:** `client/src/features/video-editor/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Build ordered clip/image editing controls against the pure composition operations.
2. Add preview text/audio/timing using the shared render manifest and persistent local/server revision state.
3. Add invalid-edit repair, missing media and immutable export-revision presentation. Wire Export with its own execution draft and the already qualified export API.

**Acceptance:**

- Preview and export use the same versioned timing/layout specification; every state has a visible action or reason export is blocked.
- Composition editing continues during export without modifying the captured revision.
- Browser EDIT cases on desktop/mobile/keyboard; frame anchors, clipping conflicts, background-audio timing, undo and review of exact exported revision.

**Primary original case IDs:** EDIT-03, EDIT-10, EDIT-11, EDIT-12, EDIT-13.

**Rollback:** Fall back to composition read/preview plus existing exports; never convert unfinished edits into a new media generation.

### WP-21 — Build deterministic render/export execution and deployment

**Owner:** Export runtime and deployment. **Depends on:** WP-02, WP-08, WP-10, WP-11, WP-19. **Status:** planned.

**Keep:** Existing ffmpeg/ffprobe binaries in the Docker image, GCS copy/grants, Firestore infrastructure and immutable request/delivery protocols.

**Replace:** API-service resource/concurrency assumptions as renderer deployment and native video-provider jobs as if they already encoded export recovery.

**Build:** Dedicated versioned render manifest/compiler, bounded FFmpeg worker, immutable export request/result, private task transport, resource limits and cancel/progress/outcome records. Owned normalized preview media/proxy cache keyed by pinned source and normalization fingerprints, generated through bounded renderer tasks. Renderer-version dispatch routing and retained old image/manifest availability for accepted exports.

**Existing code boundaries:** `infrastructure/docker/Dockerfile`, `.github/workflows/deploy-cloudrun-firebase.yml`, `server/src/services/storage/`, `scripts/ops/provider-quality/completionEvidence.ts`.

**New proposed boundaries:** `server/src/services/video-export/`, `server/export-worker.ts`, `infrastructure/docker/Dockerfile.renderer`, `infrastructure/render/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Implement manifest compilation and real local fixture rendering with pinned fonts/binary/build fingerprint. Include media probe/normalization/proxy jobs and cache identity; these are prerequisites for editor preview.
2. Implement export action drafts/native executor mapping, progress/cancel/status and atomic owned output delivery.
3. Add bounded private render deployment/task dispatch with token-bound ownership, isolation and timeout/size caps. The accepted outbox and reconciliation obligation exist durably before execution and recover a crash before task enqueue without a browser returning.
4. Expose immutable export settings/status/retry APIs and generate the server reference/parity fixtures needed by the editor; no new frontend composition is part of this commit.

**Acceptance:**

- A render pins exact composition/source/preset/renderer revisions and never calls a generation provider.
- Output validates before Ready; task redelivery cannot run/charge a second export; renderer resources are bounded separately from HTTP API.
- Real FFmpeg fixtures checked by ffprobe/frame/audio assertions, worker crash/timeout/redelivery, cancellation, missing source, save/link failure and exact-revision retry.

**Primary original case IDs:** EDIT-05, EDIT-06, EDIT-07, EDIT-09.

**Rollback:** Stop new exports/task scheduling first; retain queued/running reconciliation and completed file delivery. Keep prior renderer image/manifests for in-flight work.

### WP-22 — Build the new usage ledger, quotes and entitlement enforcement

**Owner:** Usage authorization and settlement. **Depends on:** WP-07, WP-08, WP-09, WP-10, WP-11. **Status:** planned.

**Keep:** Free-mode zero reservations, existing provider Studio/Sketch budgets and completely separate legacy refund obligations.

**Replace:** Historical Keep pricing assumptions and any reuse of legacy refund records as new customer billing authority.

**Build:** New versioned entitlement/allowance ledger, per-slot quotes/reservations/settlement/release, idempotent financial facts and explicit free/paid authorization implementations.

**Existing code boundaries:** `server/src/services/studio/StudioSpendLedger.ts`, `server/src/services/sketch-budget/`, `server/src/services/video-generation/refunds/`.

**New proposed boundaries:** `server/src/services/usage/`, `shared/schemas/workflow/usage.schemas.ts`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Implement pure quote and integer-usage allocation policies with server-owned catalog/pricing revision and free adapter preserved.
2. Implement atomic acceptance reservations and idempotent delivered-slot settlement/release with emulator races.
3. Implement quote expiry, insufficient allowance, late-result no-redebit, recovery-deadline release and audit/reconciliation reads.

**Acceptance:**

- All nine usage states have truthful UI/service behavior; accepted cost cannot silently change.
- Provider expense remains recorded independently from customer settlement, including business-absorbed failures.
- USAGE cases, concurrent last-balance claims, duplicate settlement IDs, partial allocations, confirmed cancel/deadline late results and existing free/legacy refund regression tests.

**Primary original case IDs:** JOB-19, JOB-22, USAGE-01, USAGE-02, USAGE-03, USAGE-04, USAGE-05, USAGE-06, USAGE-07, USAGE-08.

**Rollback:** Force new admission to supervised free/closed mode through an explicit operational choice; continue settling/releasing already accepted paid obligations with original policy.

### WP-23 — Build provider-hosted checkout and subscription/usage grant integration

**Owner:** Commerce integration. **Depends on:** WP-05, WP-18, WP-22. **Status:** planned.

**Keep:** Current authentication/account identity and existing Stripe dependency only; do not revive absent payment services.

**Replace:** Placeholder paid UI or trusting a checkout return URL as proof of entitlement.

**Build:** New server-owned hosted-checkout adapter, verified webhook inbox, subscription-period/top-up grants and a real account usage view. Entitlements granted only from verified provider billing facts; no automatic top-ups, seat changes, coupons or annual-plan flow in the initial offer.

**Existing code boundaries:** `client/src/pages/AccountPage.tsx`, `server/src/config/routes.config.ts`.

**New proposed boundaries:** `server/src/services/billing/`, `server/src/routes/billing.routes.ts`, `client/src/features/account-usage/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Add sandbox-capable checkout/customer ownership and signed raw-body webhook verification at a dedicated route.
2. Grant/reconcile allowance by unique paid invoice/purchase identity, handling duplicates and out-of-order billing facts.
3. Wire account/usage views and explicit purchase; return navigation polls authoritative entitlement and cannot grant itself credits.

**Acceptance:**

- Payment completion, cancellation, failed payment, expired period and duplicate webhooks map deterministically to usable/blocked new allowance.
- Captured accepted reservations continue under their policy; account status changes do not erase stored work or create duplicate grants.
- Synthetic signed webhook fixtures, duplicate event IDs and different events for one invoice, wrong-owner checkout, forged return, failed/cancelled checkout and period expiry.

**Primary original case IDs:** No original case is uniquely owned here; infrastructure/design/release acceptance is specified above and in supplemental cases/gates..

**Rollback:** Disable new checkout/paid intake independently; keep verified webhook reconciliation, balances, invoices and owed releases readable. No live billing enablement is implied by a green sandbox test.

### WP-24 — Prove full jobs and establish release evidence

**Owner:** Acceptance and release verification. **Depends on:** WP-02, WP-11, WP-14, WP-15, WP-16, WP-17, WP-18, WP-20, WP-21, WP-22, WP-23, WP-25. **Status:** planned.

**Keep:** Existing mandatory gates, controlled-provider outbound guard and meaningful surviving regression tests.

**Replace:** Model-structure checks or provider HTTP success presented as application/creative-quality acceptance.

**Build:** Complete state/transition/case evidence ledger against production modules; end-to-end image, shot and finished-video deliveries; hosted crash/rollback and measured completion-cost qualification.

**Existing code boundaries:** `tests/integration/cross-mode-real-adapters.integration.test.ts`, `tests/e2e/cross-mode.spec.ts`, `.github/workflows/`.

**New proposed boundaries:** `docs/design/workflow/application-acceptance-evidence.json`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Run all state/event drivers and named application acceptance cases, recording source revision, suite/results and no-op side-effect assertions.
2. Run end-to-end mixed-state jobs, emulator concurrency, preview/export parity and every supported adapter conformance profile.
3. Perform separately authorized live/provider-quality and hosted resource/rollback checks with recorded cost bounds and evidence; configure prices/limits only from that evidence.

**Acceptance:**

- No required case or offered capability is skipped/untested; successful model checks alone never close a package.
- Public offer covers only qualified actions; paid launch additionally needs approved production price/allowance data and server bounds.
- All 137 named cases plus supplemental renderer/commerce/cutover tests; every offer has its required inputs/recovery/cancellation availability and quality/cost record.

**Primary original case IDs:** No original case is uniquely owned here; infrastructure/design/release acceptance is specified above and in supplemental cases/gates..

**Rollback:** A failed release gate leaves the new surface/testing controlled and paid/public activation off; keep the evidence and original failures.

### WP-25 — Cut over legacy routes/writers and retire contradicted code/tests

**Owner:** Compatibility and cutover. **Depends on:** WP-03, WP-05, WP-06, WP-13, WP-14, WP-15, WP-16, WP-17, WP-18, WP-20, WP-21, WP-22, WP-23. **Status:** planned.

**Keep:** Saved legacy media/IDs/provenance, necessary compatibility reads, outstanding native jobs/refunds and real retained regression coverage.

**Replace:** Old mandatory-loop mounts/controllers and tests that enforce retired behavior, only after their replacement acceptance tests pass.

**Build:** Idempotent per-origin project adoption manifest, owner/revision-checked writer switch, read-after-switch verification and rollback/read-only route for v2 records. Writer-epoch fence plus allowlisted pre-adoption native completion/attachment/refund IDs, durable exactly-once projection into canonical media/history, and a catch-up watermark before activation. Evidence-based legacy-share binding report; unresolved/ambiguous links stay unavailable with explicit republish for a proven owner.

**Existing code boundaries:** `client/src/components/navigation/SessionPathRedirect.tsx`, `client/src/features/prompt-optimizer/`, `client/src/features/workspace-shell/`.

**New proposed boundaries:** `server/src/services/projects/adoption/`, `scripts/ops/workflow-adoption/`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Build dry-run inventory and stable mapping without mutating source records; prove route/deep-link/media compatibility on fixture copies. Include accepted queued/running jobs, Studio slots and attachment/refund debts; fence new acceptance before finalizing the inventory.
2. Implement the revision-checked activation command and stale-legacy-write refusal, exercised on isolated fixture copies only; production invocation belongs to WP-26 after WP-24 and explicit migration authorization. Permit only pre-fence accepted completion/debt operations with their original identities, and checkpoint their exactly-once canonical projection before activation.
3. Remove old mandatory-loop mounts for v2 records and replace contradicted tests after new acceptance passes; retain code/readers required by unmigrated legacy records and outstanding obligations.

**Acceptance:**

- No record has two active authoring authorities and no migration fabricates missing history.
- New data remains readable if admission/UI rolls back; legacy projects and saved media links still open correctly.
- Every pre-adoption accepted operation either drains or remains traceably recoverable across activation/rollback; no v2 history goes stale from late native completion.
- Old public links survive only when exact authoritative ownership/origin is provable; unresolved links are unavailable and never guessed.
- Before/after counts, sample/full fixture identity checks, duplicate adoption, stale-tab write rejection, mixed legacy/v2 reopen and rollback of a project with new outputs.

**Primary original case IDs:** No original case is uniquely owned here; infrastructure/design/release acceptance is specified above and in supplemental cases/gates..

**Rollback:** Do not reverse-copy v2 data into legacy shapes. Disable new writes and serve the retained v2 read/recovery route; reverse activation only before any v2 write, otherwise preserve the new authority.

### WP-26 — Enable the reviewed public offer and close delivery

**Owner:** Release operations. **Depends on:** WP-21, WP-22, WP-23, WP-24, WP-25. **Status:** planned.

**Keep:** Current controlled free mode until the release gates are met.

**Replace:** Unrestricted launch inferred from test success or the historical provider test allowance.

**Build:** Versioned production offer/limit configuration, staged rollout, cost/queue/recovery alerts and an operational disable-new-admission switch.

**Existing code boundaries:** `docs/operations/DR_RUNBOOK.md`, `.github/workflows/deploy-cloudrun-firebase.yml`.

**New proposed boundaries:** `docs/operations/workflow-release.md`. These paths are planned, not existing implementation claims.

**Small commits:**

1. Prepare reviewed production prices/allowances, provider policy deadlines, render limits and support/refund/recovery operating procedures.
2. After WP-24 and explicit production migration/release authorization, execute the reviewed per-project adoption/deployment and staged configuration; run hosted acceptance/rollback against that exact revision.
3. Enable the authorized offer, verify monitored completion/recovery/cost behavior, and close tracking only with truthful evidence.

**Acceptance:**

- Images, source clips and finished videos each complete/reopen/revise/export under the advertised contract.
- Payment and provider spend activate only within the final authorized release configuration, with tested stop/recovery behavior.
- Hosted media authorization, checkout/entitlement proof, bounded overload and disable-admission drill with in-flight work preserved.

**Primary original case IDs:** No original case is uniquely owned here; infrastructure/design/release acceptance is specified above and in supplemental cases/gates..

**Rollback:** Disable new admission/purchases; retain status, recovery, refunds, owned downloads and existing project access. Do not delete accepted work to stop spend.

## Tests and package completion

A package may land an additive contract with its local boundary tests before a later end-to-end scenario is runnable. An acceptance case remains open until every assigned suite is runnable and passes; testReadyAfter lists all suite owners. G-APP verifies complete closure. Planned suite paths are not existing tests or passing evidence.

- Required contract states/events have real application boundary tests, including default rejections with no provider/process/usage side effects.
- Each assigned acceptance ID is exercised with its original Given/When/Then; fixture-only model traces are not application tests.
- Existing ownership/receipt/media/refund tests stay. Contradicted old workflow assertions change only in the package implementing the replacement behavior.
- Auth, authorization, payment and user-data behavior includes a negative path. Transactional uniqueness/CAS/settlement passes the actual Firestore-emulator race profile without skips.
- Every commit passes root typecheck, quiet ESLint, architecture, unit and replay gates. Shared-contract changes typecheck immediately; registration/lifecycle changes add bootstrap and DI; route/catalog/flag changes add drift checks.
- Before handoff, lint including CSS, build and relevant provider-free browser journeys pass. The required renderer profile runs the real pinned FFmpeg image and checks bytes/frames/audio.
- New UI composition has linked approved designs and browser/accessibility evidence; old Page 21 styling is retained unless explicitly replaced.
- Rollback, saved-record compatibility and outstanding recovery obligations are proved before retiring a route/writer.
- No required missing environment, provider cancellation/status capability, live creative quality, pricing data or hosted rollout evidence is silently marked passed.
- Add executable tests with the behavior change; unimplemented cases stay in this plan, not as skipped/TODO passing application tests. Whole-case closure waits for every required boundary/profile.
- State/event fixtures satisfy every unrelated schema/auth/input/quote prerequisite and demonstrate reaching the owning command/observer. An earlier malformed-payload rejection cannot substitute for the intended state-specific rejection. Assert its specific error/outcome and unchanged effects.

Required commands use the existing repository tools:

```bash
python3 docs/design/workflow/validate_contract.py
python3 docs/design/workflow/validate_implementation_plan.py
npx vitest run <owned-test-paths> --config config/test/vitest.unit.config.js
npx vitest run <owned-integration-paths> --config config/test/vitest.integration.config.js
npm run verify
npm run lint:all
npm run build
npm run verify:drift
PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js
```

The last two checks apply when their route/catalog/flag and registration/lifecycle boundaries change. WP-02 defines the actual provider-free browser invocation and emulator launch/profile from the existing harness; the final plan never treats the currently occupied fixed port or an absent emulator as a passing check. Real-render tests run in the pinned renderer image, with no generation API keys or network calls.

## Activation gates

<!-- prettier-ignore -->
| Gate | Owner / prerequisites | Required evidence |
| --- | --- | --- |
| G-DESIGN | WP-12 /  | Use the existing behavior contract/state cases to begin design now. Concrete state presentations and linked new frames must be reviewed before new UI implementation; schema and harness implementation do not block design. Retain existing Page 21 styling. docs/design/workflow/ui-state-evidence.json (planned) |
| G-EMULATOR | WP-24 / WP-04, WP-08, WP-11, WP-22 | Actual transactional CAS/admission/usage races pass against Firestore emulator. Skips fail this gate. Emulator test report with exact source revision and conflicting-call histories. |
| G-RENDER | WP-24 / WP-19, WP-20, WP-21 | Real render fixture/container/resource checks and browser preview parity pass for every enabled preset. Pinned image/font/manifest hashes, ffprobe/decode/frame/audio assertions and browser artifacts. |
| G-APP | WP-24 / WP-25 | All state/transition/rejection owners, all 137 original acceptance cases, actor adapters and supplemental cases assigned to G-APP have passing application evidence. Hosted/activation supplements remain separate named gates. docs/design/workflow/application-acceptance-evidence.json (planned; missing/skip cannot be green). |
| G-LIVE | WP-24 / WP-09, WP-11, WP-21 | Separately authorized bounded provider quality/cost and staged worker/IAM/recovery/rollback proof qualify the actual offered actions. Current old test spend is not a new allowance. Per-offer output/revision/recovery/cost evidence and staging results; source/catalog data alone is insufficient. |
| G-COMMERCIAL | WP-26 / WP-22, WP-23, WP-24 | Reviewed production prices, customer allocations/expiry policy, provider budgets, recovery/render limits and support policies; verified paid grants and no-redebit behavior. Versioned production offer manifest plus authorized release record. |
| G-ADOPTION | WP-26 / WP-25, WP-24 | Clean migration dry run and counts/identity samples; explicit execution authorization before production adoption; post-run verification. Exact adoption manifest, permission record, before/after identities and rollback rehearsal. |

The plan fixes behavior and technical defaults while leaving external authorizations/data explicit. Exact production pricing, real provider costs, observed render capacity, live creative quality, reviewed visual frames and permission to execute production adoption cannot be invented by a planning document. Missing evidence blocks the corresponding offering/gate; its application behavior is still defined as unavailable or unqualified.

## Initial export profile

The concrete renderer profile is recorded in `implementation-plan.json` and explained with primary sources in [the export research](video-export-implementation-research.md). It starts with three 1080-class MP4 presets, 30 fps, 48 kHz audio, 60-second output, 32 visual items and 100 text cues. One render per 2-vCPU/4-GiB instance, bounded scratch/output, two maximum instances and captured 9/10/11-minute attempt/task/service limits must pass the actual container/staging tests before exposure. These are limits to qualify, not measured capacity promises.

The actual qualification tolerances are fixed before implementing parity checks:

<!-- prettier-ignore -->
| Measurement | Acceptance threshold |
| --- | --- |
| Cut/cue frame-boundary error | 0 frames |
| Pre-encode caption overlay difference | 0 pixels |
| Crop rectangle geometry error | 0 output pixels |
| Decoded 8-bit channel error on fixed lossless fixtures | Mean absolute ≤ 3; 99th percentile absolute ≤ 12 |
| Audio impulse timing after measured encoder-priming alignment | ≤ 48 samples at 48 kHz |
| Audio gain error | ≤ 0.5 dB |

Fixed lossless numbered/color/text/audio fixtures, same pinned renderer/decoder/normalization, BT.709 SDR. Compare browser content at exact media timestamps against server references; exclude UI chrome. AAC encoder priming/padding is measured and aligned, not hidden by relaxing frame/cue timing. If a supported browser cannot pass, block that profile and fix it; changing a threshold requires a reviewed contract change, not automatic blessing.

Initial encoding: MP4/faststart, libx264 medium/CRF 18, yuv420p SDR BT.709, AAC stereo 192k at 48 kHz. These settings and their exact binary/font versions are captured by the renderer manifest; do not silently change them for already accepted exports.

## Current implementation status

This work produces an implementation plan, coverage ledger and executable plan checker. All package/test/coverage statuses remain planned. Existing application tests do not close the new cases. Figma design (WP-12) can begin now. Engineering starts with WP-01 followed by WP-02 and can proceed independently of design where its own dependencies permit; new UI compositions still require reviewed designs.

## Verification of the plan

Recorded 2026-10-10 against source baseline `0f541e60db3b3cf87405de1390e2257adf30d2b8`.

All declared states, transitions, rejected pairs, original cases and reused action actors assigned; dependency graph acyclic; existing module paths verified.

Nine deliberately incomplete/cyclic/unproven plan variants were rejected by the checker.

Typecheck, quiet lint, architecture, 3674 unit tests, replay, full lint/CSS and build passed; 9 existing provider-free cross-mode browser journeys passed (27.6 seconds).

55 existing lint warnings and existing build/tooling warnings remain.

These are existing application baseline checks plus plan validation. None of the planned new application suites, real renderer profiles, production billing, migration or hosted release gates is claimed complete.
