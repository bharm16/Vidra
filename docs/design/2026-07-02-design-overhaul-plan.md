# Design overhaul plan — 2026-07-02

**Method:** headed Chrome walkthrough of every live surface (workspace pre-work, restored
sessions, live expansion loop, all rail panels, every dropdown/modal, `/home`, `/history`,
`/account`, `/pricing`), plus a styling drift census of `client/src`. Decisions resolved
with the owner via grilling; recorded in
[ADR-0008](../adr/0008-one-design-language-across-all-shells.md) and
[CONTEXT.md](../../CONTEXT.md) (span palette, model showroom, session library, gallery
landing).

**Diagnosis.** Not diffuse bad taste — three product eras coexisting as three shells
(workspace / purple-accent marketing site / SaaS account+history app), plus one design
system (`@promptstudio/system`) adopted at ~65%. The 2026-07-01 UX review graded only the
golden path, which is why it read "coherent" while the whole app is not.

## Decisions (owner-resolved)

| #   | Decision                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | All three shells unify under one design system — frozen surfaces are reskinned, not rebuilt (ADR-0002 freeze stands)                                                                            |
| 2   | Workspace monochrome everywhere; **no brand accent**; span palette is the only semantic color; the marketing purple dies                                                                        |
| 3   | "Prompt could be improved. Score: N%" toast leaves the creator loop (dev-flag only)                                                                                                             |
| 4   | Model choice stays a full-screen **showroom**: gallery form kept, re-skinned in monochrome tokens, real sample stills replace gradient placeholders, credits/dot-meters removed                 |
| 5   | One Session entity: rail panel = quick switcher, `/history` becomes the **session library** (same vocabulary/thumbnails; raw UUIDs and Score badges die)                                        |
| 6   | Landing becomes a **gallery of Vidra-made clips**; the one-screen manifesto (wordmark, one-liner, auth-aware CTA) is its zero-content state; nav = Sign in only until Docs/Support have content |

Derived from standing UX rules (CLAUDE.md) rather than new decisions: account access from
the rail becomes a popover (no full-page navigation mid-work); FrameStage owns the canvas
for restored sessions, not just live runs (CONTEXT.md first-frame corollary).

## Phase 0 — Foundation: one component system

Census baseline: 161 system `Button` vs 179 raw `<button>`; 4 focus-ring patterns; ~50/50
semantic-token vs raw-palette files (119 vs 26); z-index values 30/91/100/1000/9998/9999;
toasts already unified (protect).

- Remove DaisyUI: config, plugin, `z-modal`/`z-dropdown` tokens, `btn`/semantic-class
  remnants → system equivalents.
- Token pass in `packages/@promptstudio/system`: single focus-ring token; z-index scale
  (dropdown/popover/drawer/modal/toast); one `Badge`; formalize the uppercase micro-label
  as an `overline` type token (already de facto in TuneDrawer and History's OUTPUT labels);
  sentence case everywhere else.
- Replace hand-rolled primitives with system/Radix: `MiniDropdown` (aspect/duration menus
  render as near-invisible floating text today), `ModelSelectorDropdown` (~200 lines of
  custom portal/flip logic), one-off popovers in workspace-shell.
- Migrate raw-palette hotspots to tokens (26 files; `DebugButton` hex styles are dev-only —
  lowest priority).
- Migrate raw `<button>` stragglers in active surfaces: `FloatingToolbar`,
  `PromptEditorSurface`, `CustomRequestForm` focus cascade.
- Guardrails so drift can't return: ESLint restrictions on raw `<button>` and raw palette
  classes in `client/src` (system package exempt).

## Phase 1 — Workspace shell coherence

- **Canvas-ownership fix:** restored sessions with an expanded prompt must engage
  FrameStage (today "Dog Running" shows the "What are you making?" hero + black void, and
  the hero's visibility mutates when the suggestion tray opens/closes). Hero appears only
  for truly-empty sessions.
- **Account popover:** rail avatar opens popover (email, sync status, sign out, link to
  `/account`); kill the dead top-right avatar circle or make it the single trigger; the "B"
  chip stops navigating away mid-work.
- **Rail:** Sessions moves off the hamburger icon to a clearer glyph; panel headers unify
  (Sessions has a back-arrow header, Characters/Styles have icon headers); breadcrumb must
  stay visible when a panel is open.
- **Composer defects:** frosted-glass smear when content sits behind the translucent bar
  (`CanvasPromptBar.tsx` `backdrop-blur-[18px]` at 72% opacity) — raise opacity when
  expanded or reorder z; suggestion-chip overflow clipping at the card edge; expanded
  prompts clip mid-sentence in the composer while the stage sits empty.
- **FrameStage failure state:** merge the split messaging ("No frame yet" inside the stage
  - "Couldn't create a frame / Try again" below it) into one designed state.
- **Score toast removal** (decision 3) — dev-flag with the existing debug chrome.
- Session thumbnails: 403/broken asset falls back to the letter avatar (today: blank white
  tiles).

## Phase 2 — Destination surfaces

- **Model showroom** (decision 4): same modal structure (Draft/Render sections), monochrome
  tokens, real per-model sample stills (static bundled assets until GCS is restored), no
  credits, no dot-meters; strength copy ("Cinematic motion and high fidelity") leads.
- **Session library** (decision 5): `/history` rebuilt as the session archive — session
  titles/thumbnails, search + filters, no raw UUIDs, no Score badges, no `flux-kontext`
  provider tags; stop writing blank bootstrap drafts to the history store (they still
  appear as "Untitled prompt / OUTPUT —" entries).
- **Gallery landing + auth** (decision 6): manifesto zero-state now; gallery grid fed by a
  curated clip manifest once dogfooding produces clips; purple removed; single auth-aware
  CTA; `/products` + docs/support nav parked until real content exists. `/account` page
  reskinned under tokens (billing/invoices/credit rows stay functional but visually quiet —
  reskin only, per ADR-0002).

## Phase 3 — Verification / definition of done

1. `npx tsc --noEmit` · `npm run lint:all` · `npm run test:unit` green throughout; commits
   follow the commit protocol.
2. Golden-path e2e green.
3. A fresh headed walkthrough covering **all shells** (the 2026-07-01 review's method,
   extended past the golden path), written up as `docs/audits/` sibling; no surface may
   speak a different visual language.

## Out of scope

Frozen-stack features (billing logic, credit math, continuity/convergence UI), a11y
sweeps, light mode, new marketing content beyond the gallery/manifesto.
