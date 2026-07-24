# 0019 — The studio: a standalone conversational image workspace

**Status:** Accepted 2026-07-24; **amended same day** (decision 5 reversed by owner — see the amendment note). Widens ADR-0002's deliverable statement; upholds ADR-0012's spatial rule after the revisit ADR-0017 mandated; leaves ADR-0010's page anatomy untouched.

## Context

Dogfooding Recraft's AI chat to design Vidra's own logo showed the experience is two independent tiers: an orchestrator LLM that runs the conversation (clarifying questions, follow-up suggestions, rejection diagnosis, prompt writing) and image models that render and edit. Vidra already owns the seam for each (`aiService` is the only LLM routing layer; `ImagePreviewProvider` is the image-engine port). The goal is a faithful copy of that product loop as a standalone surface.

## Decision

1. **Own surface.** The studio is a rail destination (`/studio`) with a chat thread and its own infinite plane — never a resident of the page (ADR-0010's anatomy stands).
2. **Images are the product.** The studio's deliverable is the image itself — Vidra's first non-clip deliverable. This widens ADR-0002's "one good clip" mission statement; authoring intelligence remains the moat, now applied to a second medium.
3. **Persisted from day one.** A studio project (thread + produced images) is a first-class record in its own collection — never inside `SessionPrompt`.
4. **Derived layout.** Batches land as derived, chronological clusters; nothing spatial is stored. ADR-0017 required any accumulating-board idea to revisit ADR-0012's rule first; we revisited and kept it.
5. **The reference picker's roster, behind a capability registry.** The studio carries the reference product's model roster via Replicate — the Recraft V4.1 tiers (standard/Vector/Pro/Pro Vector) for design text-to-image and SVG, the Nano Banana tiers (2 / 2 Lite / Pro) and GPT Image 2 for generation _and_ true image editing (prompt + input images), plus the prompt-less Recraft utilities (background removal, vectorize). A user-facing model picker defaults to **Auto mode** (the orchestrator routes by capability through a server-side registry); a user may pin a model, and a pin that lacks a requested capability triggers an ask-how-to-proceed negotiation, never silent rerouting. Replicate IDs stay server-side; client and LLM speak stable slugs.
6. **Deterministic orchestrator shell.** The turn loop is owned by service code: the LLM returns one typed decision object per turn, enforced at the boundary — not a free-running tool-calling agent. Same expressive power, but replay-fixture-testable and eval-gateable like every other Vidra LLM surface.
7. **No credits.** ADR-0010's economics stand: nothing in the studio shows or charges credits (no cost hints in the picker either); spend is bounded by a server-side, dollar-denominated daily cap, atomically reserved per turn against the registry's per-call cost estimates.

### Amendment (2026-07-24, same day)

Decision 5 originally read "Recraft models via Replicate, exclusively; no flux anywhere in this feature," which made the studio text-to-image-only (the Replicate Recraft generation models take no image input) and forced every refinement through prompt rewriting. The owner reversed this the same day: **the reference product is an image _editing_ studio, and a copy that cannot edit images fails the point.** Capability parity outranks provider purity. The blanket no-flux ruling is void; model choice is per-capability on quality, with the registry as the swap point.

## Considered alternatives

- **Fold into the golden path.** The space already renders lineage, and a batch maps naturally to sibling picture nodes. Rejected for now: the page's anatomy is locked (ADR-0010) and the conversation policy is unproven — the studio is where it earns graduation.
- **Freeform board.** Recraft parity with draggable, persisted arrangement. Rejected: an editor's worth of machinery plus Vidra's first stored geometry, for a capability the dogfood session never actually used.
- **Single-provider purity (Recraft-only, no flux).** Held for part of a day; reversed by the amendment above once it became clear it amputated editing — the core capability of the product being copied.

## Consequences

- A second product loop now exists beside the golden path; keeping it standalone is deliberate, and revisiting that is a product decision, not a refactor.
- Editing is real: refinements on a selected image run through an edit-capable model. Capability honesty still applies at the edges — anything no registered model can do is declined with an offer, never silently faked.
- The orchestrator and the image engines are independently swappable. The model picker (Auto mode default) and SVG generation ship in v1; vectorize-an-existing-image, attach-your-own reference image, and a first-frame bridge are near-term follow-ups behind the same seams.
