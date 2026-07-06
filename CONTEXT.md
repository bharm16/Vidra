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

The source image handed to an I2V model — the dominant control over the final video, and therefore the artifact most worth getting right. In I2V the first frame has displaced the text prompt as the center of the product. Consequently the frame (or its pending/failed state) owns the workspace canvas at every beat of the expansion loop, and the prompt renders as its editable caption — never the reverse. Resolved 2026-06-08 during scope-clarification grilling; canvas-ownership corollary resolved 2026-07-02 during UX-review grilling. Avoid synonyms: source image, still.

### Preview-image persistence

The storage concern of saving a draft preview image (always PNG). Owned by the `StorageService` interface via `savePreviewImage(userId, buffer, metadata?)`, which fixes the storage type (`PREVIEW_IMAGE`) and the mime behind the verb so callers never name `STORAGE_TYPES` or reach into `storage/config/`. Resolved 2026-06-08 during architecture-deepening review. Avoid synonyms: image upload, saveFromBuffer.

### Public span category

The `category` field on a span in the labelSpans route DTO (`toPublicSpan`): a normalized, valid taxonomy id — never a raw role and never the invalid `unknown`. Normalized once, server-side, via the shared `normalizeRole` in `@shared/taxonomy`; the client trusts it rather than re-deriving. Resolved 2026-06-08 during architecture-deepening review. Avoid synonyms: span role, raw role.

### Selected span

The span the creator clicked for click-to-enhance, together with the suggestion session it opens (inline suggestions, custom request, apply/close). Owned by one client module — `SelectedSpanContext` in `client/src/features/prompt-optimizer/context/` — provided by PromptCanvas and consumed via `useSelectedSpan()`; never threaded through component props. Resolved 2026-07-01 during architecture-deepening review. Avoid synonyms: highlighted span (that is the Enhancement request field), active span.

### Golden path

The single end-to-end walkthrough that defines a working product: empty canvas → creator submits a one-liner → expansion → first frame (explicit gate) → motion → render → a clip the creator can watch and keep. "Complete product" and "works end to end" mean the golden path runs green — nothing else counts as done. Composed from the Idea Box and ADR-0002 definitions. Resolved 2026-07-01 during ship-definition grilling; first audit: [docs/audits/2026-07-01-golden-path-audit.md](docs/audits/2026-07-01-golden-path-audit.md). Avoid synonyms: happy path, main flow, E2E flow.

### Span palette

The semantic color set carried by span categories — the only color in the product that carries meaning. All chrome (buttons, surfaces, accents, marketing) stays neutral so color always reads as span category, never as brand — governed by [docs/adr/0008-one-design-language-across-all-shells.md](docs/adr/0008-one-design-language-across-all-shells.md). Resolved 2026-07-02 during design-overhaul grilling. Avoid synonyms: highlight colors, accent palette, brand colors.

### Model showroom

The full-screen gallery where a creator browses draft/render models as large sample-still cards and picks one — a deliberate showcase moment, not a settings dropdown. Speaks the workspace monochrome language; generation economics (credits, prices) never appear in it. Resolved 2026-07-02 during design-overhaul grilling. Avoid synonyms: model picker, render-models modal, model selector.

### Session library

The full-archive presentation of Sessions on its own page: same entity, titles, thumbnails, and vocabulary as the rail panel, which remains the quick switcher. Replaces the prompt-level "History" page; a session's internal generation attempts are not library entries. Resolved 2026-07-02 during design-overhaul grilling. Avoid synonyms: history, prompt history, archive.

### Gallery landing

The logged-out front door is the page itself: a stranger lands on the input (one quiet product line above it, starter chips below) and can type immediately — auth appears at Go, and the typed draft survives sign-up and runs right after. Vidra-made clips render under the input once dogfooding produces them; no empty grid, no separate manifesto screen. Revised 2026-07-04 during entry-spec grilling (supersedes the 2026-07-02 manifesto zero-state); original resolved 2026-07-02 during design-overhaul grilling. Avoid synonyms: marketing site, homepage, splash page, manifesto.

### The input

The single text box on the workspace. It starts holding the creator's one-liner; after go, the same box holds the full shot description Vidra wrote, with clickable highlights for swapping words. There is never a second text surface on the page. Resolved 2026-07-04 during requirements-strip grilling. Avoid synonyms: composer, prompt bar, caption, prompt artifact.

### The space

The structured lineage network that fills the page once work exists: every take is a node, laid out automatically into three fixed generations (words → pictures → clips), with edges typed by the creator's verbs (roll, reword, move). Nodes are never dragged, wired, or manually placed — the space grows behind the work; it is history made visible, not a tool the creator operates. First run with no branches renders as a straight line; the network appears only when branching creates it. One space holds exactly one root — one idea, one words-origin, one tree; a new idea is a new session, born at the centered empty state. Resolved 2026-07-05 during lineage-canvas brainstorm (ADR-0012, amending ADR-0010); single-root resolved same day during wireframe review. Avoid synonyms: canvas, board, graph view, node editor, workspace (that means the whole page).

### The player

The live node in the space — whichever take is current, enlarged, with the camera centered on it: the waiting state, then the picture, then the video, in place. Selecting another node slides the camera and restores that take's paired words into the input. Nothing plays anywhere else. It appears with the first go and never before. Originally resolved 2026-07-04 as a fixed rectangle; redefined 2026-07-05 as the live node (ADR-0012). Avoid synonyms: stage, viewport, FrameStage (a component name, not a domain term).

### The next-step button

The page shows only the action that advances the work right now: Go → Use this / Try again → Make it move → Keep. Controls for other moments stay hidden until their moment. Resolved 2026-07-04 during requirements-strip grilling. Avoid synonyms: CTA, gate controls, action bar.

### The page

The workspace is exactly the space, the input, and the next-step button. Before the first go there is no space — just the centered input with its starter chips; on first submit the input docks to its permanent position and the space is born with the first node. Everything else is a setting summoned on demand or lives off the page (past work in the session library). When a design discussion adds a fourth resident element, the discussion is wrong. Resolved 2026-07-04; anatomy revised 2026-07-05 (ADR-0012). Avoid synonyms: workspace shell, editing canvas.

### Take

One generated result — a picture or a clip — permanently paired with the exact text that produced it. Every take is a node in the space; selecting it makes it live — the camera moves to it and its paired words return to the input. Nothing is displaced or lost by moving between takes, so no separate browse/restore step exists. Resolved 2026-07-04 (ADR-0010); selection semantics revised 2026-07-05 with the space (ADR-0012). Avoid synonyms: generation, tile, shot, variant.

### Keep

The action that ends the loop: the creator saves the clip they're proud of to the library. Everything upstream of Keep is free; Keep is where the subscription offer lives (ADR-0010). Resolved 2026-07-04 during untangling decision. Avoid synonyms: save, export, download (downloading is what happens after Keep).

<!-- New terms go here, following the format above. -->

## Relationship to ADRs

Term _meanings_ live here (and in the CLAUDE.md glossary); architectural _decisions_ — why an approach was chosen, with trade-offs — live in [`docs/adr/`](docs/adr/). When a term's meaning hinges on a decision, link the ADR instead of restating it. Example: the labeling pipeline's shape is governed by [docs/adr/0001-span-labeling-extraction-strategy.md](docs/adr/0001-span-labeling-extraction-strategy.md).
