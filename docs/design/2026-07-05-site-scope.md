# Site-wide scope — how ADR-0010 translates to every page

Status: **signed off 2026-07-06 by owner** — companion to the
[workspace build scope](2026-07-05-untangle-build-scope.md) and
[ADR-0010](../adr/0010-one-visible-text-one-loop-subscription-at-keep.md)/[0011](../adr/0011-rebuild-scope-decisions.md).
Grounded in a 2026-07-05 page-by-page sweep of every route.

> **Revised 2026-07-06** alongside the build scope: the M4 split (the space becomes a new
> M5) shifts the deletions to M6 and this site-coherence milestone to **M8**. Route
> dispositions (D7–D12) are unchanged. Added: the Docs rewrite mirrors the handoff's Docs
> screen; the Account credit-strip (D12) stands even though the handoff's Account screen
> still draws credits (a known stale drawing, like the Duplicate/Delete menus).

## The site has three zones

1. **The page** — `/` and `/session/:id`: the S0–S6 loop. The product.
2. **The satellites** — library, account, billing: where kept work and identity live.
3. **The public shell** — share, legal, support, docs, auth: finished surfaces that mostly
   need coherence edits, not rebuilds.

## Route-by-route disposition

| Route                                                                              | Today                                                                                                                                                         | Disposition                                               | Notes                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                | Workspace (renders logged-out too)                                                                                                                            | **Keep — rebuild per M2a–M5**                             | The page. Logged-out front door per ADR-0009.                                                                                                                                                                                                         |
| `/session/:id`                                                                     | Workspace bound to a session                                                                                                                                  | **Keep**                                                  | Restore lands at the derived stage (ADR-0011 D2).                                                                                                                                                                                                     |
| `/session/*/studio·create·continuity`, `/continuity/*`, `/create`, `/consistent`   | Redirects                                                                                                                                                     | **Keep**                                                  | Cheap compat; frozen-stack remnants already collapsed.                                                                                                                                                                                                |
| `/prompt/:uuid`                                                                    | Redirect via lookup                                                                                                                                           | **Keep**                                                  | Cheap compat.                                                                                                                                                                                                                                         |
| `/home`                                                                            | Manifesto landing (wordmark, one-liner, auth CTA)                                                                                                             | **Redirect → `/`** (D9)                                   | The 2026-07-04 glossary revision made the input the front door; a second front door is drift waiting to happen. Wordmark links point to `/`.                                                                                                          |
| `/history`                                                                         | Session library (search, filters, status badges)                                                                                                              | **Keep — becomes the Library**                            | Keep (S6) writes here; entries restore into the page. Copy shifts from "history" to kept clips + sessions. Already shares data source with the (dying) rail panel — no drift risk.                                                                    |
| `/account`                                                                         | Hub: avatar, email, **credit balance**, links                                                                                                                 | **Keep — strip credit-speak** (D12)                       | Credits died with ADR-0010; show subscription status when billing unfreezes. Small copy/section edit.                                                                                                                                                 |
| `/settings/billing` + `/invoices`                                                  | Credit tiers + packs + Stripe portal (flag off)                                                                                                               | **Stay frozen — do NOT unfreeze as-is**                   | Content is credit-based and now contradicts ADR-0010. Rewrite to single-subscription when payment ships.                                                                                                                                              |
| `/pricing`                                                                         | Credit tiers + packs + FAQ (flag off)                                                                                                                         | **Stay parked — rewrite to subscription before enabling** | Same contradiction. One plan, one price, watermark framing.                                                                                                                                                                                           |
| `/products`                                                                        | Placeholder cards (old-era features)                                                                                                                          | **Delete → redirect `/`** (D10)                           | Placeholder describing a product that no longer exists; already hidden from nav.                                                                                                                                                                      |
| `/docs`                                                                            | Finished, but documents the OLD workflow (optimize→refine→preview→generate) and deleted/frozen features (Video Concept Wizard, Model Compilation, Continuity) | **Rewrite to the S0–S6 story (M8)**                       | Until rewritten it actively mis-teaches the product; keep footer-linked only.                                                                                                                                                                         |
| `/contact`, `/privacy-policy`, `/terms-of-service`                                 | Finished                                                                                                                                                      | **Keep**                                                  | Terms/privacy mention credits/Stripe — one copy pass when subscription ships.                                                                                                                                                                         |
| `/signin`, `/signup`, `/forgot-password`, `/reset-password`, `/email-verification` | Finished, redirect-param aware                                                                                                                                | **Keep**                                                  | Become the fallback/direct-link surfaces; the M4 auth dialog is the primary path and reuses these flows.                                                                                                                                              |
| `/share/:uuid`                                                                     | Read-only prompt share: "Original Input / Optimized Output" + quality score                                                                                   | **Reshape: share a kept clip** (D8)                       | Prompt-sharing is prompt-era residue; quality score is already dev-flagged dead. New shape: public clip player + its paired description + "Made with Vidra → make your own" — the growth loop that also feeds the gallery landing's future clip grid. |
| `/assets`                                                                          | Asset library CRUD (characters/styles/locations/objects)                                                                                                      | **Park → redirect `/`** (D11)                             | Its consumption surfaces (Characters/Styles panels, reference images) die in M6; server-side assets stay dormant per ADR-0010. Un-park if @-assets ever return.                                                                                       |
| `*` (404)                                                                          | NotFoundPage                                                                                                                                                  | **Keep**                                                  | —                                                                                                                                                                                                                                                     |

## Navigation model (D7)

The left tool rail dies with its panels. What remains of chrome:

- **The page:** the existing top bar (wordmark › session title) gains a quiet right-side
  cluster: **Library** (→ `/history`) and the **account avatar** (existing popover:
  manage account, sign out). No rail, no panels, no credit pill (credits are gone;
  subscription status lives on `/account`).
- **Satellites/public shell:** the existing TopNavbar stays; wordmark → `/`; nav links
  stay parked until Docs is rewritten. Footers keep Contact/Privacy/Terms (+ Pricing only
  when it's true again).
- **Auth pages:** unchanged (no shell).

## Cross-page workflows

- **W1 First clip (stranger):** `/` → type → Go → auth dialog (drafts survive) → S1–S5 →
  Keep → S6 → clip in Library. One page until the very end.
- **W2 Return:** `/` opens fresh (S0). Library lists past sessions/clips; clicking one
  opens `/session/:id` at its derived stage.
- **W3 Keep:** S6 persists the kept clip + description to the session record; Library
  shows it; Download from the player.
- **W4 Share:** from S6, share produces `/share/:uuid` — public clip + description +
  make-your-own CTA → `/`.
- **W5 Identity:** avatar → `/account`; billing stays frozen until the subscription
  rewrite ships.
- **W6 Help/legal:** footer links only; contact form as today.

## New milestone

**M8 — Site coherence (after the space / M5, before launch):** `/home` redirect + wordmark
retarget, rail removal (lands with M6 deletions), Docs rewrite to the S0–S6 story (mirroring
the handoff's Docs screen — the Type → Picture → Motion → Keep flow chips + the "what the
space shows" node diagram), share-a-clip reshape, account credit-speak strip (D12 stands
even though the handoff's Account screen still draws credits — a known stale drawing),
products deletion, 404/redirect audit. Size: **M (3–4 days)**, almost all copy and routing —
plus the one real build, the public clip page.

## Decision points requiring owner sign-off

| #   | Decision                             | Recommendation                                                                     |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| D7  | Workspace chrome after the rail dies | Top-bar right cluster: Library + avatar. No rail.                                  |
| D8  | What `/share` shares                 | A kept clip (public player + description + CTA); prompt-share dies.                |
| D9  | `/home` fate                         | Redirect to `/`; the input is the only front door.                                 |
| D10 | `/products`, `/docs`, `/pricing`     | Delete products; rewrite Docs in M8; pricing parked until subscription rewrite.    |
| D11 | `/assets`                            | Park (redirect `/`) while consumption surfaces are deleted; server assets dormant. |
| D12 | `/account`                           | Strip credit balance now; subscription status when billing unfreezes.              |
