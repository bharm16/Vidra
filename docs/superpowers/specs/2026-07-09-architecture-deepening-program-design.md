# Architecture Deepening Program — Design

**Date:** 2026-07-09  
**Status:** approved for autonomous execution  
**Branch:** codex/architecture-deepening  
**Source:** full architecture audit at commit b848190ff

## Goal

Make the authoring golden path depend on deep, enforceable modules for Takes,
media persistence, workspace decisions, the input, product topology, generation,
and runtime lifecycle. Implement the eight Strong audit findings first. Evaluate
the two Worth exploring findings only after the Strong gates pass.

## Delivery strategy

Use dependency-ordered vertical slices:

1. Take integrity and canonical media.
2. Workspace loop and the input.
3. Authoring topology and generation economics removal.
4. Runtime supervision.
5. Re-audit provider metadata and Expansion against the resulting code.

Each slice must be independently testable and must preserve the current external
wire contracts until its consumers migrate. No big-bang client/server cutover.

## Accepted constraints

- CONTEXT.md and ADR-0001 through ADR-0017 are authoritative.
- The visible input text is the exact text dispatched to models.
- Workspace stage remains derived from durable artifacts; it is never persisted.
- Browsing remains read-only and restoration remains explicit.
- The Selected span remains owned by SelectedSpanContext.
- Frozen implementation stays in the repository but is not load-bearing in the
  authoring topology.
- The existing 202 generation response and run-status polling shape remain
  compatible while the active execution implementation changes.
- No new generic DI framework, provider retry abstraction, generic job engine,
  or one-adapter substitutability interface.

## Slice 1 — Take integrity and canonical media

### Strict Take contract

Replace new loose generation writes with a discriminated shared Take contract:

- common required fields: schema version, stable id, media type, completed
  status, prompt, prompt-version id, media URLs, ancestor generation id,
  archive state, completion timestamp, and model when present;
- picture, image-sequence, and clip variants carry variant-specific media
  fields;
- clip lineage names its immediate source picture for I2V and explicitly uses
  null only for a true root clip;
- runtime schemas validate every new write and every client fetch.

Historical session documents remain readable through a legacy normalization
adapter. The adapter may recover fields already present in a legacy record, but
must not invent ancestry for new records. Invalid legacy records are omitted
from the rendered space with structured diagnostics; they are not silently
rewritten during reads.

### Transactional lineage

SessionStore owns Firestore transactions for:

- idempotent Take upsert by stable id;
- creation of a just-materialized prompt version plus its first Take;
- leaf-only archive with the child check and update in the same transaction.

SessionService performs ownership and domain validation, then delegates the
mutation. It no longer reads a session, edits a stale aggregate, and calls
whole-session save for append/archive operations.

### Canonical media persistence

One generated artifact receives one durable write:

- a first-frame provider returns a provider result; the first-frame
  orchestration path ingests it once through the existing
  StorageService.savePreviewImage ownership path, then builds the picture Take
  from that canonical descriptor;
- video provider adapters already persist through VideoAssetStore; that
  descriptor becomes canonical and the later StorageService.saveFromUrl copy
  is removed;
- routes and job processors do not name storage categories or parse asset ids
  from paths.

### Completion invariant

For a lineage-bearing clip, success means both canonical media and a validated
Take exist:

1. Generate or reuse the stored-media checkpoint.
2. Transactionally upsert the Take.
3. Mark the generation run completed.

Take upsert is idempotent, so a crash between steps 2 and 3 can retry safely.
The stored-media checkpoint is readable on retry so the provider is not invoked
again merely because completion bookkeeping failed.

Inline and worker execution use the same completion module. A lineage-bearing
run cannot omit the completion dependency. A Take persistence failure keeps the
run retryable and never reports completed.

## Slice 2 — Workspace loop and the input

### Workspace decision module

Deepen the existing stage derivation into one pure decision module. Given
durable artifacts, in-flight/failure state, dirty-text state, selected model
tier, and available action intents, it returns:

- S0–S6 stage;
- player and input projection;
- next-step label and disabled reason;
- one next-step intent;
- retry intent when applicable.

CanvasSettingsRow, FrameStage, and CanvasWorkspace render the returned
decision. They do not independently select Expansion, remake-picture, draft,
render, Keep, or retry behavior. S6 becomes reachable from a real kept artifact
rather than a hardcoded false value.

### The input module

Replace independently writable inputPrompt, displayedPrompt, and
optimizedPrompt state with:

- immutable original words;
- one canonical working text;
- internal optimizer/run metadata;
- explicit domain operations for edit, apply Expansion, restore original,
  restore Take, reset, and optimizer lifecycle.

The input module also owns the contenteditable ref, selection/caret
synchronization, span interaction wiring, asset-trigger autocomplete, and
insertion. Workspace callers receive a narrow rendering surface and domain
operations rather than DOM event bundles. SelectedSpanContext remains the
accepted click-to-enhance seam.

The dispatch contract asserts byte equality between visible working text and
the model-bound text.

## Slice 3 — Authoring topology and Generation

### Executable topology

Introduce an explicit composition profile selected once at startup:

- **authoring:** Expansion, refinement, first-frame generation, single-shot
  motion/generation, sessions, assets, storage, cache, and thin observability;
- **frozen expert wall:** continuity, convergence, sequence editing,
  keyframes, storyboard planning, face swap, image observation, model
  intelligence, payment/credits, and the durable video-job resilience workers.

The authoring profile owns server registration, routes, warmers, and runtime
participants. The golden-path client uses an authoring workspace composition
that does not synthesize continuity shots or expose continuity mutations.
Frozen routes and tokens remain available only through the explicit frozen
profile used by focused legacy tests or a future thaw.

### Active Generation

Preserve the client's 202 plus status-polling contract while replacing the
active credit-bearing job intake with a narrow authoring run implementation:

- create a stable generation run;
- enforce a per-user UTC-day hard cap;
- invoke the existing provider module;
- use canonical media persistence;
- call the Take completion module;
- expose queued, processing, completed, or failed status.

The authoring run has no credit ledger, starter credits, payment dependency,
keyframe/face-swap preprocessing, provider circuit, DLQ, sweeper, reconciler,
heartbeat, or retention worker. The durable job implementation remains
available behind the frozen profile; only its shared Take-completion seam is
deepened by Slice 1.

The daily cap is configured with AUTHORING_DAILY_GENERATION_LIMIT. The initial
default is 20 provider invocations per user per UTC day and is an operational
knob, not a product entitlement.

## Slice 4 — Runtime supervision

Create one runtime supervisor whose registered participants declare:

- enabledness for the selected process role/profile;
- start;
- optional drain;
- stop;
- health snapshot.

Startup starts participants in registration order. Shutdown stops new work,
drains with the configured deadline, and stops participants in reverse order.
Health and readiness are derived from the same registry. Route registration
must not create background intervals.

The existing PollingWorkerBase remains intact. Its six real adapters plus the
video worker, retention loop, capability probe, and readiness probe register
with the supervisor when their profile is active.

## Error handling

- Contract errors reject new writes before storage/session mutation.
- Legacy read errors are diagnostic and local to the malformed record.
- Media persistence failure creates no Take and no completed run.
- Take persistence failure leaves a run retryable and reuses its media
  checkpoint.
- A hard-cap rejection returns 429 with a stable error code and reset time.
- Provider failures retain provider-specific safe error mapping.
- Runtime participant startup failure aborts the process role; shutdown failure
  is logged and the remaining participants still stop.

## Verification strategy

Every behavioral change follows red-green-refactor. Bug fixes add
\*.regression.test.ts tests at the failure boundary without mocking the module
being fixed.

Required focused invariants:

1. Inline and worker execution both persist a reloadable clip Take.
2. Take failure prevents completed status; retry creates no duplicate.
3. Picture and clip paths each perform exactly one durable write.
4. Concurrent append/append and append/archive preserve lineage invariants.
5. Legacy sessions remain readable; malformed new Takes reject.
6. S0–S6 decisions select exactly one legal next intent.
7. Visible input bytes equal dispatched bytes after edit, Expansion, history,
   autocomplete, and Take restoration.
8. Authoring topology contains no frozen routes, tokens, warmers, or workers.
9. Active Generation reaches a provider without credits and enforces the hard
   cap.
10. Every started runtime participant is drained/stopped and appears once in
    health.

Each slice runs targeted tests first. Final validation runs typecheck, lint,
unit, targeted integration/E2E, architecture checks, and build.

## Secondary-candidate checkpoint

After all Strong gates pass:

- re-run the deletion test on provider executable metadata. Implement adapter-
  local metadata only if duplicate executable facts still exist across
  dispatch, capability translation, and availability;
- re-run the deletion test on Expansion. Replace the one-adapter legacy
  optimization strategy only if the authoring topology still exposes its wide
  request and untyped metadata.

These candidates do not block completion of the Strong program.

## Out of scope

- Deleting frozen code.
- Rewriting historical session documents in place.
- Persisting workspace stage or camera layout.
- A second text surface.
- Payment-at-Keep implementation.
- Generic worker, provider, storage, or DI frameworks.
- Dependency upgrades.
