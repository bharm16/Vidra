# Sub-project B3 — Suggestions Diversity (Templated-Policy Scaffolds) — Design Spec

**Date:** 2026-05-22
**Program:** Sub-project B3 of the [Measurement Program](../programs/measurement.md). Surfaced by Sub-project D's calibration labeling subagent (suggestions mean 19.15 with a bimodal cluster at 14 driven by template-bound canned scaffolds).
**Estimate:** 1-2 days of brainstorm + design + per-policy implementation + matrix verification.
**Branch:** off `main`
**Feature flag:** none.

---

## 0. Why

Sub-project D's calibration labeling subagent surfaced a distinct failure mode in suggestions — different from Sub-project B/B2's scene_summary emission gap:

> _"The dominant failure mode was **template-bound suggestion generation** — a handful of canned scaffolds (six 'slow dolly {direction}' variants, six 'soft {source}' lights, the {tight,shallow} × {focus, rack focus, bokeh} matrix) that the system reaches for whenever the highlighted span shares a category, even when the original phrase has very different character (aerial drone vs. dolly; bright midday sun vs. soft candlelight; handheld vs. dolly). These collapse `diversity` and `qualityRange` to 1–2 even when `categoryFidelity` and `plausibility` stay at 5."_

Investigation of `server/src/services/enhancement/v2/policies/slotPolicies.ts` confirmed the mechanism: **8 of the engine's policies use `mode: "templated"`**:

| Policy               | Templates / slots                                                          | Observation                                                                           |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `camera.movement`    | `{tempo} {technique} {direction}` × 7 techniques × 5 directions × 3 tempos | **Labeled offender — "slow dolly forward/backward/lateral/upward/downward" pattern.** |
| `camera.lens`        | (not labeled but same pattern)                                             | Risk: similar enumeration                                                             |
| `camera.focus`       | `{tight,shallow} × {focus, rack focus, bokeh}`                             | **Labeled offender — the focus matrix.**                                              |
| `lighting.source`    | `{quality} {source}` (soft/hard × candle/sun/window/...)                   | **Labeled offender — "soft {source}" pattern.**                                       |
| `lighting.quality`   | `{quality} {source}` variants                                              | Similar pattern, not labeled                                                          |
| `lighting.colorTemp` | enumerated colors                                                          | Less prone to monotony but still templated                                            |
| `style.filmStock`    | Named stocks                                                               | Less prone; named outputs are inherently diverse                                      |
| `style.colorGrade`   | Named grades                                                               | Less prone                                                                            |

The three explicitly-labeled policies (camera.movement, camera.focus, lighting.source) are the primary B3 targets.

---

## 1. Why this isn't a quick fix

The templated mode does important structural work that a naive `mode: "guided_llm"` flip would lose:

- **Constraint enforcement.** `camera.movement`'s `invalidCombinations` array forbids `static {forward,backward,lateral,upward,downward}` (a static shot has no direction by definition) and `handheld locked-off frame` (contradiction). The templated generator structurally never produces these. An LLM relying on prose rules would emit them occasionally.

- **Test coverage assumes templated mode.** `EnhancementV2Engine.test.ts:103` asserts `execution.debug.mode === "templated"` and `modelCallCount === 0` for camera.movement. Flipping the mode invalidates the test; rewriting the test requires deciding what behavior to assert under guided_llm (variant emission, constraint compliance via scoring filters, etc.).

- **Cost asymmetry.** Templated mode produces N candidates in CPU; guided_llm requires 1 LLM call per request. At ~$0.001/call across the suggestions surface, this is real-money cost — not vetoing, but worth weighing against the diversity gain.

- **The mechanism IS the policy.** Templated mode isn't a bug — it's a design choice optimizing for low latency + structural compliance over diversity. The diversity collapse only happens for the labeled categories because their template-slot space is too small relative to `targetCount: 6`.

---

## 2. Proposed approach — three options

### Option A: Expand template variety (lowest risk)

Per affected policy, add more templates of structurally-different shapes:

For `camera.movement`:

- Current 3 templates: movement-direction, movement-qualifier, static-frame
- Add: "named-shot" template (`{cinematicShotName}` — "Dutch tilt", "Steadicam push-in", "crane reveal", "vertigo dolly zoom", "POV float")
- Add: "tempo-driven" template (`{tempo} {technique} {framing}` — "languid handheld close-up")

Result: 6 picks span more templates, less repetition within a single response.

**Risk:** low — additive, no constraint logic changes
**Cost:** policy-file edits; no LLM calls
**Expected diversity lift:** modest (~30% more variation within 6 picks)

### Option B: Hybrid templated + guided diversification (medium risk)

Two-stage generation:

1. Templated mode generates 12 candidates (2× targetCount) with structural compliance
2. Guided_llm pass picks 6 with explicit diversity constraint: "select 6 from the candidates below such that no two share more than one template slot value; prefer wider tonal range"

**Risk:** medium — new control flow in EnhancementV2Engine
**Cost:** +1 LLM call per request for the affected categories
**Expected diversity lift:** high — semantic diversification

### Option C: Full mode flip with rescued constraints (highest risk)

Change `mode: "templated"` → `mode: "guided_llm"` for the 3 worst-offender policies. The LLM has B2's imperative + one-shot scene_summary mechanism, so scene-anchored diversity is in play.

To recover structural constraints lost from templated mode:

- Add a `validatesConstraint` field to SlotPolicy: a pure-function predicate over a candidate (e.g., reject `(technique=static, direction!=null)`)
- V2CandidateScorer enforces these in the existing accept/reject loop

**Risk:** high — biggest blast radius, deletes existing tests
**Cost:** +1 LLM call per request
**Expected diversity lift:** highest

### Recommendation

**Option A first** as a single sub-project. Ship the template expansion for the 3 worst-offender policies + matrix verification. If the diversity lift is insufficient, escalate to Option B for those specific policies.

Option C is appealing but its blast radius is too large for a single sub-project. The constraint-validation system would itself need a brainstorm + spec.

---

## 3. Out of scope

- ❌ Modes other than templated. `enumerated` mode (date ranges, frame rates) is genuinely a small finite set; diversity isn't a concern there. `guided_llm` already has B2's imperative + one-shot mechanism.
- ❌ The 5 templated policies NOT labeled by Sub-project D (camera.lens, lighting.quality, lighting.colorTemp, style.filmStock, style.colorGrade). They may have the same pattern but weren't surfaced; opportunistically include them ONLY if they share a fix shape with the labeled three.
- ❌ Rebuilding the templated generator itself. It works; the issue is the template DEFINITIONS not the rendering.
- ❌ Diversifying within a single suggestion's content (that's the existing scorer's diversity dimension). B3 is about diversifying ACROSS the 6 picks in a single response.

---

## 4. Code annotations (shipped with this spec)

The three named policies (`camera.movement`, `camera.focus`, `lighting.source`) carry an inline TODO comment referencing this spec so any future operator reading the policy registry sees the B3 link.

---

## 5. Success criteria (when implementation ships)

- [ ] One of A/B/C selected via brainstorm with user
- [ ] Implementation lands per spec
- [ ] Matrix verification: suggestions surface, `qwen-current` vs `qwen-with-b3` variant
- [ ] Diversity dimension lift: target ≥ +0.5 on the affected categories
- [ ] No regression on categoryFidelity, plausibility, or qualityRange
- [ ] Reordering log entry records the chosen option, the lift, and any cost increase

---

## 6. Self-review

- [x] Scope assessed: full implementation is non-trivial; design spec + code annotation is the right ship from this session.
- [x] Risk surfaced: structural constraint enforcement, test coverage, cost asymmetry.
- [x] Three concrete options with risk/cost/lift trade-offs.
- [x] Recommended option (A) backed by reasoning.
- [x] Out-of-scope items explicit.
