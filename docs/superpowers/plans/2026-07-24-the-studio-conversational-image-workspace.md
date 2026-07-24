# Studio — conversational image generation and editing workspace

**Date:** 2026-07-24 · **Status:** planned, not started · **Decision record:** [ADR-0019](../../adr/0019-the-studio-standalone-conversational-image-workspace.md) (as amended same day)

## Summary

A new page at `/studio` (nav rail entry: **Studio**, under Library). A faithful copy of Recraft's AI-chat workspace:

- **Left: a chat panel.** The user describes an image. An LLM asks up to two clarifying questions if needed, then generates 4 variations, and after each batch shows 3 suggested follow-up actions as buttons. Refinements on a chosen image run as **real image edits** (image + instruction into an edit-capable model), not just re-prompting.
- **Right: a pan/zoom canvas** (reusing `CanvasViewport`). Each turn's results appear as a group (4 images for a generate, 1 for an edit). Positions are computed from chronological order — no dragging, nothing spatial saved.
- **A model picker** in the composer, defaulting to **Auto mode**. Auto routes every operation to the **cheapest capable model**; more expensive tiers run only on an explicit user pin. Pinning a model that can't do a requested operation triggers the ask-how-to-proceed flow, never silent rerouting.

Projects (chat history + all generated images) are saved to Firestore and can be reopened.

The images are the end product. This feature does not feed the video workflow and does not touch sessions.

## Decisions from the planning interview

| Question                      | Decision                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Where does this live?         | Its own page and route, separate from the main workspace                                                         |
| What does it produce?         | Images as the final product (not first frames for video)                                                         |
| Are conversations saved?      | Yes — Firestore, project doc + turns subcollection, from v1                                                      |
| Can users arrange the canvas? | No — positions are computed, nothing spatial is stored                                                           |
| Which image models?           | The Recraft-picker roster via Replicate (Recraft tiers, Nano Banana tiers, GPT Image 2) — see Model roster below |
| Image editing?                | Yes — core capability, v1 (owner reversed the earlier text-to-image-only ruling; recorded in ADR-0019)           |
| How is the LLM wired in?      | Server code owns the loop; the LLM returns one JSON decision per turn                                            |
| Billing                       | No credits UI; a **dollar-denominated** daily spend cap per user, atomically reserved per turn                   |
| Name                          | Studio (`/studio`)                                                                                               |

**Reversed ruling, for the record:** an earlier same-day decision ("Recraft models only, no flux anywhere") made the studio text-to-image-only. The owner reversed it: the reference product is an image _editing_ studio, and capability parity beats provider purity. ADR-0019 carries the amendment.

## Model roster (all verified to exist on Replicate, 2026-07-24)

The roster mirrors the reference's picker. Client and LLM use stable slugs; only the server knows Replicate IDs. The registry carries, per model: Replicate ID, capabilities, **an estimated cost per call in cents**, a latency hint, and an **aspect-ratio allowlist**. By-resolution models are pinned to one default resolution in v1 so their cost is a known constant.

| Picker label            | Replicate model                   | Capabilities (from schema/listing)                                              | Price             |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------------------- | ----------------- |
| Auto mode (default)     | — (orchestrator routes)           | Cheapest capable model per operation; escalation only by explicit pin           | —                 |
| Recraft V4.1            | `recraft-ai/recraft-v4.1`         | Text-to-image; design/typography strength; `prompt`/`size`/`aspect_ratio` only  | $0.04/image       |
| Recraft V4.1 Vector     | `recraft-ai/recraft-v4.1-svg`     | Text-to-SVG; same three inputs                                                  | $0.04/image       |
| Recraft V4.1 Pro        | `recraft-ai/recraft-v4.1-pro`     | Text-to-image at ~2048px; same three inputs                                     | $0.25/image       |
| Recraft V4.1 Pro Vector | `recraft-ai/recraft-v4.1-pro-svg` | Text-to-SVG, higher detail                                                      | confirm at M1     |
| Nano Banana 2           | `google/nano-banana-2`            | Generation **and editing**: `prompt` + `image_input` (up to 14 images), fusion  | by resolution; M1 |
| Nano Banana 2 Lite      | `google/nano-banana-2-lite`       | Fast/cheap generation and editing                                               | by resolution; M1 |
| Nano Banana Pro         | `google/nano-banana-pro`          | Highest-quality generation and editing                                          | by resolution; M1 |
| GPT Image 2             | `openai/gpt-image-2`              | Generation and editing, strong text rendering (High/Medium/Low = quality param) | confirm at M1     |

Utilities (not in the picker; invoked by the orchestrator):

| Operation         | Replicate model                        | Input                      | Price |
| ----------------- | -------------------------------------- | -------------------------- | ----- |
| Remove background | `recraft-ai/recraft-remove-background` | one `image` URI, no prompt | $0.01 |
| Vectorize         | `recraft-ai/recraft-vectorize`         | one `image` URI, no prompt | $0.01 |

Key schema facts (checked against live Replicate schemas):

- Recraft generation models take exactly `prompt` (≤10,000 chars), `size`, `aspect_ratio`. **No image input** — they cannot edit.
- `google/nano-banana-2` takes `prompt`, `image_input` (array up to 14 — edit sources and references), `resolution`, `aspect_ratio` (default `match_input_image`), `output_format`.
- `openai/gpt-image-2` generates and edits with strong instruction following (per model page); exact input names and the quality parameter get pinned down at M1.
- Reference-image generation and true edits are therefore **Nano Banana / GPT Image capabilities**; Recraft models are the design-quality text-to-image tier. This split is why Auto mode exists.

## Product behavior

Numbered for reference from tests and reviews. Observed directly in the owner's Recraft session.

1. **New project.** The user types what they want. If the request is missing key information, the assistant asks **at most 2** questions before generating, each with 3–4 clickable preset answers plus free text. Specific requests generate immediately. Follow-ups never re-trigger clarifying questions (except behavior 5).
2. **Generation.** A generation turn produces 4 variations: the LLM writes 4 different full prompts; the server runs 4 calls in parallel against the resolved model.
3. **Follow-up suggestions.** After each turn's results, 3 suggested next actions as buttons, generated by the LLM from the conversation, the last results, and the current selection. Project-specific, never generic. Edit-type suggestions ("Remove background", "Add wordmark to icon") are allowed — editing is real.
4. **Buttons are messages.** Clicking a suggestion sends its text as a user message. Typing is always available.
5. **Rejection.** "Don't like any of these" → the assistant asks what's wrong (preset answers: shape / color / layout / overall feel), then whether to keep the concept or try a new direction.
6. **Selecting an image.** Selection sets `selectedImageId`. From then on, refinement requests apply **to that image**: the orchestrator chooses `edit` (the image goes into an edit-capable model with an instruction) or `generate` (a rewritten prompt, seeded from the selected image's `sourcePrompt`, which selection promotes to the working `basePrompt`). Small changes to a liked image → edit; new directions or more variations → generate. This routing judgment is explicitly fixture-tested in M4.
7. **Model capability negotiation.** In Auto mode the orchestrator routes each request to the cheapest capable model, so edits just work. If the user has **pinned** a model that can't do the request (e.g. Recraft V4.1 — no image input — asked to edit), the assistant says so and asks how to proceed ("Regenerate from scratch (Recommended)" / switch model) — the flow observed in the reference session. Nothing is silently rerouted against an explicit pin.
8. **Misc.** "Thinking" indicator during turns; project auto-titled from the first request.
9. **Model picker.** Composer control listing the roster with Auto mode default and **latency hints only** (no cost hints — Studio shows no money anywhere, consistent with no-credits). The choice is per-project state, changeable any time. If a saved pin no longer resolves in the registry (model deprecated/renamed), the project silently reverts to Auto and the composer shows a one-line notice.

## Architecture: two independent layers

- **Layer 1 — conversation LLM** (via `aiService`): decides each turn's action, writes prompts and edit instructions, writes the suggestions, and emits a capability for Auto routing. It never calls Replicate and never picks literal models.
- **Layer 2 — image models** (via the provider registry): execute one operation each. They know nothing about the conversation.

### Request flow (asynchronous turns)

`POST /turns` does the fast part synchronously and the slow part in the background — with GPT Image 2 High at ~90s and Nano Banana Pro at ~30s, a fully synchronous turn would outlive platform HTTP timeouts.

```
user message ──► POST /api/studio/projects/:id/turns
                    │  1. load project (pin or Auto)
                    │  2. aiService "studio_turn" → one JSON decision
                    │  3. validate decision (schema + referential checks)
                    │  4. atomically reserve estimated turn cost (Firestore txn)
                    │  5. persist turn record (status: "running" | terminal)
                    ▼
        respond 202 { turnId, decision }   ◄── clarify/diagnose/negotiate turns
                    │                          are already terminal here (no image calls)
                    │  6. image calls run server-side (parallel for generate)
                    │  7. per-call: copy result to GCS, update turn record,
                    │     refund failed calls from the reservation
                    ▼
        client polls GET /projects/:id/turns/:turnId (~1s)
        until status is "complete" | "partial" | "failed"
```

### LLM output schema

Validated with `StructuredOutputEnforcer.enforceJSON`; server retries on mismatch. Beyond JSON shape, the server enforces **referential validity** (see Cost control and robustness) — violations are treated exactly like a schema failure and retried.

```ts
type StudioDecision =
  | {
      action: "clarify";
      questions: Array<{ text: string; quickPicks: string[] }>;
    } // max 2
  | {
      action: "generate"; // text → images
      basePrompt: string; // working prompt carried across turns
      variants: [string, string, string, string]; // 4 complete prompts
      capability: "design" | "svg" | "general"; // Auto-mode routing hint; ignored when a model is pinned
      aspectRatio?: string; // validated against the resolved model's allowlist; invalid → model default
      suggestions: [string, string, string];
      title?: string; // set on first generation
    }
  | {
      action: "edit"; // image(s) + instruction → one image
      instruction: string; // complete edit prompt written by the LLM
      sourceImageIds: string[]; // 1..14; every ID must exist in THIS project (server-verified)
      suggestions: [string, string, string];
    }
  | {
      action: "transform"; // prompt-less utilities
      operation: "remove_background" | "vectorize";
      sourceImageId: string; // must exist in this project (server-verified)
      suggestions: [string, string, string];
    }
  | { action: "diagnose"; question: string; quickPicks: string[] }
  | {
      action: "negotiate"; // pinned model lacks the needed capability
      reason: string;
      options: Array<{ label: string; message: string }>;
    };
```

**Why the loop is server code and not LLM function-calling:** every LLM response is one validated JSON object — testable with recorded fixtures (`REPLAY_MODE`) — and the server decides what actually runs. Recorded in ADR-0019.

**Model config:** add operation `studio_turn` to `server/src/config/modelConfig.ts` — client `openai`, model `gpt-4o-mini-2024-07-18` (already in the config), JSON response format, env-overridable. The orchestrator now carries routing and edit-vs-generate judgment; if mini fumbles those in the M3/M4 fixtures, upgrade this one operation.

**System prompt for `studio_turn`** must cover: the numbered behaviors; the pinned model (or Auto) and each roster model's capabilities; maintaining `basePrompt` (rewrite, don't append; selection promotes the selected image's `sourcePrompt`); edit-vs-generate choice for refinements; suggestions must be project-specific; negotiation rules for incapable pins.

## Cost control and robustness

The operational contract. These are M1 exit criteria, not polish — the spend-cap items are the only thing between a double-clicking user and unbounded spend on a $0.25 tier.

### Spend cap (atomic, dollar-denominated)

- **Unit: estimated dollars, not images.** An image count stopped bounding cost once a $0.25 Pro tier and by-resolution pricing entered the roster (200 edits ≠ 200 Pro 4-batches). Env: `STUDIO_DAILY_SPEND_CAP_CENTS`, default 500 ($5/user/day).
- **Cost source:** the registry's per-call cost estimate (by-resolution models pinned to one v1 resolution, so every call has a known constant cost; all estimates confirmed against Replicate at M1).
- **Atomic reservation:** inside one Firestore transaction, `POST /turns` reads today's usage counter, adds the turn's full estimated cost (4 × cost for generate, 1 × for edit/transform), and writes both the counter and the turn record — or aborts with a visible "daily limit reached" chat error. Two simultaneous submits cannot both pass; there is no check-then-spend gap.
- **Refunds:** each failed image call refunds its share of the reservation inside the turn-record update transaction. Failed calls never consume cap.

### Auto routing = cheapest capable

Auto mode resolves every operation to the **cheapest model whose capabilities cover it** (per the registry's cost estimates). More expensive tiers run only via explicit user pin. The `capability` hint narrows the candidate set; it never escalates price. This is a routing-table property, unit-testable without any LLM.

### Partial and failed turns

- **Generate (4 calls):** calls are independent. ≥1 success → turn ends `"partial"` or `"complete"`, rendering the successes with a per-slot failure note; 0 successes → `"failed"` with a visible error card. Failed calls are refunded.
- **Edit / transform (1 call):** failure → turn `"failed"` with a visible error card; reservation refunded. The thread keeps the user's message so retry is one click.
- **Timeouts:** per-call budget from the registry (latency hint × 3, clamped to 60–180s); on exceed the call is failed (rules above apply). The async turn flow means no HTTP request ever waits on a slow model.
- Replicate 402/429 → visible chat error, never silent (fal balance-lockout lesson, `cd0d45e4`).

### Input validation beyond JSON shape

- **`aspectRatio`:** checked against the resolved model's allowlist in the registry; invalid or unsupported → the model's default, logged, never an upstream 400.
- **`sourceImageIds` / `sourceImageId`:** every ID must resolve to a stored image **in this project**, array length 1–14, non-empty. Violation = schema-retry to the LLM (same path as malformed JSON). `enforceJSON` checks shape; this check is referential and lives in `StudioService` before any reservation or call.
- **Stale pin:** a `pinnedModel` that no longer resolves in the registry reverts to Auto on project load, with a one-line composer notice (behavior 9).

### Firestore document growth

Turns live in a **subcollection** — `studio_projects/{id}/turns/{turnId}` (decision, per-image records, status, costs). The project document holds only summary fields (`title`, `selectedImageId`, `pinnedModel`, timestamps, today's-usage pointer). Threads can run long (edits add instructions and ID arrays per turn) without approaching the 1 MiB document limit.

## Providers

- `ReplicateRecraftProvider` (t2i tiers + the two utilities) and `ReplicateImageEditProvider` (Nano Banana tiers + GPT Image 2 — prompt + image array), both in `server/src/services/image-generation/providers/`, implementing the existing `ImagePreviewProvider` pattern (same `REPLICATE_API_TOKEN`, create → poll → URL). Exact class split can shift at implementation; the registry is the stable seam.
- `StudioModelRegistry` in `server/src/services/studio/`: slug → { replicateId, capabilities, costCentsPerCall, latencyHintSeconds, aspectRatios, defaults }. Auto-route table (cheapest capable) and pin validation live here.
- Results copied to GCS via `storageService.saveFromUrl`; served with signed URLs.

## Server work

- `server/src/services/studio/`: `StudioService.ts` (turn loop, reservation/refunds, validation, persistence), `StudioPolicyEngine.ts` (LLM request + decision validation), `StudioModelRegistry.ts`, `storage/FirestoreStudioProjectStore.ts` (project doc + turns subcollection + daily usage counters).
- Routes `server/src/routes/studio.routes.ts` at `/api/studio`, Firebase auth, Zod bodies: `POST /projects`, `GET /projects`, `GET /projects/:id`, `PATCH /projects/:id` (rename, pin model), `DELETE /projects/:id`, `POST /projects/:id/turns` (202 + turnId), `GET /projects/:id/turns/:turnId` (poll).
- DI: `server/src/config/services/studio.services.ts`; providers registered in `image-generation.services.ts` (null without `REPLICATE_API_TOKEN`). Run the Integration Test Gate (services.config touched).
- Feature flag `ENABLE_STUDIO` (default `true`); regenerate flag docs.
- No credit reservation anywhere — the spend cap above is the only economic control.

## Client work

- `client/src/features/studio/`:
  - `StudioPage.tsx` — route `/studio`, `NavRail` entry, `FeatureErrorBoundary`.
  - `components/`: `StudioThread`, `StudioComposer` (with `ModelPicker`), `ClarifyCard`, `ResultCard` (renders 1–4 images: a 2×2 grid for generate batches, a single image for edit/transform results — a 1-image turn is a first-class case, never a grid with blanks), `SuggestionRow`, `NegotiateCard`, `StudioPlane`, `ProjectList`.
  - `hooks/useStudioProject.ts` — reducer: thread, in-flight turn + polling, selection, pinned model.
  - `lib/computeStudioLayout.ts` — pure: turn results in (group sizes 1–4) → x/y groups out, chronological. Unit-tested for both sizes.
  - `api/studioApi.ts` + `api/schemas.ts` — Zod-validated fetch wrappers, including the turn-polling call.
- Canvas: `CanvasViewport` unchanged; click selects (ring). No dragging.
- Model slugs + capability types in `shared/` (client renders the picker from a server-provided roster; Replicate IDs never leave the server).

## Layout and control placement

Placement is part of the spec, not styling. Source: the owner's live Recraft session (screenshots 2026-07-24). Deviations only where noted, with reasons.

### Global frame

Three regions: slim full-width top bar; fixed-width left chat panel (~280–300px, not resizable in v1); fluid right canvas. Each region owns its own scroll. Never invert the left-chat / right-canvas split or turn either into a modal — both stay visible at once.

### Top bar (left → center → right)

- **Left:** app menu/logo + "Studio" label. No mode tabs (S-33) — don't invent filler.
- **Center:** project title with rename/switch dropdown, centered in full window width.
- **Right:** account avatar, right-anchored. The reference also shows zoom %, Share, credits here — all excluded (S-36, S-37); zoom lives on the canvas control. Keep the avatar right-anchored; don't recenter.

Observed correction: the reference's zoom % is in the top bar's right zone, not over the canvas. Studio keeps `CanvasViewport`'s pinned corner zoom control instead.

### Left chat panel — three bands

- **Band 1 — header** (pinned): menu icon far left, project title, **new-project action far right**. Not in the top bar, not in the composer.
- **Band 2 — thread** (scrolls, auto-scroll to newest): everything renders inline as cards — clarify cards, generate batches as a **2×2 grid** (selected image ringed), **edit results as a single image card**, negotiation cards, and the **pill-button suggestion row directly beneath its results**. Per-message regenerate/copy (v2) attach to their own message.
- **Band 3 — composer** (pinned bottom, bordered, two rows):
  - **Row A:** multiline "Ask anything" field; expand-field icon at the top-right corner of the text area (enhance-prompt icon excluded, S-10).
  - **Row B, left → right:** **Model picker** (Auto default — its reference slot) → _(settings slot, empty in v1)_ … flex gap … **attach** (returns when attachment ships, immediately left of send) → **send** (up arrow, filled, always right-most). Never move a surviving control into a removed neighbor's slot; close gaps with spacing.

**Settings button:** still dropped in v1 — Style/Palette/Count remain excluded as controls; aspect ratio comes from language. The slot (right of the model picker) is where generation controls return if ever needed.

### Right canvas

Fills its region; drag pans, wheel/pinch zooms; `CanvasViewport`'s pinned −/%/+ control. Turn results as chronological groups via `computeStudioLayout`. **No floating tool rail in v1** — the reference's rail holds editor tools we excluded (S-24–S-29); a one-icon rail reads as a broken clone. Reintroduce only at ≥3 real tools.

### Clean-removal rules

- No disabled stub buttons for excluded capabilities (unless a deliberate, correctly-slotted "coming soon").
- No empty zones, one-item popovers, or single-icon toolbars — collapse so absence reads intentional.
- Never re-slot surviving controls to fill gaps; preserve order, close with spacing.

## Recraft feature inventory — dispositions (S-1 to S-38)

| Spec        | Observed feature                                    | Studio disposition                                                                                                                    |
| ----------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| S-1         | Auto model routing                                  | v1 — Auto is the picker default; routes to the cheapest capable model via the registry.                                               |
| S-2         | Recraft tiers in picker with cost/time hints        | v1 — all four tiers in the picker, with **latency hints only** (no cost — no money shown in Studio).                                  |
| S-3         | Trending third-party models in picker               | v1 — Nano Banana 2 / 2 Lite / Pro, GPT Image 2 (see Model roster).                                                                    |
| S-4         | Provider/brand filter list in picker                | Excluded v1 — our roster is short enough to scan.                                                                                     |
| S-5         | Style control                                       | No UI control — style is prompt text; "Try a different style" suggestions cover it.                                                   |
| S-6         | Palette control                                     | No UI control — prompt text.                                                                                                          |
| S-7         | Aspect ratio control                                | No UI control — the LLM sets `aspectRatio` from language; server validates against the model's allowlist.                             |
| S-8         | Count control                                       | Fixed: 4 for generate, 1 for edit/transform.                                                                                          |
| S-9         | Chat composer with image/video toggle               | Composer v1; video toggle excluded (S-38).                                                                                            |
| S-10        | "Enhance prompt" button                             | Excluded — the LLM already rewrites the full prompt every turn.                                                                       |
| S-11        | Expand prompt field                                 | v1 polish.                                                                                                                            |
| S-12        | Attach reference image                              | v2 (near-term): edit-capable models accept `image_input`; upload to GCS, feed as source. Paperclip returns to its slot when it ships. |
| S-13        | Clarifying-question cards                           | v1 — behavior 1.                                                                                                                      |
| S-14        | Contextual suggestion buttons                       | v1 — behavior 3, including edit-type suggestions.                                                                                     |
| S-15        | Pick one image as working reference                 | v1 — behavior 6 (selection feeds `edit` directly; `generate` refinements seed from its `sourcePrompt`).                               |
| S-16        | "Thinking" indicator                                | v1 — behavior 8.                                                                                                                      |
| S-17        | Auto project title                                  | v1 — behavior 8.                                                                                                                      |
| S-18        | Regenerate / copy per message                       | v2 polish ("give me more options" covers regenerate).                                                                                 |
| S-19        | Pan/zoom infinite canvas                            | v1 — `CanvasViewport`.                                                                                                                |
| S-20        | Zoom-level control                                  | v1 — `CanvasViewport`'s pinned corner control (reference puts % in the top bar; deliberate deviation).                                |
| S-21        | Batches as spatial groups                           | v1 — `computeStudioLayout` (group sizes 1–4).                                                                                         |
| S-22        | Select/pointer tool                                 | v1 as click-to-select; no marquee.                                                                                                    |
| S-23        | Hand/pan tool                                       | v1 — background drag pans; no separate tool.                                                                                          |
| S-24 – S-28 | Shapes, mockup, frame, text, upload-to-canvas tools | Excluded — the canvas is a viewer, not an editor (computed layout, nothing spatial stored).                                           |
| S-29        | Undo/redo on canvas                                 | Excluded with the editor tools; the thread is the history.                                                                            |
| S-30        | Remove background                                   | v1 — `action: "transform"` → `recraft-remove-background` ($0.01, verified).                                                           |
| S-31        | Vector/SVG output                                   | v1 for SVG _generation_ (Vector models in the picker); vectorizing an existing image = `transform` → `recraft-vectorize`, v2.         |
| S-32        | Refinement carrying context across turns            | v1 — behaviors 4 and 6 (`basePrompt` + real edits).                                                                                   |
| S-33        | "AI chat" vs "Create" modes                         | Excluded — one mode.                                                                                                                  |
| S-34        | History panel                                       | v1 — `ProjectList`.                                                                                                                   |
| S-35        | Onboarding                                          | Excluded.                                                                                                                             |
| S-36        | Share                                               | Excluded v1.                                                                                                                          |
| S-37        | Credits/balance display                             | Excluded — no credits, no cost hints anywhere in Studio (ADR-0019 §7); the spend cap is server-side only.                             |
| S-38        | Video generation mode                               | Excluded — video is the main workspace's job.                                                                                         |

## Not in v1

- Attach-your-own image (S-12) — buildable now, first thing after v1
- Vectorize transform, per-message regenerate/copy, provider filter in the picker
- Sharing, "use as first frame" bridge, draggable canvas, streaming (polling covers v1)
- Reusing `client/src/PromptImprovementForm/` — its server route doesn't exist; leave it alone

## Milestones

Each ends with `npx tsc --noEmit`, eslint, and `npm run test:unit` green.

1. **Providers + registry + turns route, with the economic gates.** Both provider classes (mocked-Replicate unit tests), `StudioModelRegistry` (cheapest-capable Auto route table + pin validation + cost estimates + aspect-ratio allowlists — all unit-tested without an LLM), `studio_projects` store (subcollection turns + daily usage counters), async `/turns` with hardcoded always-generate policy. **M1 exit gates:** atomic spend reservation proven by a concurrent-submit test (two simultaneous turns cannot both pass a nearly-exhausted cap); refund-on-failure test; `sourceImageIds` referential validation; aspect-ratio fallback; all TBD prices/params confirmed against Replicate. Proof: real images from a Recraft tier AND an edit round-trip through Nano Banana 2, stored in GCS. Integration Test Gate.
2. **UI page.** Rail entry, chat panel, composer with model picker, canvas groups (sizes 1–4), turn polling, API layer. Verify in headed Chrome. Exit criterion: every composer and canvas control is in its reference slot per "Layout and control placement" — no orphaned stubs, empty popovers, or single-icon toolbars.
3. **Conversation logic.** `studio_turn` op, decision schema, system prompt (incl. roster capabilities), recorded fixtures; behaviors 1, 2, 3, 9 working.
4. **Editing + refinement flows.** `edit` end to end on the selected image, rejection flow (behavior 5), negotiation on incapable pins (behavior 7), remove-background transform (S-30), auto-title. **Fixture assertions include edit-vs-generate routing:** after selecting variant 3 — "make it bolder" → an `edit` sourcing variant 3; "more options" → a `generate` whose `basePrompt` derives from variant 3's `sourcePrompt`; "try a completely different concept" → a `generate` with a new direction, not an edit.
5. **Hardening.** Partial-batch rendering, stale-pin revert, project rename/delete/pin persistence, polish.

## Costs and risks

- Per-call prices: Recraft $0.04–$0.25, utilities $0.01, Nano Banana / GPT Image by resolution or quality (pinned to fixed v1 settings and priced at M1). The dollar cap (`STUDIO_DAILY_SPEND_CAP_CENTS`, default $5/user/day) bounds worst-case spend regardless of model mix; Auto's cheapest-capable rule keeps the default path on the cheap tiers.
- The questions/suggestions/routing quality is the product — M3/M4 are gated on fixture tests (including edit-vs-generate routing), with an LLM-judge eval later. `gpt-4o-mini` carries more judgment than before; the config is env-swappable per operation if fixtures show it fumbling.
- Second product loop beside the golden path: deliberate, recorded in ADR-0019.
