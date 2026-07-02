# Frame Verification — UI Integration Proposal

Status: proposal only. The FrameStage / gate UI is in flight elsewhere; this
document describes how frame verification should plug in once that work lands.
Nothing in this proposal has been implemented in the UI.

## What exists today (server + client plumbing, shipped)

- `POST /api/frame-verification` — canonical `ApiResponse` envelope.
  Request: `{ image: string, spans: [{ text, category, start?, end? }] }`
  (image is a URL or base64 data URI; categories are taxonomy ids from span
  labeling). Response data: `{ verdicts, model, durationMs }` where each
  verdict is `{ span, verdict: present|absent|uncertain, confidence, evidence? }`.
- `client/src/features/frame-verification/api/` — `verifyFrame()` wrapper with
  Zod wire validation (validation boundary; shapes match the server DTO).
- Eval: `scripts/evaluation/frame-verification/` — constructed ground-truth set
  and a gate (`frame-verification-eval.ts`, present-class precision ≥ 0.85,
  recall ≥ 0.75).

## Where it belongs in the product

Frame verification closes the authoring loop after first-frame generation:
the user writes a prompt, spans are labeled, a frame is generated — today the
user must eyeball whether the frame honored the prompt. Verification turns
that into per-span signal rendered on the highlights they already have.

### Proposed integration points

1. **Span highlight adornment (primary).** After a frame preview completes,
   call `verifyFrame` with the current labeled spans and the frame URL. Render
   verdicts as a subtle state on existing span highlights:
   - `absent` → attention treatment (e.g. dashed underline in the span's
     category color) + tooltip carrying `evidence`.
   - `present` → no change (avoid rewarding noise; the default is success).
   - `uncertain` → no visual change; available in the details panel only.
     This reuses the existing span-highlighting surface — no new panel, and it
     follows UX rule 2 (tools persist; nothing closes).

2. **Frame gate assist (secondary, once FrameStage lands).** The in-flight
   frame gate decides whether a frame is good enough to proceed to motion.
   Verification supplies an objective input: surface "N of M prompt elements
   verified" next to the gate's accept/retry affordances, with the absent
   spans listed by their span text. The gate stays a user decision —
   verification informs, it does not auto-reject (UX rule 1: browsing is
   read-only, actions are explicit).

3. **Retry loop hint.** On regenerate, absent spans from the previous attempt
   are the natural candidates for click-to-enhance. A "strengthen this"
   affordance on an absent span can open the existing suggestions popover for
   that span. This composes with enhancement rather than adding a new flow.

### Data flow

```
FramePreview (existing)          span-highlighting (existing)
        │ frame URL                        │ spans + categories
        └──────────────┬────────────────---┘
                       ▼
     features/frame-verification/api/verifyFrame()
                       ▼
        useFrameVerification() hook (new, feature-scoped;
        useReducer: idle → verifying → verified/error)
                       ▼
        verdictsBySpan → highlight adornments + gate summary
```

### Behavioral constraints

- Verification is read-only: verdicts never mutate the prompt or spans.
- Non-visual categories (`audio.*`, `technical.*`, `camera.movement`) return
  `uncertain` by design — the UI must not present them as failures.
- One verification call per generated frame (verdicts are deterministic:
  temperature 0 + seeded); cache by frame hash if re-render loops appear.
- Failure of the verification call must never block the preview flow — it is
  an enhancement layer, not a gate dependency.

### Cost

One vision call (gpt-4o-mini) per generated frame, ~1–2s and fractions of a
cent — cheap next to the Flux/video generation call it accompanies.

### Suggested first slice

Wire `useFrameVerification` into the preview completion path behind a client
feature flag, rendering only the absent-span underline + tooltip. Gate
summary and retry hints follow once FrameStage stabilizes.
