# The design handoff is the authoritative visual spec; its language lives in the shared tokens

**Status:** accepted (2026-07-08) · concretizes [ADR-0008](0008-one-design-language-across-all-shells.md) — names `design_handoff_vidra/` as the pixel-level source of truth, gives its accent a value and a token home, and supersedes any conflicting visual/chrome wording in the site-scope doc (notably D7's "top-bar cluster, no rail")

The rebuild carries two kinds of spec, and they drifted apart. **Functional** specs
([ADR-0010](0010-one-visible-text-one-loop-subscription-at-keep.md)/[0011](0011-rebuild-scope-decisions.md)/[0012](0012-the-space-lineage-network.md)/[0013](0013-space-lineage-is-persisted-not-derived.md)
plus the build- and site-scope docs) fix the state machine, the space model, and route
dispositions. A **visual** spec — the high-fidelity design handoff `design_handoff_vidra/`
(9 screens at 1440×900 with final color, type, spacing, motion, and chrome) — fixes the look
and feel. The functional track (M1–M7) shipped against the existing `@promptstudio/system`
aesthetic; the visual handoff was never coded. So the two diverged: the 2026-07-05 site-scope
doc described the workspace chrome as "the tool rail dies → a top-bar right cluster
(Library + avatar), no rail," while the handoff's chrome is a persistent **navigation rail**
(`Rail.dc.html`: 240/64px — logo → new session, New session, Library, Docs & help, Account).
Implementing D7 from the site-scope text produced a top-bar cluster that contradicts the
design; a 2026-07-08 review caught it. The design language itself — Space Grotesk + Space Mono,
a themeable `#5b6cff` accent, filmic grain + vignette + ambient light, a dotted canvas grid —
was absent from the codebase entirely.

**The decision.** `design_handoff_vidra/` is the **authoritative visual and chrome source of
truth** for the workspace rebuild. Where a text spec (the site-scope doc, or prose inside a
functional ADR) conflicts with the handoff on look, layout, chrome, or interaction _feel_, the
handoff wins; the functional ADRs remain authoritative for _behavior_ (the state machine, the
space contract, payment placement). Concretely:

1. **The design language is adopted into the shared design system** (tokens layer /
   `@promptstudio/system`), not per screen: Space Grotesk (UI) + Space Mono (labels, metadata,
   uppercase eyebrows), a themeable `--accent` (default `#5b6cff`) whose tints are derived with
   `color-mix(in srgb, var(--accent) N%, …)`, the grain/vignette/ambient-light atmosphere
   primitives, and the spacing (4–34) / radius / shadow scales. This concretizes ADR-0008's
   2026-07-05 amendment, which named "a restrained indigo accent + state colors" without a
   value or a token home.
2. **The workspace chrome is the navigation rail**, not a top-bar cluster. The rail is the
   chrome for Workspace / Library / Account. The **empty state** ("Anchor") carries a minimal
   top bar only (wordmark + Library + avatar, no rail); the **public clip** page carries
   minimal public chrome (wordmark + Sign in). This supersedes the site-scope D7 "no rail /
   top-bar cluster" wording. (The old _tool_ rail — Characters/Styles/Sessions panels — still
   dies; it is not this rail.)
3. Each screen is built to the handoff pixel-close, translating its 1440×900 absolute
   positions into the codebase's responsive React/Tailwind idiom (the handoff's own
   instruction), reusing system components.

## Considered options

- **Keep following the text specs; treat the handoff as loose inspiration** — rejected: it
  already produced a wrong-chrome build, and the handoff is explicitly high-fidelity
  ("recreate pixel-accurately").
- **Implement the design per screen without centralizing tokens** — rejected: the handoff's
  color model is `color-mix(--accent …)` and themeable; scattering it guarantees drift and
  blocks the themeable-accent intent.
- **Adopt the handoff into the shared tokens as the single visual source of truth, handoff-wins
  on conflicts** (chosen).

## Consequences

- The rebuilt screens need a real visual pass. D7/D8/docs keep their _functional_ work (the
  tool-rail deletion, the share server endpoints, the docs content) but their chrome/visuals
  are redone to the handoff — the nav rail replaces the top-bar cluster, the clip page becomes
  the cinematic player, the docs page gets the icon-rail + TOC + node-diagram layout.
- `design_handoff_vidra/` is committed into the repo so the reference is durable and this ADR's
  citation resolves.
- Future rebuild work reads the handoff (and this ADR) **before** implementing any surface. A
  text spec that contradicts the handoff is a doc bug to fix, not a thing to build.
- Two Google font families (Space Grotesk, Space Mono) enter as a real dependency; they are
  wired once, in the token layer, with self-hosting/perf handled there.
- ADR-0008 stands (one design language; the span palette is the only semantic color _inside_
  the text). This ADR gives 0008 a concrete visual vocabulary and token home, and resolves the
  chrome question it left open.
