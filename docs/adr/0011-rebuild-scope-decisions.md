# Rebuild scope decisions: one living text, derived stage, persisted takes

**Status:** accepted (2026-07-05)

Scoping the ADR-0010 workspace rebuild ([build scope](../design/2026-07-05-untangle-build-scope.md))
surfaced six decisions that shape contracts beyond any single milestone. Recorded here so
the build can't quietly re-litigate them.

**D1 — Session text model: `input` is the immutable original; `output` is the one living
text.** The creator's typed one-liner is preserved untouched as `SessionPrompt.input`
(it feeds the "Your words" restore chip); the expanded-and-edited description lives in
`output` and is the only text the UI ever shows or dispatches. No storage migration; the
one-text-box contract is a UI truth, not a schema rewrite.

**D2 — Workspace stage is derived, never persisted.** S0–S6 is reconstructed on restore
from persisted artifacts (description present? frame? clip? run in flight?), not stored as
an enum. A stored stage can lie after a crash; artifacts can't.

**D3 — The Gemini video→image prompt transformer leaves the golden path.** Unedited text
renders its picture prompt deterministically from the expansion's structured slots
(`renderPreviewPrompt`); hand-edited text goes to the picture model verbatim (a quality
tradeoff, never a hidden rewrite). The LLM transformer is deleted once a caller grep
confirms nothing else needs it; the storyboard path already bypasses it.

**D4 — Takes are server-persisted generation records.** Idea-box pictures get promoted
into the same record shape as video generations (which already store their paired
`prompt`), so every take survives reload with its text, and `startFrame` stops being a
localStorage-only fact. "Use this take" restores media and paired text together.

**D5 — Streaming expansion uses NDJSON**, as a sibling endpoint to `/api/optimize`,
following the existing `/api/llm/label-spans/stream` precedent. No SSE.

**D6 — Motion vocabulary lives in the suggestions path.** Camera/action span clicks serve
motion alternatives through the existing enhancement/suggestions route; `MotionIdeaService`
becomes its backend or vocabulary source. No standalone motion panel, ever — a panel is a
second text surface wearing a costume.

Consequence: the build order and gates in the scope doc are binding — golden-path e2e
green at every milestone boundary, and M2b ships with the truth regression (dispatched
payload === visible text).
