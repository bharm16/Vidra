# Vidra rebuild — status and pickup point

_Last updated: 2026-07-05. This is the entry document for the workspace rebuild. A fresh
session should read this, then ADR-0010 → 0011 → 0012, then the glossary terms in
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

Two tracks run in parallel: **design** (active) and **build** (paused).

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

**In flight:** a fix prompt was written for the board's one semantic error — take 23a's
"(starts a new root)" input placeholder implies multi-root spaces; single-root is the
ruling. The docked input always holds the live take's words; blank input exists only at
the centered empty state; "New clip" = new session.

**Next:** hi-fi designs (suggested start: empty state + the picture gate 25c; check both
at laptop width — the board has no width variants). Then the coded prototype, which is
where the three transitions get proven: the dock moment, node birth, camera slide.

**The design bet to validate before build:** a non-expert must read the space as "my
work's history," not "a diagram to understand" (~6-node mock test; fallback documented in
ADR-0012).

## Build track — where it stands

- **M1 shipped:** inline video player, `5c63aa43` (+ ADR-0010 `72e0e824`).
- **M2–M7 scoped, not signed off, nothing built:**
  [build scope](design/2026-07-05-untangle-build-scope.md) +
  [site scope](design/2026-07-05-site-scope.md). Owner mandate: no build step before
  scope sign-off.
- **Known stale spot:** the scope docs predate ADR-0012 — M4 still says "takes strip";
  it becomes the space (lineage layout + camera; player → live node). Revise before
  sign-off.

## Open items

1. Hi-fi board accepted 2026-07-05 (all app frames incl. public clip + docs; accent and
   state colors accepted, ADR-0008 amended; empty state carries no rail; no daily-cap
   frame needed). Next: coded prototype from the board.
2. Scope docs need the ADR-0012 revision pass (M4 reshaped) before M2 sign-off.
3. Account page (take 36) uses credits/usage language copied from a reference; credits
   don't exist in the product. Owner chose to leave it for now — fix before Account goes
   hi-fi/ships.
4. Working tree carries a sibling session's uncommitted frame-verification/replay files —
   never touch them; the frame-verification deletion (M5) is blocked until that branch
   closes.
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
