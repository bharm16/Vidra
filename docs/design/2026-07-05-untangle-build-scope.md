# ADR-0010 build scope — Milestones 2–6

Status: **draft for owner sign-off. No build step proceeds until this document is agreed.**
Companion to [ADR-0010](../adr/0010-one-visible-text-one-loop-subscription-at-keep.md).
M1 (inline player) shipped: `5c63aa43`. Evidence anchors come from the 2026-07-04 verified
deep map (64 + 46 agent runs).

## Ground rules for every milestone

- **Gate:** golden-path e2e green + full unit suite + `npx tsc --noEmit` before merge; the
  truth contract gets its own regression (see M2b).
- **Sibling constraint:** the frame-verification/replay working-tree changes belong to
  another session. No milestone touches those files; the frame-verification deletion in M5
  waits for that branch to close.
- **Order:** M2a → M2b → M3 → M4 → M5 (deletions land as their replacements land) → M6.
  Each milestone is independently shippable and independently revertible.

---

## M2a — The state enum (client refactor, behavior-preserving)

**Goal:** one explicit workspace stage drives everything; the five-flag derivation dies.

- New `WorkspaceStage` = `empty | writing | painting | picture | moving | clip | kept`
  (S0–S6), owned by one store. `computeWorkspaceMoment.ts`, the 5-condition `isPreWork`
  (`CanvasWorkspace.tsx:378-385`), and `IdeaBoxStage` (`idea-box/types`) become derivations
  or fold in. Every button label becomes a pure function of stage.
- **Stage is derived from artifacts, not persisted** (decision D2 below): presence of
  description / frame / clip / in-flight run reconstructs the stage on restore, so a
  reloaded session lands in the right beat without a new persistence contract.
- Failure is a flag on the stage (`{stage, failure?}`), not a separate machine.
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
  vocabulary into suggestion prompts). The standalone panel dies in M5.
- Size: **M (3–5 days).** Risk: suggestion quality on motion phrases — dogfood judgment,
  not a blocker.

## M4 — Nothing punishes: failures, auth at Go, takes strip

- **Failure lines:** per-stage copy map (writing / labeling / picture / motion / video)
  with retry verbs and "Not charged" microcopy; kills today's silent failures (spans fail
  silent, video errors swallowed — `useSpanLabeling.ts:400-410`, `GenTile.tsx` failed
  state).
- **Global 401 handler:** one fetch interceptor → auth dialog (Google + email, existing
  Firebase flows) with the pending action resumed after success; drafts already survive
  via localStorage + login merge (`useHistoryPersistence.ts:290-318`) — verified, reuse.
- **Auth at Go:** pre-Go check on the logged-out front door; dialog over the page; the
  typed draft stays visible behind it (ADR-0009 decision, now buildable).
- **Takes strip:** takes = generation records reshaped (each `Generation` already stores
  its `prompt` — the paired prose exists today). Idea-box pictures get promoted into the
  same record shape (decision D4). "Use this take" restores media + paired text together;
  browsing is read-only.
- Size: **L (4–7 days).** Risk: auth-dialog UX in the logged-out flow needs a headed pass.

## M5 — The deletions (per ADR-0010 stays/goes)

Land alongside or after their replacements: model picker + sample stills + comparison
view (after hardcoding the default model), tune chips + TuneDrawer + AI Enhance (M2b),
motion side-channels + SubjectMotionInput + camera-motion modal pills (M2b), motion-ideas
panel (M3), Characters/Styles rail panels + Sessions rail panel, ShotRow gallery +
Continue Scene + GenerationPopover (replaced by player + takes strip, M4),
ReferenceImageLibrary (zero call sites). Server @-trigger resolution stays dormant.
Frame verification: delete-from-tree **only after** the sibling branch closes; archive.
Size: **M spread across the other PRs + one sweep (2–3 days).** Each deletion PR greps
for callers first (migration-residue discipline).

## M6 — Prove the bet (instrumentation)

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
| D3  | `VideoToImagePromptTransformer` fate | Off the golden path in M2b (slot render replaces it); delete in M5 if the grep finds no remaining callers, else leave for the storyboard edge.                          |
| D4  | Where takes live                     | Promote idea-box pictures into generation records (server-persisted, prompt-paired) so the takes strip survives reload; startFrame stops being localStorage-only.       |
| D5  | Streaming transport                  | NDJSON (house precedent: `/api/llm/label-spans/stream`).                                                                                                                |
| D6  | Motion vocabulary home               | Motion alternatives served through the existing enhancement/suggestions path for camera/action spans; `MotionIdeaService` becomes its backend or its vocabulary source. |

Total estimate: **~4–6 focused weeks** solo, shippable at every milestone boundary.
