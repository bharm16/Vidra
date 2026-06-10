# CONTEXT

Domain vocabulary for Vidra. Read before naming a domain concept in an issue title, plan, refactor proposal, hypothesis, or test name.

## Source of truth: the CLAUDE.md Domain Glossary

The canonical definitions for this project's core domain terms — **Span labeling, Enhancement / Suggestions, Optimization, Continuity, Convergence, Model Intelligence, Preview, Generation** — live in the **"Domain Glossary"** table in [`CLAUDE.md`](CLAUDE.md), alongside each term's server path and route.

Do **not** copy those definitions here. `CLAUDE.md` is loaded into every agent's context, so a second copy would only create a source that drifts out of sync. When you name one of those concepts, use the term exactly as the glossary defines it — and honor its rule: _"Do not conflate them."_

## Local glossary (terms not yet in CLAUDE.md)

`/grill-with-docs` appends entries below as planning sessions resolve vocabulary the CLAUDE.md glossary doesn't already cover.

### Creator

The non-expert video maker Vidra exists for — someone who cannot yet reliably produce a single good shot, stuck at "I don't know what to type." Explicitly _not_ the expert whose problem is multi-shot coherence. Resolved 2026-06-08 during scope-clarification grilling. Avoid synonyms: user, customer.

### Authoring intelligence

Vidra's core capability and reason to exist: converting a creator's vague intent into generation-ready I2V inputs (first-frame prompt, motion description, model selection). The umbrella over the narrower CLAUDE.md-glossary mechanics (span labeling, enhancement, optimization, model intelligence) — name those mechanics by their own terms; use "authoring intelligence" for the whole capability. Resolved 2026-06-08 during scope-clarification grilling.

### I2V (image-to-video)

The generation paradigm Vidra targets, where a source image (the first frame) is the primary control over the result; the text motion description is secondary. Contrast T2V (text-to-video), where text is the only control surface. Resolved 2026-06-08 during scope-clarification grilling. Avoid synonyms: img2vid, animation.

### Expansion

The interaction model where Vidra converts a creator's thin idea (a one-liner) into a generation-ready first-frame prompt — authoring _for_ them from a blank page. ADR-0002's primary unvalidated hypothesis is that creators need expansion, not refinement. Resolved 2026-06-09 during validation-study grilling. Avoid synonyms: brainstorm, generation (which means rendering video).

### Refinement

The interaction model where Vidra improves a draft the creator already wrote — span labeling plus click-to-enhance. Assumes the creator can produce a workable draft; demoted to a secondary layer under ADR-0002. Resolved 2026-06-09 during validation-study grilling. Avoid synonyms: enhancement (the CLAUDE.md-glossary mechanism is one _part_ of refinement), editing.

### Idea Box

The empty-canvas entry surface of the workspace: a creator's submit runs the expansion loop (expand → first frame → gate → motion → render) with one explicit gate at the first frame. Every empty-canvas submit expands — no mode, no toggle, no input classification. Resolved 2026-06-10 during front-door design grilling. Avoid synonyms: wizard, onboarding flow, create page.

### First frame

The source image handed to an I2V model — the dominant control over the final video, and therefore the artifact most worth getting right. In I2V the first frame has displaced the text prompt as the center of the product. Resolved 2026-06-08 during scope-clarification grilling. Avoid synonyms: source image, still.

### Preview-image persistence

The storage concern of saving a draft preview image (always PNG). Owned by the `StorageService` interface via `savePreviewImage(userId, buffer, metadata?)`, which fixes the storage type (`PREVIEW_IMAGE`) and the mime behind the verb so callers never name `STORAGE_TYPES` or reach into `storage/config/`. Resolved 2026-06-08 during architecture-deepening review. Avoid synonyms: image upload, saveFromBuffer.

### Public span category

The `category` field on a span in the labelSpans route DTO (`toPublicSpan`): a normalized, valid taxonomy id — never a raw role and never the invalid `unknown`. Normalized once, server-side, via the shared `normalizeRole` in `@shared/taxonomy`; the client trusts it rather than re-deriving. Resolved 2026-06-08 during architecture-deepening review. Avoid synonyms: span role, raw role.

<!-- New terms go here, following the format above. -->

## Relationship to ADRs

Term _meanings_ live here (and in the CLAUDE.md glossary); architectural _decisions_ — why an approach was chosen, with trade-offs — live in [`docs/adr/`](docs/adr/). When a term's meaning hinges on a decision, link the ADR instead of restating it. Example: the labeling pipeline's shape is governed by [docs/adr/0001-span-labeling-extraction-strategy.md](docs/adr/0001-span-labeling-extraction-strategy.md).
