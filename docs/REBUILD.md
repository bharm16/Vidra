# Vidra rebuild — status and pickup point

_Last updated: 2026-07-06. This is the entry document for the workspace rebuild. A fresh
session should read this, then ADR-0010 → 0011 → 0012 → 0013, then the glossary terms in
[CONTEXT.md](../CONTEXT.md) (the space, the input, the player, the page, Take, Keep)._

## What this program is

The workspace is being rebuilt around three locked decisions:

- **[ADR-0010](adr/0010-one-visible-text-one-loop-subscription-at-keep.md)** — one visible
  text (what you see is the only thing that runs), one guided loop (words → picture →
  motion → kept, one gate at the picture), subscription at Keep, and the full stays/goes
  disposition for every subsystem.
- **[ADR-0011](adr/0011-rebuild-scope-decisions.md)** — the six build-scope contracts
  (D1–D6: session text model, derived stage, transformer retirement, persisted takes,
  NDJSON streaming, motion vocabulary in suggestions).
- **[ADR-0012](adr/0012-the-space-lineage-network.md)** — the page's content is **the
  space**: a structured lineage network (words → pictures → clips nodes, auto-laid-out,
  edges typed by verb: roll · reword · move). The player is its live node. The input
  docks on first submit; one space holds exactly one root.

Two tracks: **design** (closed 2026-07-06) and **build** (active — resuming at M2a).

## Design track — where it stands

**Process (established, working):** behavior spec (contents-and-function only, zero
design input) → lo-fi exploration in Claude Design/Stitch → owner rules on flagged
deviations → rulings captured into glossary/ADRs/specs → hi-fi → coded prototype.

**Done:**

- Handoff package: [docs/design/handoff/](design/handoff/) — the brief (eight fixed
  truths + open canvas), production `tokens.css`, and behavior specs: empty state,
  toolbar, rail (navbar file), and
  [remaining-surfaces.md](design/handoff/remaining-surfaces.md) (all loop moments as
  states of the space, shared components, failures, pages).
- **Complete lo-fi board** (owner's Stitch project; export PDF lives outside the repo):
  36 takes covering the empty-state set, the space (take 23a, horizontal spine = chosen
  frame), all six loop moments (25a–f), phrase mechanics incl. the stale mark (26a–c),
  all four failures (27a–d), Library, Docs, public clip page, Account. Every surface in
  the spec set has at least one lo-fi take.
- **Rulings captured** (commit `76b4cb7a`): the collapsible labeled rail is the chrome;
  settings are two inline selectors on the input (16:9 ▾ · 6s ▾); one root per space.

**Hi-fi board accepted (2026-07-05, "All Frames"):** entry, the loop as states of the
space (forming-node and failure-at-node patterns generalize across columns), editing +
phrase alternatives, failures, Library, auth, Account, public clip, Docs. Single-root
fixed; accent + state colors accepted (ADR-0008 amended); empty state carries a minimal
top bar, the rail arrives with the space.

**Design phase complete (2026-07-05):** the Claude Design handoff landed
(docs/design/handoff/returns/ — 9 screens, all workspace states, motion spec) and every
delta is ruled (RULINGS.md: prompt caption kept, zoom kept, knobs removed, existing
tokens stay, node removal = leaf-only archive prune, Duplicate dropped). The handoff's
clickable prototypes satisfy the prototype step.

**Scope revision + sign-off complete (2026-07-06):** both scope docs revised (M4 split →
M4 failures+auth + M5 the space; deletions M6, instrumentation M7, site coherence M8),
ADR-0013 added (lineage persisted, not derived), owner signed off.

**The design bet to validate before build:** a non-expert must read the space as "my
work's history," not "a diagram to understand" (~6-node mock test; fallback documented in
ADR-0012).

## Build track — where it stands

- **M1 shipped:** inline video player, `5c63aa43` (+ ADR-0010 `72e0e824`).
- **M2a complete + certified (2026-07-06):** one derived `WorkspaceStage` replaces the
  five-flag derivation. Commits `19242476` · `fa04bd23` · `d22c7162`.
- **M2b complete + certified (2026-07-06):** the dispatched payload is byte-for-byte the
  visible text on both paths — tune chips + server motion splice removed, the Gemini
  picture transformer off the golden path, each with a truth regression. Commits
  `fac77e6b` · `9a34e011` · `d9981dde`. (D1 already satisfied; slot-render quality + the
  motion/transformer plumbing deletion are M6 follow-ups.)
- **M3 COMPLETE (2026-07-07) — all slices done, unit-locked, and visually verified in real
  Chrome (main checkout).** Core + 1/2/3a on 2026-07-06 (`8a149c2a` gates removed; `456bd786`
  input-is-description; `1e8334e0` click-reachable guard; `ee79b5fc` gold motion phrases).
  Remaining slices landed 2026-07-07: **3b** — "Not in the picture — this drives the video"
  gold note on the selection surface, keyed off a new shared `isMotionCategory` threaded as
  `SelectedSpanContext.isMotionSelection` (`3ee169d1`, plus `c8cef690` fixing a slice-3a
  stale test that had slipped the hook); **4** — "Your words" chip restores the immutable
  `SessionPrompt.input` via `onComposerFill` (`ec1eafa2`); **5** — motion vocabulary in the
  suggestions path (D6): shared predicate lifted to `shared/motionCategories.ts` (`7a41a592`),
  `buildMotionGuidance` folded into `EnhancementV2PromptBuilder` (`2b60b7eb`). Visual pass
  confirmed all three: gold note on camera + action clicks, the chip with the original
  one-liner, camera→templated dolly alternatives and action→LLM strides/glides/marches.
  (`9c2aba91` de-flaked an unrelated OptimizeTelemetryService timing test found en route.)
- **M4 substantially done (2026-07-07) — the two big pieces shipped; two low-value items
  deferred.** "Nothing punishes" failures: `0838c035` the pure per-stage `failureCopy` map,
  then `dac9db1e` the **writing (expansion) failure** end-to-end — `handleOptimize` had no
  else on a null `optimize()` result (silent dead composer); now `onOptimizationFailed` →
  `writingFailed` threaded through the PromptResults context into the `{stage,failure}` flag →
  `CanvasWorkspace` renders `FailureNotice` with a retry (full cross-layer regression). Auth:
  `8fea859b` the **401 handler + auth-at-Go** over one framework-agnostic gate
  (`authGateController`) — `AuthRetryTransport` decorates the HTTP transport (unauthenticated
  401 → dialog → retry once with fresh Firebase headers; authed 401s pass through, no loop),
  `CanvasSettingsRow` gates the only submit via `runWhenAuthenticated`; a thin `AuthGateDialog`
  was built (no prior modal existed) reusing existing Firebase flows, mounted at App root. 18
  auth tests. **Deferred (low value):** the `labeling` silent failure (needs a state-lift from
  `useSpanLabelingPipeline`) and consolidating FrameStage/GenTile failures onto the one flag.
  **Deferred headed pass:** the auth dialog's logged-out flow.
- **M5 underway (2026-07-07) — foundation + zoom + picture-persistence shipped; the
  lineage-graph bulk is not.** `647a2028` the pure lineage core in `client/src/features/space/`:
  `computeLineageLayout` (derived columns/rows, archived excluded), `deriveEdgeKind`
  (spine/roll/reword/move from endpoints — ADR-0013, never stored), `buildSpaceNodes`, and
  `TheSpace` (auto-laid-out render — typed SVG edges, live node enlarged, `onSelectNode`).
  `14eb4883` wires it into `CanvasWorkspace` behind `FEATURES.SPACE_LINEAGE` (off by default)
  via `deriveSpaceNodes` (session generations → nodes; lineage derived per session).
  `236fad4e` ephemeral zoom (`SpaceViewport`). `ff950ac0` **D4 picture persistence** — quick
  pictures now persist as session generation records (server `imageGenerate.ts` mirrors the
  storyboard path: accepts sessionId+promptVersionId → `sessionService.appendGenerationToVersion`,
  soft-fail, returns `generationId`; shared `GeneratePreviewResponseSchema` + client
  `generatePreview` grew the fields; additive, zero migration). 27 space/persist tests.
  `e33aa7b8` **caller wiring (step 1 DONE)** — the golden-path first frame now PASSES
  sessionId+promptVersionId: `useIdeaBox` gained an optional `resolvePersistenceTarget()`
  invoked per frame; a `PersistenceTargetRegistrar` bridges the tree upward (the always-mounted
  `CanvasWorkspace`, which owns `onCreateVersionIfNeeded`, registers a version resolver up to
  `PromptOptimizerContent`, which adds the route sessionId gated through `isRemoteSessionId` —
  the storyboard runtime's exact id source; blanks omitted so the server keeps its legacy path).
  +20 idea-box tests; `useImagePreview` intentionally left (not the golden-path first-frame caller).
  **M5 steps 2–8 SHIPPED (2026-07-07):** (2a `ec5a7f01`) `SessionGenerationRecord` gains
  `ancestorGenerationId`+`archived` (index-signature keeps it additive); pictures set
  `ancestorGenerationId: null`. (3 `c70200b2`) `deriveSpaceNodesFromVersions` renders from the
  persisted `versions[]` — survives reload, linear reword chain, clips link via
  `ancestorGenerationId` with a first-picture fallback; `CanvasWorkspace` feeds it (NOT gated on
  empty runtime). (4 `b7fe6e16`) `SessionService.archiveGeneration` — leaf-only (no LIVE record
  names it as ancestor), soft `archived:true`, `POST /sessions/:id/generations/:gid/archive`
  (409 non-leaf / 404 unknown), client `spaceApi.archiveGeneration`. (5 `7e1e95c9`) camera —
  `SpaceViewport` centers the live node via pure `computeCenteredScroll` (rects are
  post-transform, so zoom is baked in). (6 `1f047ca4`) take-restore — `resolveWordsForNode` +
  `onComposerFill` (fill-only, read-only browsing). (7 `9227ac28`) node context menu
  (`SpaceNodeMenu`, corner sibling) — Reword + leaf-only Remove (client `nonLeafIds`/
  `isRemovableLeaf` mirror the server; optimistic local archival). (8 `048e2a65`) live app
  Chrome-verified healthy with the flag-gated changes present (workspace renders, zero console
  errors); flag description refreshed. **~50 new tests across 2–8.**
  **Deferred (precise):** (2b) clip→source-picture ref through the video job (VideoJobStore/
  types/schemas/parse/processVideoJob + client capture of the picture's `generationId` onto the
  KeyframeTile → `sourceGenerationId`) — ~10 files; today clips fall back to the first picture.
  (7b) the other RULINGS §5 actions (Animate/Re-roll/Share/Download/New clip) route through
  existing generation/session flows. (8b) the full flag-on visual pass needs the owner: restart
  Vite with `VITE_FEATURE_SPACE_LINEAGE=true`, log in (persistence is remote-only), reach a
  session with gallery generations (or temporarily widen the `shots.length>0` render gate to
  `hasExpandedPrompt`). Full detail + gotchas: `/private/tmp/vidra-rebuild-handoff-M8-onward.md`.
- **M5 COMPLETE + SPACE IS DEFAULT (2026-07-07 pm, `a29ec84b`→`c7d29a12`):** deferred items
  finished and the space flipped on by default. **2b** (`a29ec84b` server + `7a06feaa` client):
  clip `sourceGenerationId` threaded end-to-end so a clip's `ancestorGenerationId` names its
  source picture; the server fix also round-trips `promptVersionId` through the worker's Firestore
  read-back (schema/parse had dropped it, so async-flow clips never persisted — latent bug fixed).
  **7b** (`8393d5fd`): Animate (picture → start frame, id rides as `sourceGenerationId`) + Download
  (clip → gallery handler) wired; Re-roll/Share/New-clip still deferred (no-arg `onShare` /
  generation-session plumbing). **Default** (`c7d29a12`): `SPACE_LINEAGE` default → true; the space
  replaces the shots grid for `shots.length > 0`, FrameStage keeps `shots.length === 0` (its
  Create-frame/gate isn't in the space — the reason the old layout stays). **8b**: Chrome-verified
  against a real session (temp-widened gate) — words node + context menu + zoom rendered from real
  `versions`, zero console errors, then reverted. **Old shots-grid layout NOT deleted** (now
  unreachable-by-default, kept until all M done per owner). Next: M6 deletions (motion-ideas panel,
  tune-chips/TuneDrawer, Gemini transformer, frame-verification — NOT the old layout) → M7 → M8.
- **Formatter churn resolved + M6 frame-verification deleted (2026-07-07 pm, `a06459fa`→`85b835b6`):**
  a 45-file uncommitted "WIP" in the tree turned out to be **100% pure Prettier churn** (the
  documented recurring reflow of stale-formatted committed files) — proved by regenerating it
  byte-identically with `prettier --write` from a clean stash. Committed once (`a06459fa`), which
  **stops the recurring churn**. Then **frame-verification excised** — it was dormant (server served
  `POST /api/frame-verification`, zero client consumers): archived to `archive/frame-verification-2026-07-07`,
  removed the client feature + server service/route/DI + eval scripts + all wiring + route-table rows
  (`ffb7b86e` + `85b835b6`); integration gate + full suite green. **Remaining M6 is risky/design-sensitive:**
  the Gemini `VideoToImagePromptTransformer` is still wired into both active Flux providers (incl.
  golden-path Flux Schnell) — M2b only bypassed the prompt, so removal needs provider rewiring first;
  the motion-ideas panel + tune-chips/TuneDrawer are active-but-superseded UX needing design
  confirmation. Then M7 (touches config/feature-flags) → M8 (site-scope doc still not found).
- **M6 Gemini transformer + side-channel removed (2026-07-07, `f651bb0f`→`993cdd0e`):** the
  Gemini `VideoToImagePromptTransformer` — an LLM prompt-rewrite path (plus a temporal-pattern
  regex classifier) wired into both active Flux providers incl. golden-path Flux Schnell — is
  **excised**. Characterized first: every production caller (`imageGenerate` + storyboard
  base/per-frame) already passed `disablePromptTransformation: true`, so the transform branch was
  already dead in prod — removal is behavior-preserving (ADR-0010 truth: the picture model gets the
  creator's text verbatim). Rewired both providers to `{ apiToken }` only, dropped the
  `videoToImageTransformer` + `videoPromptDetector` DI registrations, deleted the transformer + its
  2 tests + barrel export, then removed the now-inert `disablePromptTransformation` side-channel
  (2 request types, service copy, 3 setters, 3 test assertions — zero refs repo-wide after). TDD:
  provider tracer tests construct with `{ apiToken }` and assert a video-shaped prompt reaches the
  model verbatim. tsc + eslint + integration gate + full suite (7669) green; two `refactor:` commits.
  **Remaining M6 (still design-sensitive, owner call):** the motion-ideas panel (`MotionIdeasPanel`
  - `i2v-motion-ideas` server stack, still renders in I2V) and tune-chips/TuneDrawer — both
    active-but-superseded, pending confirmation the M3/D6 replacements fully cover them. Then M7 → M8.
- **M6 motion-ideas panel FULLY DELETED — panel + server stack (2026-07-08, `d587c09c`→`741f9476`→`e1caf9da` + this docs commit):**
  owner ruled FULL DELETE after a 5-agent fan-out (reachability / coverage / design-intent / blast-radius).
  Decisive vote — design intent: ADR-0011 D6 is a locked decision, "No standalone motion panel, ever — a
  panel is a second text surface wearing a costume." The one real counterweight (a coverage gap: image→motion
  ideation with zero typed words, which D6's per-span vocab structurally can't serve) was accepted as an
  intentional drop under ADR-0010's "one visible text" — the motion vocabulary already lives in per-span
  suggestions since M3. Three code commits, each green at its boundary: **(A)** client surface — `MotionIdeasPanel`
  - `useMotionIdeas` + both mounts + `PromptResultsActionsContext` fields + `getMotionIdeas` from i2vApi + 13 dead
    test stubs; **(B)** replay — `motion-ideas` surface/contract/`MotionIdeasReplayPayloadSchema` from the shared
    replay contract + the `i2v_motion_ideas` mapping + golden HTTP scenario + integration test + fixture, with the
    two replay MACHINERY unit tests repointed to the surviving `suggestions` surface (`enhance_suggestions`→qwen);
    **(C)** server — the `i2v-motion-ideas/` service + `i2v/` route + `registerI2VServices` + DI unwiring +
    `i2v_motion_ideas` modelConfig op, plus the expansion-study research driver (tied to ADR-0002 via its protocol
    doc) rewired to a fixed motion prompt rather than dropped, to avoid a dangling reference. Archived to
    `archive/i2v-motion-ideas-2026-07-07`. tsc + eslint + Integration Gate (8/8) + full suite (7663) green; also
    cleaned a stray M6-1 `disablePromptTransformation` leftover in `scripts/` (outside the earlier grep scope).
    **Pre-existing, NOT this work:** the label-spans replay integration test fails on a stale span-labeling cassette
    (fails identically on main) — flagged to re-record with `REPLAY_MODE=record`. Remaining M6: tune-chips/TuneDrawer → M7 → M8.
- **M6 deletion sweep — clean deletions DONE, entangled remainder folded into later milestones (2026-07-08, `b3954e0a` `fccefab7` `1218cb39` `31ba4ed3`):**
  a 6-agent fan-out mapped the whole ADR-0010 "goes" list (decision locked; only blast-radius needed). Shipped the four
  clean/non-entangled deletions: **ReferenceImageLibrary** (dead island, zero importers), the **dead model-intelligence
  cluster** (ModelComparison/ModelSelector/ModelRecommendation-card — zero JSX mounts; kept the live ModelRecommendationDropdown
  - useModelRecommendation), **tune chips + TuneDrawer + AI-Enhance** (composer; `isExpanded` now keys only on `selectedSpanId`;
    onEnhance/isEnhancing threading gone), and **SubjectMotionInput** (barrel-only dead). Each `tsc`+eslint+targeted-tests green.
    **Deferred (entangled) to the milestone that unblocks each — the build-scope rule "deletions land alongside their
    replacements":** rail panels (Characters/Styles/Sessions) → **M8** (site-scope D7 kills the whole tool rail; deleting the 3
    panels alone leaves a degenerate rail + orphaned studio back-button); ShotRow/GenTile/Continue-Scene(Path A)/GenerationPopover
  - camera-motion store/modal/telemetry + model-picker Tier2 (needs default-model hardcoded first) → **the old-layout deletion
    (LAST)** (reachable only via the `!SPACE_LINEAGE` / `!CANVAS_FIRST_LAYOUT` branches or the old GenerationControlsPanel).
    **Remaining rebuild:** M7 (instrumentation — NDJSON streaming per ADR-0011 D5, first-try-quality metric, soft-cap knobs) →
    M8 (site coherence + rail death + the public `/share/:uuid` clip page + Docs rewrite) → the old-layout deletion LAST.
- **M8 site-coherence — routing (D9–D12) + rail-death (D7) DONE (2026-07-08):** D9–D11 route
  redirects (`/home`,`/products`,`/assets` → `/`) + D12 `/account` credit-strip
  (`0f2cb64c` `ea1d03d6`). **D7 tool-rail death** (`67b3290a`→`44ae910e`→`36232665`, TDD,
  Chrome-verified in main): the left tool rail + its Characters/Styles/Sessions panels are
  deleted; the account popover + a new **Library** link now live in `WorkspaceTopBar`
  (signed-out visitor gets a sign-in link). Relocated `AccountPopover` to
  `features/workspace-shell/components/` and made it self-contained (wraps its own
  `TooltipProvider`, system `Button` trigger per ADR-0008); removed `<ToolSidebar>` from
  `AppShell`'s sidebar variant; deleted 10 rail files + 12 rail-only tests; narrowed
  `types.ts` (dropped `ToolPanelType` + rail prop types) and barrel `index.ts`; dropped the
  now-dead `var(--tool-rail-width)` spacer column in `CanvasWorkspace` (a gutter for the
  overlapping rail → became dead 52px space). **Kept** (deep-path survivors): `context/`
  (SidebarData\* domains), `config/modelConfig`, the studio `GenerationControlsPanel`
  subtree (old-layout, dies LAST). No surviving code imports the barrel `@components/ToolSidebar`
  — all survivors use deep paths — so `tsc` across client+tests certified the deletion;
  full unit suite (7569) green per commit. **Remaining M8:** D8 public `/share/:uuid` clip
  page → `/docs` rewrite → 404/redirect audit; then the old-layout deletion (LAST) → M7.
- **Build state (2026-07-06 M3 session):** 4 commits (`c7cf6acc` ratchet fix · `456bd786` ·
  `1e8334e0` · `ee79b5fc`), each gated. Two lessons carried in the brief: (1) **visual
  verification of the span-based slices needs the main checkout** — a worktree client can't
  complete the expansion, so no labeled spans render there; (2) the pre-commit hook runs
  tsc + eslint but **not** `test:unit`, so run the full suite per commit (a deep-import
  ratchet failure from `8a149c2a` had slipped past CI, fixed in `c7cf6acc`). Fresh session
  brief: `/private/tmp/vidra-rebuild-handoff-M3-remaining.md`.
- **Scope docs + design track:** both scope docs signed off; hi-fi handoff accepted, all
  deltas ruled.
- **Worktree note:** this build ran in a git worktree; running client tests there requires
  `.env`/`gcs-service-account.json` symlinked from main and the project vitest config (see
  the session brief).

## Open items

1. Hi-fi board accepted 2026-07-05 (all app frames incl. public clip + docs; accent and
   state colors accepted, ADR-0008 amended; empty state carries no rail; no daily-cap
   frame needed). Next: coded prototype from the board.
2. Scope revision + sign-off complete (2026-07-06): M4 split into M4 + M5 (the space); ADR-0013 added; building at M2a.
3. Account page (take 36) uses credits/usage language copied from a reference; credits
   don't exist in the product. Owner chose to leave it for now — fix before Account goes
   hi-fi/ships.
4. Working tree is clean (2026-07-05 cleanup: the "sibling session files" turned out to
   be formatter churn over already-merged work). The frame-verification deletion (M5)
   just needs the ADR-0010 procedure: archive the feature to a branch, then delete.
5. The A–D wireframe defaults: A (takes-strip timing) is superseded by the space; B
   (dirty text demotes, not hides), C (share at kept only), D (description stays present
   when kept) are drawn into the board and stand unless re-ruled.

## Working rules this program runs on

- Specs are contents-and-function only — no design input, no layout, no copy mandates,
  and never any reference to surfaces being deleted (forward-only).
- Every owner ruling is captured immediately (glossary / ADR / spec) — decisions made in
  chat and not written down are how the original tangle formed.
- Design may challenge any fixed truth by flagging it, never by silently drawing around
  it. Silent violations bounce; flagged ones go to the owner.
- Build waits for scope sign-off; when it resumes, the golden-path e2e gates every
  milestone, and M2b ships with the truth regression (dispatched payload === visible
  text).
