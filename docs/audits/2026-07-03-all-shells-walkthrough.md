# All-shells coherence walkthrough — 2026-07-03

The definition-of-done audit for the design overhaul
([ADR-0008](../adr/0008-one-design-language-across-all-shells.md), plan:
[2026-07-02-design-overhaul-plan.md](../design/2026-07-02-design-overhaul-plan.md),
issues #49–#64). Method: headed Chrome walkthrough of every shell against the live dev
stack (real Firebase boot — the GCP suspension is resolved), extending the
2026-07-01 UX-review method past the golden path. Sibling doc:
[2026-07-01-ux-review.md](2026-07-01-ux-review.md).

## Verdict

**The three-shell incoherence is gone.** Marketing, workspace, and account/library
surfaces now speak one monochrome language: neutral chrome, hairline borders, overline
micro-labels, system components, and the span palette as the only meaningful color.
Fourteen of fourteen shipped issues verified live; four minor observations filed below
(none are cross-shell language breaks). The golden path ran end-to-end **with a real
generated frame** for the first time since the storage suspension.

## Verified, surface by surface

| Surface                      | Verdict | Evidence                                                                                                                                                                                                                                                                               |
| ---------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gallery landing (`/home`)    | ✓       | Manifesto zero-state: overline eyebrow, one-liner, single auth-aware white CTA. Purple gone; nav = wordmark + one action (#62). Empty manifest correctly falls back (#64).                                                                                                             |
| Workspace pre-work           | ✓       | Hero + chips + composer unchanged; Sessions rail icon is the layered-stack glyph (#52).                                                                                                                                                                                                |
| Restored session             | ✓       | "Dog Running" opens to the FrameStage no-frame state ("No frame yet / Create frame"), not the hero + void. Canvas-ownership rule holds at every beat (#51).                                                                                                                            |
| Panels + breadcrumb          | ✓       | Sessions/Characters/Styles share one `PanelHeader`; breadcrumb stays visible with a panel open (#52).                                                                                                                                                                                  |
| Aspect/duration menus        | ✓       | Opaque, z-scaled system dropdown with selection dot — the invisible floating text is gone (#56).                                                                                                                                                                                       |
| Tune drawer                  | ✓       | Composer goes opaque when expanded — no frosted smear; `MOTION/MOOD/STYLE` ride the overline token, actually uppercase (#53a, `f0034eea`).                                                                                                                                             |
| Suggestion tray              | ✓       | Chips inset from the card edge; dev-only debug chrome correctly dev-gated.                                                                                                                                                                                                             |
| Model showroom               | ✓       | Full-screen gallery kept: monochrome sample-still slates with framed model-name overlines, strength copy leads, radio selection — zero credits, zero dot-meters, zero gradients (#60).                                                                                                 |
| Account popover              | ✓       | One avatar affordance; popover with identity, sync status, Manage account, Sign out — no mid-work navigation (#59).                                                                                                                                                                    |
| Session library (`/history`) | ✓       | Session vocabulary end-to-end: titles, dates, thumbnails (loading again post-restoration); UUIDs, Score badges, and provider tags gone (#61).                                                                                                                                          |
| Account + auth (`/account`)  | ✓       | Token-only: quiet credit/billing rows, system Verified badge, exactly one sign-out (#63).                                                                                                                                                                                              |
| Live loop                    | ✓       | One-liner → "Expanding your idea…" → expanded span-labeled prompt + derived title → "Does this frame match your idea?" → **real first frame on the stage** → motion-idea chips → frame thumbnail docked in composer → Make it armed. Score toast appears in dev only, by design (#54). |
| Thumbnails                   | ✓       | Real thumbnails render via the storage proxy; letter-avatar fallback in place (#55).                                                                                                                                                                                                   |
| Golden-path e2e              | ✓       | `golden-path.spec.ts`: 1 passed, 1 self-skipped (frame-generation case needs live providers; covered empirically by the headed run).                                                                                                                                                   |

## Filed observations (minor — none block sign-off)

1. **Post-expansion frosted smear.** The gate caption ("Does this frame match your
   idea?") bleeds through the composer's translucent top edge when the composer holds
   the expanded prompt + motion ideas. Same class as the fixed #53a smear; the opacity
   trigger covers Tune-drawer/suggestion-tray but not this state. Fix: include the
   post-expansion state in the opaque-when-expanded condition.
2. **Suggestion tray has no loading state.** ~6s of empty card between span click and
   suggestions arriving. The motion-ideas section has skeletons; the tray should too.
3. **One session thumbnail renders blank-white** ("Penguin Playing Piano") in both the
   rail switcher and the library — an asset that 200s but paints empty may be dodging
   the letter-avatar fallback.
4. **Fullscreen-dialog entrance can stall under main-thread load.** The showroom's
   wrapper was observed frozen at ~0.29 opacity (state `entered`, dev-mode module churn)
   for tens of seconds before settling at 1 — a ghosted modal. Consider making the
   entrance transition starvation-proof (instant-mount fallback or animation instead of
   transition). Dev-load dependent; not reproduced when idle.

Also noted, pre-existing and out of overhaul scope: two font families load
(Plus Jakarta Sans + Geist); the sessions switcher's filtered-empty state says
"No prompts match these filters" (session vocabulary should say sessions).

## State of the ratchet

ESLint guardrails are live (raw `<button>` and raw palette classes banned in active
surfaces; backlog allowlists of 59 button / 10 palette files may only shrink —
`631fd0f4`, see `config/lint/eslint.config.js`). DaisyUI is removed
(`3be15211`); the system Alert/overline compile bugs are fixed and regression-pinned
(`f0034eea`).

## Sign-off

All acceptance criteria of issue #65 except owner sign-off are met. Owner: review this
document and the live app, then close #65.
