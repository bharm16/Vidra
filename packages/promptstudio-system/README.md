# @promptstudio/system

Vidra's design system. Token values are synthesized from measured values
across Krea, Runway, Luma, Ideogram, ElevenLabs, Pika, Midjourney, and
Magnific — majority/median where they disagreed.

## Source of truth

- `src/tokens.css` — every primitive and semantic token. Light `:root`,
  dark via `.dark` on `<html>` (the app mounts dark; see
  `client/index.html`). The fenced **Vidra extensions** section holds the
  only app-specific tokens (surface ladder, faint/ghost text steps,
  status colors, badge tints, atmosphere knobs) — each derived from the
  synthesis primitives, never hand-painted hex.
- `tailwind.preset.js` — the only bridge from tokens to utilities.
  Entries marked `bridge` keep pre-replacement class names compiling;
  migrate call sites to the canonical name, then delete the bridge.
- `src/base.css` — base application (body, editor surface, focus ring,
  reduced motion). Tailwind preflight is unlayered and wins ties against
  `@layer ps.base`, so base rules only carry declarations preflight
  leaves alone; type scale lives in the `text-*` utilities.

## Using it

- **Type triples travel together.** Every `text-*` utility applies size,
  line-height, and tracking as a set. Never set a display size with a
  default tracking — that is the single biggest unart-directed tell.
  Product chrome is `text-ui` (14px); reading surfaces are `text-body`.
- **Color is near-monochrome.** `--accent` is the one hue and should
  appear roughly twice per screen — the generated imagery is the color.
  Status states use `--success` / `--warning` / `--destructive`; grays
  come from the semantic surface/foreground pairs, and hover states are
  lightness shifts (oklch), not hue shifts.
- **Pick five spacing values per surface.** Product chrome lives around
  4/8/12/16 (`--space-1..4`), marketing around 20/32/48/80
  (`--space-5/8/12/20`). The rest of the scale is an escape hatch, not
  an invitation.
- **Feedback is fast, reveals are slow.** Hover/focus at
  `--duration-fast`, toggles/popovers at `--duration-medium`,
  layout/drawers at `--duration-slow`, scroll reveals at
  `--duration-slower`. Scope transitions to property groups
  (`--transition-colors` etc.) — never `all`.
- **Hairline borders do the work shadows usually do.** Surfaces get
  `border-hairline` + `--border`; shadows stop at `--shadow-md`.

## Rules

1. No raw hex, rgb(), or px values in components — tokens only
   (ADR-0008; enforced by `config/lint/eslint-plugin-no-hardcoded-css`).
2. New tokens go through `src/tokens.css` and must be derived from the
   synthesis primitives. If a value can't be expressed that way, the
   design is drifting — stop and reconcile.
3. `z-*` utilities are the only stacking mechanism; `--ring` is the only
   focus treatment (pinned by
   `tests/unit/design-system-stacking-and-focus.test.ts`).
4. Unused vocabulary gets deleted, not kept "just in case" — audit with
   the token liveness sweep before adding scale steps.
