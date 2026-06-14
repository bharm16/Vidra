# Vidra is an authoring tool for non-expert creators; generation is commodity; the multi-shot/consistency play is deferred

**Status:** accepted (2026-06-08) · amended 2026-06-10 — the n=5 validation
study was cancelled by owner decision; expansion-first is adopted on builder
conviction plus the dry-run/live-loop evidence (n=1, facilitator-judged), not
on the pre-registered thresholds. The falsification signal moves from the
study to live usage. The frozen-stack boundaries below still stand.

Vidra had grown to 23 server service domains and 14 client features with **no
canonical product definition** — the root `CONTEXT.md` and `docs/agents/domain.md`
both pointed at a product description that had never been written. The code had
quietly voted for a different product than the one the docs described. This ADR
records the definition we resolved, so the scope stops drifting.

**The decision.** Vidra takes a **non-expert creator** (someone stuck at "I don't
know what to type," _not_ the expert stuck on multi-shot coherence — see
[`CONTEXT.md`](../../CONTEXT.md)) from a one-line idea to **one good video clip**.
The clip is the deliverable; the **authoring intelligence** that produces
generation-ready image-to-video (I2V) inputs is the moat; **generation is a
commodity** the creator could otherwise get by pasting a frame into Kling.

This was a real trade-off. The most _impressive_ wall — multi-shot visual
consistency (`continuity`/`convergence`) — was **rejected as the first bet**: it is
the labs' battlefield (a model-layer capability that commoditizes under us), it is
the most infrastructure-heavy thing on the board, and it serves the expert, not the
creator we chose. We picked the authoring wall instead because it is the asset we
already have, the labs are not building it, and it is the only candidate we can
validate this week without new code.

## What this freezes (frozen ≠ deleted — all code stays in the repo)

- **Generation economics** — `credits`, `payment`, and the video-job resilience
  layer (DLQ reprocessor, sweeper, reconciler, retention, polling, idempotency,
  heartbeat). These exist only because Vidra would _own and bill_ generation.
  During validation, generation runs as a **dumb, hard-capped passthrough** on our
  dime; none of this stack is maintained.
- **The expert wall** — `continuity`, `convergence`, `sequence-editor`,
  `keyframe-generation`, `storyboard-frame-planner`, `face-swap`, face embedding,
  CLIP gates, `image-observation`. The validation unit is a **single shot**, so the
  entire multi-shot apparatus is out of scope.
- **Premature** — `model-intelligence` (v1 hardcodes the best model rather than
  recommending one), `quality-feedback`, and the PostHog measurement program (with
  ~5 test creators you observe directly).

## What stays active (the product)

`ai-model` (the `aiService` engine), `prompt-optimization` (repurposed as the
**expansion** engine), `image-generation` (the first frame), `i2v-motion-ideas` /
`video-prompt-analysis` (motion), plus `sessions`/`assets`/`storage`/`firestore`/
`cache` plumbing and thin `observability`. `span-labeling` and `enhancement` are
**kept but demoted** to a secondary refine-after-draft layer.

## The one belief recorded as a hypothesis, not a decision

Whether the non-expert arrives with a **blank page** (needs _expansion_: idea →
first-frame prompt) or a **rough draft** (needs _refinement_: the span-labeling +
click-to-enhance interaction we already built) is **unvalidated** — we have zero
users. We are betting **expansion-first** and centering v1 on it, but this is the
**primary thing the validation must answer**, not a settled fact. If real creators
arrive with drafts, span-labeling returns to center and this bet flips.

> Validation protocol (pre-registered 2026-06-09):
> [`docs/research/expansion-study-protocol.md`](../research/expansion-study-protocol.md)

## Consequences / things to know

- This **re-prioritizes the CLAUDE.md Domain Glossary**, which presents
  `Generation`/`Continuity`/`Convergence` as co-equal pillars. They are frozen, not
  deleted; treat them as dormant until this ADR is revisited.
- [ADR-0001](0001-span-labeling-extraction-strategy.md) (span-labeling's eval rigor)
  **still stands** — but span-labeling is now a _secondary_ surface for v1, not the
  centerpiece. Its golden-set gates remain valid; they are just not on the critical
  path of the current bet.
- "Frozen" is a maintenance posture, not a deletion plan. Each frozen stack can be
  thawed if validation earns the right (e.g. owning generation margin once demand is
  proven; the consistency play once creators reliably get one good shot).
