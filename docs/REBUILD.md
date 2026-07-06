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
- **M3 core done (2026-07-06):** click-to-enhance no longer gated by a start frame — the
  three `isI2VMode` gates removed. Commit `8a149c2a`. **Next: M3's four remaining slices**
  (see TaskList task #3), then M4 → M8.
- **Build state:** 8 commits this session (`f7923064`…`8a149c2a`); full unit suite green at
  every milestone boundary. The TaskList (#1–#8) carries per-milestone detail; the fresh
  session brief is `/private/tmp/vidra-rebuild-handoff-2026-07-06.md`.
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
