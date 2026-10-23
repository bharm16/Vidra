# Studio and the Live editor retire into /app

**Status:** Accepted and implemented — 2026-10-22 (owner: Bryce Harmon). Step 6 of the [unified creative space research](../research/2026-10-19-unified-creative-space.md). Supersedes [ADR-0019](0019-the-studio-standalone-conversational-image-workspace.md) decision 1 (Studio is its own surface), and with it decision 5's separate roster, registry and Auto routing and decision 6's turn orchestrator. Also retires the standalone page that [ADR-0017](0017-live-editor-is-its-own-plane-not-the-space.md) and [ADR-0018](0018-the-live-editor-page-is-the-generation-frame.md) describe. Those ADRs stay as written.

## Context

The 2026-10-19 research set one rule: modes are logic, not location. Choosing to make a picture, a clip or audio changes only what the selected capability profile governs. It never changes the route, the panels or the library. Studio broke that rule. It was a separate route with its own chat, infinite plane, model roster, language-model planner and projects, joined to `/app` by a **Use in a video** bridge. The standalone Live editor was a second place for sketching, joined by **Use this**. Sketch inside `/app` already covers it.

`/app` already holds Studio's other parts. Workflow profiles describe every model. Ask, Improve wording and Expand description are text actions in the same composer. Each request slot reserves against the same daily cap Studio used.

## Decision

1. **One place.** `/studio`, `/studio/*` and `/live-editor` replace themselves with `/app`. The Studio thread, plane, layout and project index are deleted, along with the Live editor page, their rail entries, and the **Use in a video** and **Use this** bridges. Sketch in `/app` keeps the realtime relay, frame reducer and constants it uses.
2. **Studio's models are workflow profiles.** Each Studio model is now an exact native Replicate profile, one per model and action: Recraft V4.1, V4.1 Vector, V4.1 Pro and V4.1 Pro Vector (make), and Nano Banana 2, 2 Lite and Pro and GPT Image 2 (make and edit). Each offers every input its public Replicate schema documents, so Studio's pinned resolution and quality become choices. Each has a spend ceiling sized to its most expensive offered setting.
3. **Auto is the model chip's Auto.** Studio's cheapest-capable routing and its six-way decision policy retire. The server adds no Auto resolution of its own; within each action, the new profiles are listed cheapest first.
4. **Background removal and vectorize are picture actions.** `remove-background` (Recraft Remove Background) and `vectorize-image` (Recraft Vectorize) take one picture and no words. They are reached only from a picture's buttons, a new composer place `{ kind: "result" }`.
5. **Vector output fails closed.** The workflow output path stores and verifies PNG, JPEG and WebP only. The three SVG profiles (Recraft V4.1 Vector, V4.1 Pro Vector and Vectorize) are listed as unavailable, with a reason, until SVG can be staged and verified. Their ceilings are in place, so enabling them later changes only availability.
6. **Records stay readable.** Studio projects and turns are not migrated or deleted. Their owner can still list, open and delete them through the remaining `GET`/`DELETE` routes under `/api/studio`. Reading a turn that a dead process left running still settles it from its own records, so its unspent cents are released exactly once. The closed origin set (`studio`, `studio-image`, `legacy-studio`) and the stored origin of a bridged project stay readable. Creating projects, running turns, pinning a model and attaching references are retired.
7. **The spend cap and ledger stay.** `STUDIO_DAILY_SPEND_CAP_CENTS`, the `studio_usage` counter, `StudioSpendLedger` and `StudioWorkflowSpendGuard` keep bounding every native request. The text operation keeps the name `studio_turn`, because that name is part of the text spend mapping hash. It now serves only Ask, Improve wording and Expand description.

## Consequences

- A model or action added to the catalog needs no client route. The client composer reads these profiles, so Studio's models need no Studio code.
- Saved `/studio` and `/live-editor` links open the owner's library. Pictures already sent from Studio or the Live editor are ordinary library imports.
- Vectorize offers no result button until SVG storage exists. Showing its verb then needs no other change.
- Nano Banana Pro's documented fallback to `bytedance/seedream-5` is a creator choice that is off by default. Vidra records the requested model as the producer; whether a fallback result can be told apart has not been verified.

## Considered alternatives

- **Keep Studio as a second space beside `/app`.** Rejected by the research's first rule. A separate route, roster and planner are the place-based pattern the owner rejected.
- **Keep Studio's language-model planner as an `/app` agent.** Rejected for now. If an agent is added later, it is a mode of the same composer and feed, not a page. The text actions already cover Ask and rewording.
- **Offer the vector models now and store SVG in Studio's old vector lane.** Rejected. That lane is outside workflow output verification, so a result could not become a verified media version. Failing closed keeps every offered model's result verifiable.
- **Delete Studio records.** Rejected. Retiring a surface never migrates or deletes stored records, and interrupted turns still need settlement against the cap.
