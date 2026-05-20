# Prompt Pipeline Improvement Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the outcome of Vidra's prompt-improvement pipeline (Optimization, Model Intelligence, Span Labeling, Enhancement) by aligning runtime/eval gates, sharing span-extraction across domains, eliminating post-spend failure modes, and consolidating model identity — landing visible quality wins first, then doing the architectural moves that make them stick.

**Architecture:** Phased campaign organized by user-visible outcome impact. Each phase produces working, testable software on its own; we re-detail each phase from a sketch into TDD tasks immediately before executing it, so prior-phase learnings inform later-phase plans. Cross-domain abstractions (`PromptSpanProvider`, taxonomy-versioned cache namespace, model catalog) emerge from concrete needs, not upfront speculation.

**Tech Stack:** Node 20 ESM, TypeScript via tsx, Express, Vitest, Pino, Zod. Server services use constructor DI registered in `server/src/config/services/`. LLM access is routed exclusively through `aiService`. Shared types live in `shared/`. Cross-layer changes follow the anti-corruption transform pattern documented in root `CLAUDE.md`.

---

## Campaign Overview

| Phase                                  | Steps                | Outcome theme                                                                                                                   | Expected files | Integration gate? |
| -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------- |
| **P1 — Quick wins**                    | O3 + CR-Option-B     | Eliminate post-spend 500 (markdown leak), park dormant feature with explicit dormancy comment                                   | ~6             | no                |
| **P2 — Recommendation quality**        | O2 + O1 + O4         | Recommendations stop ignoring spans; confidence labels become honest; Runway becomes recommendable                              | ~12-18         | no                |
| **P3 — Cache architecture**            | O5 + O6              | `PromptSpanProvider` shared port; `getOrCompute` single-flight on base cache; Optimization stops bypassing span cache           | ~15-20         | **yes (DI)**      |
| **P4 — Eval/runtime alignment**        | O7                   | Eval `intentPreservation` reuses runtime `IntentLockService.validateIntentPreservation` so eval scores agree with runtime gates | ~5             | no                |
| **P5 — V1 dead-pipeline removal**      | V1 delete            | Removes ~30-50KB of misleading "pipeline" abstraction in Enhancement; prerequisite for P6                                       | ~10-12         | **yes (DI)**      |
| **P6 — Custom suggestions through V2** | O8                   | `getCustomSuggestions` joins V2 slot-policy engine — quality parity with regular suggestions                                    | ~6-10          | no                |
| **P7 — Lint-repair surfacing**         | O9                   | Rename `slots/` → `lint-repair/`; consider extending the reroll loop into a real quality-gate                                   | ~10            | no                |
| **P8 — Wizard removal**                | Video Concept delete | Pure hygiene; removes ~1500 LOC of unreachable namespace                                                                        | ~30+           | **yes (DI)**      |

### Sequencing rationale

1. **P1 first** because both items are small, safe, and ship visible value (fewer 500s, less reader confusion). Calibrates execution rhythm before bigger work.
2. **P2 next** because O1+O4 are the largest _user-visible quality_ lift in the campaign. We do them while the audit insights are fresh.
3. **P3 before P4-P7** because the `PromptSpanProvider` port is the load-bearing abstraction — once it exists, the rest of the work composes cleanly through it.
4. **P5 immediately before P6** because P6 (custom suggestions through V2) is held back by the V1 pipeline's lingering presence in `CacheKeyFactory.engineVersion: "v1" | "v2"`.
5. **P7 after V2 unification** because the lint-repair loop touches the same code path P6 just consolidated.
6. **P8 last** because Wizard removal is pure hygiene with no outcome dependency — it's safe to defer indefinitely if priorities shift.

---

## Phase 1: Quick wins

### Task 1.1: Sanitize-then-warn for non-length lint errors (O3)

**Goal:** `PromptLintGateService.enforce` currently throws a `500-shaped` error after a successful, paid LLM call when forbidden patterns (stray markdown heading, "Variation N" artifact) survive the sanitize pass. The length-error branch already logs-and-returns; this task extends that same shape to non-length errors so users get a delivered prompt instead of a server error.

**Why this matters (outcome):** Eliminates a class of user-visible 500s on the optimize endpoint. The shipped prompt may have minor formatting residue, but the user sees output rather than failure — and the structured warn log lets us monitor leak rates.

**Files:**

- Modify: `server/src/services/prompt-optimization/services/PromptLintGateService.ts:156-158`
- Test (new): `server/src/services/prompt-optimization/services/__tests__/PromptLintGateService.nonLengthErrors.regression.test.ts`
- Audit callers: any code under `server/src/services/prompt-optimization/` that calls `enforce()` and catches/expects the throw

#### Steps

- [ ] **Step 1: Audit caller blast radius**

Run:

```bash
rg -n "lintGate(\.|Service\.)?enforce\(" server/src/ --type=ts
rg -n "promptLintGate(\.|Service\.)?enforce\(" server/src/ --type=ts
```

Expected: A small number of call sites (almost certainly inside `prompt-optimization/workflows/` and `PromptOptimizationService`). For each, verify whether the caller's `try { ... lintGate.enforce(...) ... }` relies on the thrown error to fall through to a different path. If any caller depends on the throw, note it — those will need to switch to checking `result.lint.ok` after this change.

If the audit reveals callers that meaningfully depend on the throw (e.g., to abort an outer flow), STOP and revisit the design before continuing. If callers just propagate the throw to a 500, the change is safe.

- [ ] **Step 2: Write the failing regression test**

Create `server/src/services/prompt-optimization/services/__tests__/PromptLintGateService.nonLengthErrors.regression.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PromptLintGateService } from "../PromptLintGateService";

describe("PromptLintGateService.enforce — sanitize-then-warn for non-length errors (regression)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT throw when a residual markdown heading survives sanitize", () => {
    const service = new PromptLintGateService();
    // Sanitize handles **TECHNICAL SPECS**/**ALTERNATIVE APPROACHES** banner
    // markers, but a stray `# Heading` line is NOT cut. Without this fix
    // such input causes a post-spend 500.
    const promptWithStrayHeading =
      "A cinematic dolly shot of a neon alley at dusk.\n\n# Final Notes\n\nFog rolls in from the harbor.";

    expect(() =>
      service.enforce({ prompt: promptWithStrayHeading }),
    ).not.toThrow();

    const result = service.enforce({ prompt: promptWithStrayHeading });
    expect(result.lint.ok).toBe(false);
    expect(result.lint.errors).toContain("Contains markdown heading syntax.");
    expect(result.prompt.length).toBeGreaterThan(0);
  });

  it("does NOT throw when a 'Variation N' artifact survives sanitize", () => {
    const service = new PromptLintGateService();
    const promptWithVariation =
      "A cinematic dolly shot Variation 2 of the city at dusk, fog drifting low.";

    expect(() =>
      service.enforce({ prompt: promptWithVariation }),
    ).not.toThrow();

    const result = service.enforce({ prompt: promptWithVariation });
    expect(result.lint.ok).toBe(false);
    expect(
      result.lint.errors.some((e) =>
        e.toLowerCase().includes("variation artifact"),
      ),
    ).toBe(true);
  });

  it("returns lint.ok=true and does NOT throw on a clean prompt", () => {
    const service = new PromptLintGateService();
    const cleanPrompt =
      "A cinematic dolly shot of a neon alley at dusk, fog rolling in from the harbor.";

    const result = service.enforce({ prompt: cleanPrompt });
    expect(result.lint.ok).toBe(true);
    expect(result.lint.errors).toEqual([]);
  });

  it("preserves the existing length-only branch behavior (no throw on over-budget)", () => {
    const service = new PromptLintGateService();
    // 200+ word prompt against a model whose max is well below
    const longPrompt = Array.from({ length: 250 }, (_, i) => `word${i}`).join(
      " ",
    );

    expect(() =>
      service.enforce({ prompt: longPrompt, modelId: "kling-2.1" }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Run test — verify it fails on the throw branches**

Run:

```bash
npx vitest run server/src/services/prompt-optimization/services/__tests__/PromptLintGateService.nonLengthErrors.regression.test.ts --config config/test/vitest.config.js
```

Expected: First two tests FAIL with `Error: Prompt lint gate failed: ...`. Third and fourth tests PASS (clean prompt + length-only path already works).

If the third or fourth test fails, STOP — there's a deeper issue. The first two failing as expected confirms the bug is real and the test catches it.

- [ ] **Step 4: Implement the fix in `PromptLintGateService.ts`**

Replace lines 156-158 of `server/src/services/prompt-optimization/services/PromptLintGateService.ts`:

```ts
if (!lint.ok) {
  throw new Error(`Prompt lint gate failed: ${lint.errors.join(" ")}`);
}
```

With:

```ts
if (!lint.ok) {
  this.log.warn(
    "Prompt lint gate detected non-length issues after sanitize; returning sanitized prompt to avoid post-spend failure.",
    {
      modelId: params.modelId
        ? (resolvePromptModelId(params.modelId) ?? params.modelId)
        : null,
      wordCount: lint.wordCount,
      errors: lint.errors,
    },
  );
}
```

**Symmetry note:** the length-only branch above (lines 139-154) already does this same shape (log + return without throwing). This change makes non-length errors symmetric. The unified return at line 160-164 is unchanged — both branches now fall through to it.

- [ ] **Step 5: Run regression test — verify it passes**

Run:

```bash
npx vitest run server/src/services/prompt-optimization/services/__tests__/PromptLintGateService.nonLengthErrors.regression.test.ts --config config/test/vitest.config.js
```

Expected: All four tests PASS.

- [ ] **Step 6: Run the full prompt-optimization unit suite**

Run:

```bash
npx vitest run server/src/services/prompt-optimization/ --config config/test/vitest.config.js
```

Expected: All tests pass. If any existing test fails because it depended on the throw, update it to assert `result.lint.ok === false` instead of `expect(...).toThrow()`. Surface any non-trivial caller adjustments in the commit message.

- [ ] **Step 7: Pre-commit gate**

Run in parallel:

```bash
npx tsc --noEmit
npx eslint --config config/lint/eslint.config.js server/src/services/prompt-optimization/services/PromptLintGateService.ts server/src/services/prompt-optimization/services/__tests__/PromptLintGateService.nonLengthErrors.regression.test.ts --quiet
npm run test:unit
```

Expected: tsc exits 0, eslint exits 0, test:unit passes. Note: this is a `fix:` commit, so the pre-commit hook will require a regression test in the commit — Step 2 satisfies that.

- [ ] **Step 8: Commit**

```bash
git add server/src/services/prompt-optimization/services/PromptLintGateService.ts server/src/services/prompt-optimization/services/__tests__/PromptLintGateService.nonLengthErrors.regression.test.ts
git commit -m "$(cat <<'EOF'
fix(optimize): sanitize-then-warn for non-length lint errors

Previously, PromptLintGateService.enforce threw a 500-shaped error
after a successful (paid) LLM call when forbidden patterns like stray
markdown headings or "Variation N" artifacts survived the sanitize
pass. The length-only branch already logs-and-returns; this extends
that same shape to non-length errors.

Users now receive a sanitized prompt (with possibly minor residual
formatting) instead of a server error. The structured warn log lets
us monitor leak rates without paging on a recoverable issue.

Regression test asserts non-throw on the two known forbidden patterns
that bypass the sanitize cut markers.
EOF
)"
```

---

### Task 1.2: Constitutional Review parking comments (CR-Option-B)

**Goal:** The constitutional-review workflow is well-architected dormant code (no production caller sets `useConstitutionalAI: true`). Rather than delete it, document the dormancy at both source files so future readers don't re-discover the "is this used?" question.

**Why this matters (outcome):** Reduces cognitive load on every code review of `prompt-optimization/`. Keeps the option to enable the feature later without rebuilding it from scratch.

**Files:**

- Modify: `server/src/services/prompt-optimization/workflows/constitutionalReview.ts:1` (prepend file-level comment)
- Modify: `server/src/config/OptimizationConfig.ts:122` (extend the existing inline comment)

#### Steps

- [ ] **Step 1: Prepend dormancy doc to `constitutionalReview.ts`**

Open `server/src/services/prompt-optimization/workflows/constitutionalReview.ts`. Currently line 1 is `import { ConstitutionalAI } from "@utils/ConstitutionalAI";`. Insert before line 1:

```ts
/**
 * Reserved feature: constitutional-AI second-pass review.
 *
 * Status: dormant. No production caller sets `useConstitutionalAI: true` —
 * the optimize route handler does not forward the field, the client API
 * does not send it, and no UI control exposes it. This workflow is
 * reachable only from tests.
 *
 * To re-enable:
 *  1. Set `useConstitutionalAI: true` on the OptimizationRequest (likely
 *     from `routes/optimize/handlers/optimize.ts`).
 *  2. Tune `OptimizationConfig.constitutionalAI.sampleRate` for partial
 *     rollout (1 = 100%, lower for sampling).
 *  3. Add observability counters around `applyConstitutionalAI` (reviewed,
 *     revised, no-change).
 *
 * If this dormancy persists, consider deletion — the standalone
 * `ConstitutionalAI` util at `server/src/utils/ConstitutionalAI.ts` has no
 * other consumer.
 */
```

- [ ] **Step 2: Extend the dormancy note in `OptimizationConfig.ts`**

In `server/src/config/OptimizationConfig.ts`, replace lines 122-125:

```ts
  // Constitutional AI sampling (1 = always, 0 = never)
  constitutionalAI: {
    sampleRate: 1,
  } as ConstitutionalAIConfig,
```

With:

```ts
  // Constitutional AI sampling (1 = always, 0 = never).
  // Dormant: no caller sets `useConstitutionalAI: true`.
  // See server/src/services/prompt-optimization/workflows/constitutionalReview.ts for the re-enable steps.
  constitutionalAI: {
    sampleRate: 1,
  } as ConstitutionalAIConfig,
```

- [ ] **Step 3: Pre-commit gate (light — doc-only change)**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0. (No lint or test runs needed for comment-only changes; pre-commit hook handles the rest.)

- [ ] **Step 4: Commit**

```bash
git add server/src/services/prompt-optimization/workflows/constitutionalReview.ts server/src/config/OptimizationConfig.ts
git commit -m "$(cat <<'EOF'
docs(optimize): mark constitutional-review as dormant

The constitutional-AI second-pass workflow is well-architected but has
no production caller — the route handler does not forward
`useConstitutionalAI`, the client never sends it, and no UI exposes it.

Rather than delete (Option A) or wire it up (Option C), this commit
documents the dormancy at both source files (the workflow file and
the config block) so future readers don't re-discover the "is this
used?" question. Re-enable steps and the related orphan utility are
called out explicitly.
EOF
)"
```

---

## Phase 2: Recommendation quality (sketched — re-detail before executing)

### Goal

Make Model Intelligence's output measurably better by:

- Inverting span-vs-regex priority so spans become the primary feature source (O1)
- Plumbing `requirements.confidenceScore` through to the recommendation confidence ladder so "high confidence" stops being a lie on low-signal inputs (O4)
- Reconciling the missing Runway entry — likely by reframing `ModelCapabilityRegistry` to key on `CanonicalPromptModelId` instead of `VideoModelId` (O2 expanded scope)

### Files (preliminary)

- `server/src/services/model-intelligence/services/PromptRequirementsService.ts` (O1: invert span → regex priority)
- `server/src/services/model-intelligence/services/ModelScoringService.ts` (O4: lift rubric to data + confidence-aware scoring)
- `server/src/services/model-intelligence/services/ModelCapabilityRegistry.ts` (O2: reframe ID space, add Runway)
- `server/src/services/model-intelligence/ModelIntelligenceService.ts` (O4: confidence ladder uses requirements.confidenceScore)
- `server/src/services/model-intelligence/services/RecommendationExplainerService.ts` (O4: stop discarding `_requirements`)
- Tests across the above
- `scripts/evaluation/golden-set-relaxed-f1.ts` (validate the recommendation accuracy improvement)

### Risks / open questions

- **O2 ID-space reframing is bigger than 1-line.** Need to read `ModelIntelligenceService` to see how callers translate prompt → generation IDs before lookup. May need to introduce a separate `PromptModelCapabilityRegistry` keyed on `CanonicalPromptModelId`, leaving the existing `ModelCapabilityRegistry` for VideoModelId callers (if any).
- **Eval coverage:** O1 changes the recommendation engine's feature inputs. Run `npm run eval:golden-set` before and after; if recommendations get worse, the regex fallback wasn't the noise we thought it was.
- **Confidence plumbing:** decide whether `requirements.confidenceScore` _caps_ the recommendation confidence or contributes to the calculation. Capping is simpler and safer.

### Re-detail trigger

Before starting P2 execution, read `ModelIntelligenceService.ts`, `PromptRequirementsService.ts`, `ModelScoringService.ts` in full. Capture the exact scoring rubric structure to decide if O4 lifts it to JSON config or just rewires consumption.

---

## Phase 3: Cache architecture (sketched — re-detail before executing)

### Goal

Promote `PromptSpanProvider` to a shared port so Optimization, Model Intelligence, and request-batching middleware all consume span labeling through one DI token (O5). Promote `getOrCompute` single-flight from `SpanLabelingCacheService` into the base `CacheService` so Optimization and Enhancement caches stop firing duplicate LLM calls under burst load (O6).

### Files (preliminary)

- Create: `server/src/llm/span-labeling/ports/PromptSpanProvider.ts` (move from `model-intelligence/ports/`)
- Create: `server/src/llm/span-labeling/adapters/CachedPromptSpanProvider.ts` (DI adapter)
- Create: `server/src/config/services/span-labeling.services.ts` (new DI registration file)
- Modify: `server/src/services/cache/CacheService.ts` (add `getOrCompute` method)
- Modify: `server/src/services/cache/SpanLabelingCacheService.ts` (delegate to base or thin)
- Modify: `server/src/services/prompt-optimization/evaluation/integrations/spanLabeling.ts` (consume via port, drop hardcoded `templateVersion: "v3.0"`)
- Modify: `server/src/middleware/requestBatching.ts` (consume via port)
- Modify: `server/src/config/services/model-intelligence.services.ts` (drop the inline lambda registration of `PromptSpanProvider`)
- Tests across the above

### Risks / open questions

- **DI registration order:** the new `span-labeling.services.ts` must register before any consumer. Verify in `services.config.ts`.
- **Cache key version coordination:** O6 is a good moment to introduce a `TAXONOMY_VERSION`-aware namespace prefix (Theme 3 from the audit). Decide whether to do that here or carve it into its own task.
- **Integration gate triggers** because we're modifying DI surface. Plan for `PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js` between commits.

### Re-detail trigger

Before P3, read the full `SpanLabelingCacheService.getOrCompute` implementation to understand the single-flight contract (Promise dedup, error propagation, cache write semantics). Decide on the base-class API shape before any code.

---

## Phase 4: Eval/runtime alignment for intent preservation (sketched)

### Goal

Make `evaluation/dimensions/intentPreservation.ts` reuse `IntentLockService.validateIntentPreservation` for the deterministic check, falling back to the LLM judge only when the deterministic gate already failed. Closes the trap where a runtime improvement scores worse in eval because the two systems use different definitions of "preserved."

### Files (preliminary)

- Modify: `server/src/services/prompt-optimization/evaluation/dimensions/intentPreservation.ts`
- Tests: a parity test that asserts the eval and runtime gates produce the same boolean for representative cases

### Risks / open questions

- **API shape mismatch:** `IntentLockService.validateIntentPreservation` may not accept the eval-time inputs as-is. May need a thin adapter.
- **Eval baseline impact:** running the relaxed-F1 golden set after this change will give a different score for past optimizations whose intent-preservation was previously LLM-judged. That's expected — we want the eval to _agree_ with the runtime gate going forward, not preserve historical scores.

### Re-detail trigger

Before P4, read `IntentLockService.validateIntentPreservation` in full and the current eval implementation. Decide whether the LLM judge fallback stays or gets dropped.

---

## Phase 5: V1 dead-pipeline removal (sketched)

### Goal

Remove the `SuggestionGenerationService` + `SuggestionProcessingService` + `FallbackRegenerationService` + `ContrastiveDiversityEnforcer` "pipeline" from Enhancement. These are constructed on every request but reachable only through tests. Their continued presence blocks P6 (custom suggestions through V2) because `CacheKeyFactory.engineVersion: "v1" | "v2"` exists only to support them.

### Files (preliminary)

- Delete: `server/src/services/enhancement/services/SuggestionGenerationService.ts`
- Delete: `server/src/services/enhancement/services/SuggestionProcessingService.ts` (any still-needed top-up logic gets folded into `EnhancementV2Engine`)
- Delete: `server/src/services/enhancement/services/FallbackRegenerationService.ts`
- Delete: `server/src/services/enhancement/services/ContrastiveDiversityEnforcer.ts`
- Modify: `server/src/services/enhancement/EnhancementService.ts` (drop the dead `pipeline` field + constructor wiring)
- Modify: `server/src/services/enhancement/utils/CacheKeyFactory.ts` (drop `engineVersion: "v1" | "v2"` union)
- Modify: `server/src/config/services/enhancement.services.ts` (drop V1 sub-service registrations)
- Tests across the above

### Risks / open questions

- **Top-up logic in `SuggestionProcessingService.ts:191-241`** may still be a real requirement — verify it's either dead or gets folded into V2 cleanly.
- **DI graph integrity:** integration test gate triggers because `enhancement.services.ts` is in the DI surface.

### Re-detail trigger

Before P5, run `rg -n "pipeline\.suggestionGeneration|pipeline\.suggestionProcessing" server/src/` to confirm zero hits. Read `EnhancementService.ts:140-159` and `:643-647` to see exactly what's wired.

---

## Phase 6: Custom suggestions through V2 (sketched)

### Goal

`getCustomSuggestions` in `EnhancementService` currently bypasses both the V2 engine and the (now-deleted) V1 pipeline — it's a third execution path with different temperature, schema, and cache key construction. Unify it through the V2 slot-policy engine so custom suggestions get the same diversity/scoring treatment as regular suggestions.

### Files (preliminary)

- Modify: `server/src/services/enhancement/EnhancementService.ts:535-641` (`getCustomSuggestions` method)
- Modify: `server/src/services/enhancement/v2/EnhancementV2Engine.ts` (accept a custom-prompt parameter or expose a custom-policy path)
- Possibly create: `server/src/services/enhancement/v2/policies/CustomPolicy.ts` (if custom requests warrant their own slot policy)
- Tests across the above

### Risks / open questions

- **Different schema:** `getCustomSuggestionSchema` vs `getEnhancementSchema` — confirm they can converge or whether V2 needs a schema-per-request hook.
- **Different cache keying:** the audit noted `getCustomSuggestions` hashes the full input vs `CacheKeyFactory` truncates. After P5 lands, this should already be unified — verify.

### Re-detail trigger

Before P6, re-read `EnhancementService.getCustomSuggestions:535-641` and `EnhancementV2Engine.ts` after P5's deletions land.

---

## Phase 7: Lint-repair surfacing (sketched)

### Goal

Rename `prompt-optimization/strategies/video/slots/` to `lint-repair/` (or fold into VideoStrategy) so the actual layering — normalize → lint → [reroll | LLM-repair] — is visible. Optionally extend the reroll loop into a real quality-gate (e.g., score threshold, configurable fan-out).

### Files (preliminary)

- Rename: `server/src/services/prompt-optimization/strategies/video/slots/` → `lint-repair/`
- Modify: `server/src/services/prompt-optimization/strategies/VideoStrategy.ts:477-568` (orchestration becomes explicit)
- Tests across the above

### Risks / open questions

- **Behavior preservation vs improvement:** decide whether this phase is purely renaming-for-clarity (no behavior change) or also extends the loop. If extending, run eval before/after.

### Re-detail trigger

Before P7, read `VideoStrategy.resolveStructuredPrompt` and the three slot files (`normalizeSlots`, `scoreSlots`, `rerollSlots`) in full.

---

## Phase 8: Wizard removal (sketched)

### Goal

Delete the entire `server/src/services/video-concept/` tree and its routes/DI registrations. The audit confirmed no client UI consumes `/api/video/*` and the `VideoConceptApi.ts` referenced in `CLAUDE.md` does not exist. Pure hygiene; deferred to last because no outcome work depends on it.

### Files (preliminary)

- Delete: `server/src/services/video-concept/` (entire directory)
- Delete: `server/src/routes/video.routes.ts` and `server/src/routes/video/` (entire directory)
- Delete: `server/src/config/schemas/videoSchemas.ts` (if exclusively video-concept)
- Modify: `server/src/config/services/enhancement.services.ts:160-251` (drop seven DI registrations + `videoConceptService` aggregator)
- Modify: `server/src/config/routes/api.registration.ts` (drop the mount guard)
- Modify: integration tests that exercise the namespace
- Modify: `client/src/features/...` (remove the ~10 stale "Reference: VideoConceptBuilder pattern" comments — find via `rg "VideoConceptBuilder"`)
- Modify: `CLAUDE.md` (remove `services/VideoConceptApi.ts` from the route map)
- Special case: `SceneChangeDetectionService` lives under `video-concept/` but is consumed by Enhancement — it must be MOVED to `services/enhancement/` (or sibling `scene-detection/`), not deleted

### Risks / open questions

- **`SceneChangeDetectionService` move is non-trivial.** It must land in the same commit as the deletion or its consumers break.
- **Integration gate triggers** because `enhancement.services.ts` is in the DI surface.

### Re-detail trigger

Before P8, run `rg -n "video-concept|VideoConceptBuilder|videoConceptService" server/src/ client/src/` to map the full surface. Treat anything outside the deletion targets as a "this needs to keep working" signal.

---

## Self-Review Checklist

**Spec coverage:**

- [x] O3 → Task 1.1 (Phase 1)
- [x] CR-Option-B → Task 1.2 (Phase 1)
- [x] O2 → moved to Phase 2 (with rationale)
- [x] O1 → Phase 2
- [x] O4 → Phase 2
- [x] O5 → Phase 3
- [x] O6 → Phase 3
- [x] O7 → Phase 4
- [x] V1 delete → Phase 5
- [x] O8 → Phase 6
- [x] O9 → Phase 7
- [x] Wizard delete → Phase 8

**Placeholder scan:**

- Phase 1 tasks contain full code blocks for tests and edits — no "TBD" or "implement appropriate handling" patterns.
- Phases 2-8 are intentionally sketches with explicit "Re-detail trigger" gates — they do NOT contain code blocks because they will be re-detailed before execution. This is per the campaign sequencing strategy, not a placeholder failure.

**Type consistency:**

- `PromptLintEnforcementResult` shape used in Step 4 matches the type defined at `PromptLintGateService.ts:61-65` — `{ prompt, lint, repaired }` confirmed.
- `resolvePromptModelId` import is already present at line 3 of the file — the new code reuses it.
- `this.log` is typed as `pino.Logger` via the `logger.child(...)` call — `.warn(message, context)` matches the existing `.error(message, undefined, context)` pattern in this file (length-only branch). Note the slight signature difference (`error` takes an Error second arg; `warn` takes context directly). Step 4's code uses the correct `warn` signature.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-prompt-pipeline-improvement-campaign.md`.**

Two execution options:

1. **Inline Execution (recommended for this campaign)** — Execute tasks in this session using `superpowers:executing-plans`, with checkpoints between phases for review. Suits the "implement all steps in the order you see fit" delegation while preserving review checkpoints between phases.

2. **Subagent-Driven** — Dispatch a fresh subagent per task with two-stage review. Higher overhead per task but fully isolated context; better suited for very long phases.

**Recommendation:** Inline for P1 (small, fast feedback), then re-decide before P2.
