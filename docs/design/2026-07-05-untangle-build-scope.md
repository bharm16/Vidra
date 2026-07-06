# ADR-0010 build scope — Milestones 2–7

Status: **signed off 2026-07-06 by owner. Build proceeds from M2a, test-first via `/tdd`.**
Companion to [ADR-0010](../adr/0010-one-visible-text-one-loop-subscription-at-keep.md).
M1 (inline player) shipped: `5c63aa43`. Evidence anchors come from the 2026-07-04 verified
deep map (64 + 46 agent runs).

> **Revised 2026-07-06** to fold in [ADR-0012](../adr/0012-the-space-lineage-network.md)
> (the space supersedes the flat takes strip), [ADR-0013](../adr/0013-space-lineage-is-persisted-not-derived.md)
> (lineage is persisted, not derived), the
> [design handoff](handoff/returns/design_handoff_vidra/README.md) and its
> [rulings](handoff/returns/RULINGS.md), and a 2026-07-06 contract audit (the video-job
> poller and the picture-persistence gap). **What changed from the 2026-07-05 draft:**
>
> 1. **M2a is confirmed stage-enum-only.** The design handoff's eight-value `moment`
>    machine maps onto the seven-value stage enum with `pictureFail`/`clipFail` expressed as
>    the `failure` flag (not separate beats), matching today's `status: 'failed'` model. The
>    handoff's node/edge model is **not** built in M2a — it lands with the space (M5). M2a
>    stays behavior-preserving.
> 2. **M4 splits.** The takes strip is gone (ADR-0012). "Nothing punishes" (failures + auth)
>    stays M4; **the space becomes a new M5**; deletions slide to M6 and instrumentation to
>    M7. Rationale: a milestone must have one reason to exist — welding error copy and an
>    auth interceptor to a net-new graph feature would make the loop's early wins un-shippable
>    until the whole space is built.
> 3. **The moving beat** renders a plain generating tile; the "picture under a progress veil"
>    treatment (ADR-0010's S4 wording) is deferred polish, recorded not built.
> 4. **Async is the existing poller.** Clip completion polls `GET /api/preview/video/jobs/:jobId`
>    (live, with a shared Zod schema; the client already polls it); pictures resolve
>    synchronously. The handoff's timers were stand-ins.

## Ground rules for every milestone

- **Gate:** golden-path e2e green + full unit suite + `npx tsc --noEmit` before merge; the
  truth contract gets its own regression (see M2b).
- **Test-first:** implementation runs red-green-refactor from M2a onward (owner directive) —
  invoke the `tdd` skill; the existing ~7.5k-test suite is the net.
- **Frame-verification deletion:** the 2026-07-05 cleanup confirmed the working tree is clean
  (the "sibling session files" were formatter churn over already-merged work). The
  frame-verification deletion (now M6) follows the ADR-0010 procedure — archive to a branch,
  then delete — with no external branch to wait on.
- **Order:** M2a → M2b → M3 → M4 → M5 → M6 (deletions land as their replacements land) → M7.
  Each milestone is independently shippable and independently revertible.

---

## M2a — The state enum (client refactor, behavior-preserving)

**Goal:** one explicit workspace stage drives everything; the five-flag derivation dies.

- New `WorkspaceStage` = `empty | writing | painting | picture | moving | clip | kept`
  (S0–S6), owned by one store. `computeWorkspaceMoment.ts` (today a 4-value union
  `empty | drafting | rendering | ready`), the 5-condition `isPreWork`
  (`CanvasWorkspace.tsx:380-385`), and `IdeaBoxStage` (`idea-box/types`) become derivations
  or fold in. Every button label becomes a pure function of stage.
- **Stage is derived from artifacts, not persisted** (decision D2 below): presence of
  description / frame / clip / in-flight run reconstructs the stage on restore, so a
  reloaded session lands in the right beat without a new persistence contract.
- **Failure is a flag on the stage** (`{stage, failure?}`), not a separate machine. The
  handoff's `pictureFail`/`clipFail` are the rendered form of `{stage: picture|moving, failure}`
  — not first-class stages. This matches today's `GenerationStatus` (`pending | generating |
completed | failed`) and the `IdeaBoxStage` `failed` kind.
- **The node/edge model is NOT built here.** M2a is a behavior-preserving refactor; the
  space's lineage model + rendering is net-new and lands in M5. (Rejected: the handoff's
  "the node/edge model is the enum M2a builds" — it conflates vocabulary adoption with a
  net-new feature and would break M2a's behavior-preserving guarantee.)
- Touches: `CanvasWorkspace.tsx`, `FrameStage.tsx`, `CanvasSettingsRow.tsx` (handleGenerate
  routing), `PromptResultsActionsContext`, `useIdeaBox.ts`.
- Tests: existing workspace-shell suites keep passing unchanged (behavior-preserving);
  new unit: stage derivation table (artifacts → stage).
- Size: **M (2–4 focused days).** Risk: restored-session edge beats — covered by the
  existing restored-session regression tests.

## M2b — The prompt-truth pipeline (cross-layer)

**Goal:** what the creator sees is byte-for-byte what models receive.

- **Video dispatch sends the input's prose verbatim.** Delete `applyTuneChips` at dispatch
  (`CanvasWorkspace.tsx:156-165`), `appendMotionGuidance` + `camera_motion_id`/
  `subject_motion` params (`server/.../video-generate/motion.ts:67-101`,
  `requestPlan.ts:167-179`, `useGenerationsRuntime.ts:233-257`), and the
  `SubjectMotionInput` component.
- **Picture prompt is deterministic:** unedited text → `renderPreviewPrompt` from the
  expansion's structured slots (`videoPromptRenderer.ts:305-313`, already exists); edited
  text → the edited prose verbatim. The Gemini `VideoToImagePromptTransformer` leaves the
  golden path (fate: decision D3).
- **Session text model (decision D1):** keep `SessionPrompt.input` as the immutable
  original one-liner (it feeds M3's "Your words" chip) and `output` as the one living
  description. No storage migration; the UI simply never shows two boxes.
- **The truth regression (new, non-negotiable):** a test asserting the dispatched payload
  prompt === the editor's visible text for both picture and video paths.
- Cross-layer protocol applies (`shared/` contract changes → `tsc` immediately; see
  cross-layer-change skill). Replay fixtures for suggestions/label-spans unaffected;
  video-dispatch unit tests (`video-generate-motion.test.ts`) are rewritten to assert the
  appends are GONE.
- Size: **L (4–7 days).** Risk: hidden callers of the motion params — the deep map found
  none outside the golden path, but the deletion PR greps first.

## M3 — The differentiator is always reachable

**Goal:** kill the I2V box-repurposing; the input is the description in every stage.

- Delete both `if (isI2VMode) return` gates (`useTextSelection.ts:72-73, 116-117`) and the
  Enhance-hiding on its four surfaces; `useI2VContext` remains only to tell video dispatch
  a start frame exists.
- Phrases clickable during S2 (painting) — suggestion fetches already run on snapshots, no
  concurrency work needed (verified: snapshot-at-dispatch everywhere).
- Dimmed motion phrases + "Not in the picture — this drives the video" note: rendering
  treatment on spans categorized camera-movement/action (span metadata already carries
  category); purely cosmetic, derived from labels, absent when labeling fails.
- "Your words" chip: shows `SessionPrompt.input`; click restores it into the editor
  (explicit action).
- Motion-idea rebirth (decision D6): camera/action-phrase clicks include motion-vocabulary
  alternatives (reuse `MotionIdeaService` behind the enhancement route or fold its
  vocabulary into suggestion prompts). The standalone panel dies in M6.
- Size: **M (3–5 days).** Risk: suggestion quality on motion phrases — dogfood judgment,
  not a blocker.

## M4 — Nothing punishes: failures + auth at Go

- **Failure lines:** per-stage copy map (writing / labeling / picture / motion / video)
  with retry verbs and "Not charged" microcopy; kills today's silent failures (spans fail
  silent, video errors swallowed — `useSpanLabeling.ts:400-410`, `GenTile.tsx` failed
  state). Rendered from the `{stage, failure}` flag (M2a), not a parallel machine.
- **Global 401 handler:** one fetch interceptor → auth dialog (Google + email, existing
  Firebase flows) with the pending action resumed after success; drafts already survive
  via localStorage + login merge (`useHistoryPersistence.ts:290-318`) — verified, reuse.
- **Auth at Go:** pre-Go check on the logged-out front door; dialog over the page; the
  typed draft stays visible behind it (ADR-0009 decision, now buildable).
- Size: **M (3–5 days).** Risk: auth-dialog UX in the logged-out flow needs a headed pass.
  Space-independent — ships without the space.

## M5 — The space (ADR-0012 + ADR-0013)

**Goal:** the page's content area becomes **the space** — a structured lineage network of
takes, laid out automatically; the player is its live node. Replaces the flat takes strip
that the 2026-07-05 draft put in M4.

- **Persist pictures (decision D4 + ADR-0013 prerequisite):** promote Flux-Schnell pictures
  into server-persisted generation records — accept `sessionId` + `promptVersionId` on
  `POST /api/preview/generate`, append the record, return `generationId` (mirroring the
  storyboard path, which already does exactly this). Today quick pictures halt at GCS with
  no record; without this a picture cannot be a node.
- **Lineage fields (ADR-0013):** each node persists an ancestor reference (clip → its source
  picture; picture → its words-version; words-version → the version it was reworded from)
  plus an `archived` flag. Edge **kind** (`spine | roll | reword | move`) and **layout** are
  **derived**, never stored — kind from the endpoints' types + prompt-version identity,
  layout from the graph. Cross-layer: the `shared/` record contract grows these fields → run
  `tsc` immediately (cross-layer-change skill).
- **Deterministic layout:** fixed generations `words → pictures → clips` as columns; siblings
  as computed rows; depth bounded by the pipeline, only breadth grows. No pan, no manual
  placement, no stored positions.
- **Camera:** center-on-live; slide-on-select — selecting a node restores its paired words to
  the input (the existing take-restore contract, unchanged). **Zoom** control (−/%/+),
  **ephemeral** (resets on reload; consistent with "nothing spatial is stored").
- **Node captions:** the words-node caption reads "prompt" (mono tag) per RULINGS §1.
- **The moving beat:** a plain generating clip tile (RULINGS / handoff); the
  picture-under-progress-veil treatment is deferred polish — recorded, not built.
- **Context menus:** picture-node → Animate / Re-roll / Reword / **Remove** (Remove only when
  the node is a childless leaf); kept-node → Share / Download / **New clip** (New clip = a new
  session). **No Duplicate** anywhere; kept nodes and the root are not removable (RULINGS §5).
- **Node removal (ADR-0012 / RULINGS §5):** `Remove` on leaf nodes only; **server-side
  leaf-only enforcement** + the `archived` flag; the record persists, excluded from render;
  the camera falls back to the parent. Leaf-only makes orphans unrepresentable, so lineage
  integrity needs no reconciliation.
- **First run is a straight line:** zero branches renders as the S1–S6 spine; the network
  appears only when branching creates it.
- Async: clip nodes resolve via the existing poller (`GET /api/preview/video/jobs/:jobId`);
  picture nodes resolve synchronously. No timers.
- Size: **L (5–8 days)** — the largest milestone: new server persistence (pictures + lineage
  - archive) + a layout engine + camera + removal. **Riskiest assumption (ADR-0012):** a
    non-expert reads the growing structure as "my work's history," not "a diagram to
    understand." Validate the ~6-node mock before/early in build; fallback is the
    local+summoned form with the same data model (loses no persisted structure).

## M6 — The deletions (per ADR-0010 stays/goes)

Land alongside or after their replacements: model picker + sample stills + comparison
view (after hardcoding the default model), tune chips + TuneDrawer + AI Enhance (M2b),
motion side-channels + SubjectMotionInput + camera-motion modal pills (M2b), motion-ideas
panel (M3), Characters/Styles rail panels + Sessions rail panel, ShotRow gallery +
Continue Scene + GenerationPopover (replaced by the player + the space, M5),
ReferenceImageLibrary (zero call sites). Server @-trigger resolution stays dormant.
Frame verification: delete-from-tree per the ADR-0010 archive-then-delete procedure (no
external branch to wait on — working tree is clean).
Size: **M spread across the other PRs + one sweep (2–3 days).** Each deletion PR greps
for callers first (migration-residue discipline).

## M7 — Prove the bet (instrumentation)

- Streaming expansion (decision D5): NDJSON endpoint sibling to `/api/optimize` following
  the `/label-spans/stream` precedent; client renders the stream into the input (S1).
  (This is genuinely new build; it can land before or after M3 — it has no dependents.)
- Expansion first-try-quality metric + re-roll counters per kept picture (Measurement
  Program hooks; PostHog). Roll-4 stays out until real dogfood re-roll data exists.
- Daily soft-cap config knobs (pictures / draft motions per account) — server-side,
  generous defaults, "back tomorrow, or subscribe" copy when hit.
- Size: **M (3–4 days).**

---

## Decision points requiring owner sign-off (the actual scope questions)

| #   | Decision                             | Recommendation                                                                                                                                                          |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Session text model                   | Keep `input` (immutable original, feeds "Your words") + `output` (the one living text). No migration; UI shows one box.                                                 |
| D2  | Stage persistence                    | Derive S0–S6 from persisted artifacts on restore; never persist the enum.                                                                                               |
| D3  | `VideoToImagePromptTransformer` fate | Off the golden path in M2b (slot render replaces it); delete in M6 if the grep finds no remaining callers, else leave for the storyboard edge.                          |
| D4  | Where takes live                     | Promote idea-box pictures into generation records (server-persisted, prompt-paired) so takes survive reload; startFrame stops being localStorage-only. **Lands in M5.** |
| D5  | Streaming transport                  | NDJSON (house precedent: `/api/llm/label-spans/stream`).                                                                                                                |
| D6  | Motion vocabulary home               | Motion alternatives served through the existing enhancement/suggestions path for camera/action spans; `MotionIdeaService` becomes its backend or its vocabulary source. |

Decisions D1–D6 are locked in [ADR-0011](../adr/0011-rebuild-scope-decisions.md). The space's
lineage contract (persist ancestor + `archived`; derive kind + layout) is locked in
[ADR-0013](../adr/0013-space-lineage-is-persisted-not-derived.md).

Total estimate: **~5–7 focused weeks** solo (the space is the added weight), shippable at
every milestone boundary.
