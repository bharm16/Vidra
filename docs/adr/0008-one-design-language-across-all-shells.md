# One design language across all shells: workspace monochrome, span palette as the only semantic color

**Status:** accepted (2026-07-02)

Vidra's UI had drifted into three coexisting shells from three product eras — the canvas
workspace, a marketing site with its own purple accent (`/home`, `/products`, `/docs`), and
a SaaS account/history app (`/account`, `/history`, `/settings/billing` — credits, invoices,
raw UUIDs) — plus a design system (`@promptstudio/system`, shadcn-style) adopted at only
~65% in the client. A 2026-07-02 headed design review
([plan](../design/2026-07-02-design-overhaul-plan.md)) resolved the overhaul.

**The decision.** All three shells unify under the workspace's monochrome dark language,
with `@promptstudio/system` as the single component source (DaisyUI removed; hand-rolled
primitives replaced by system/Radix ones). There is deliberately **no brand accent color**:
chrome stays neutral because color carries meaning in this product — the **span palette**
(semantic span-category colors) must be the only color that reads as signal. Marketing CTAs
use the same primary treatment as the workspace's "Make it".

**Corollary — frozen stacks never speak in the creator loop.** Reskinning frozen surfaces
(account, billing pages) for coherence is in scope; surfacing their concepts inside the
authoring loop is not. Credits/prices leave the model showroom; the self-scoring "Prompt
could be improved" toast leaves the loop (dev-flag only). This is the UI-layer enforcement
of [ADR-0002](0002-vidra-is-an-authoring-tool-for-non-experts.md)'s freeze.

## Considered options

- **Purple as brand** — rejected: a saturated accent competes with the span palette on the
  canvas, where color must mean span category.
- **Amputate shells 2–3** (workspace-only product) — rejected by owner: marketing (as a
  gallery landing of Vidra-made clips), the session library, and the account page stay as
  living, reskinned surfaces.
- **Flatten the model picker** (intent toggle / compact list) — rejected by owner: the
  showroom is a deliberate showcase moment; it keeps its full-screen gallery form,
  re-skinned with real sample stills and no economics.

Vocabulary for the resolved surfaces (span palette, model showroom, session library,
gallery landing) lives in [CONTEXT.md](../../CONTEXT.md).
