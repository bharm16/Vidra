# Sub-project B2 — Imperative + One-Shot scene_summary — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift suggestions `scene_summary` emission rate from 39.7%/31.0% (qwen/gemini, measured this session) toward ≥70% on qwen via imperative + one-shot prompt engineering. Provider-agnostic mechanism.

**Architecture:** 4 sequential commits. (1) Prompt builder imperative + one-shot for both regular and custom paths. (2) Engine custom-request path captures sceneSummary from siblings. (3) Variant presets in scripts/synthetic/variants.ts for matrix verification. (4) Matrix runs (suggestions + optimize) + measurement.md reordering-log entries.

**Tech Stack:** TypeScript (ESM), Vitest, Sub-project E's matrix infrastructure.

**Spec:** [`docs/superpowers/specs/2026-05-22-suggestions-imperative-scene-summary-design.md`](../specs/2026-05-22-suggestions-imperative-scene-summary-design.md)

---

## Task 1: Prompt builder imperative + one-shot (TDD)

**Files:**

- Modify: `server/src/services/enhancement/v2/EnhancementV2PromptBuilder.ts`
- Create: `server/src/services/enhancement/v2/__tests__/EnhancementV2PromptBuilder.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `EnhancementV2PromptBuilder.test.ts` with 4 tests asserting:

1. `buildPrompt` output contains `MUST emit \`scene_summary\` FIRST`
2. `buildPrompt` output contains the one-shot example marker (e.g., `EXAMPLE` + `"scene_summary": "Dusk aerial`)
3. `buildCustomPrompt` output contains the same imperative phrase
4. `buildCustomPrompt` output contains the one-shot example

- [ ] **Step 2: Run RED**

`npx vitest run --config config/test/vitest.unit.config.js server/src/services/enhancement/v2/__tests__/EnhancementV2PromptBuilder.test.ts`

Expected: 4 failures.

- [ ] **Step 3: Implement**

In `EnhancementV2PromptBuilder.ts`:

(a) In `buildPrompt`, between the CONTEXT block and RULES block (after the existing `context.focusGuidance` line, around line 60), insert:

```ts
      "",
      "EXAMPLE (shape only — do not copy the words):",
      'Input: full_prompt="Wide aerial shot at dusk", highlighted="aerial", category=camera.angle',
      "Output:",
      "{",
      '  "scene_summary": "Dusk aerial wide shot — elevated viewpoint, fading natural light, broad scene context.",',
      '  "suggestions": [',
      '    {"text": "high-angle drone", "category": "camera.angle", "explanation": "preserves elevated viewpoint"},',
      '    {"text": "bird\'s-eye", "category": "camera.angle", "explanation": "stronger top-down framing"}',
      "  ]",
      "}",
```

(b) Replace the existing scene_summary rule (around line 62) with:

```ts
      "- You MUST emit `scene_summary` FIRST. Begin your response with the literal text `{\"scene_summary\":` — the `suggestions` array MAY NOT appear before `scene_summary`. This is a hard requirement, not a preference.",
```

(c) Replace the format-reinforcement line (around line 77) with:

```ts
      "Return EXACTLY this JSON shape — `scene_summary` MUST be the first key:",
```

(d) In `buildCustomPrompt`, mirror the changes from (a), (b), (c) in the corresponding spots. The custom-request path doesn't currently have scene_summary instructions, so the imperative phrase + example + format line all get inserted fresh.

- [ ] **Step 4: Run GREEN**

`npx vitest run --config config/test/vitest.unit.config.js server/src/services/enhancement/v2/__tests__/`

Expected: all PASS.

- [ ] **Step 5: Type-check + lint**

`npx tsc --noEmit && npx eslint --config config/lint/eslint.config.js server/src/services/enhancement/v2/EnhancementV2PromptBuilder.ts --quiet`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/enhancement/v2/EnhancementV2PromptBuilder.ts server/src/services/enhancement/v2/__tests__/EnhancementV2PromptBuilder.test.ts
```

Commit message:

```
feat(suggestions): imperative + one-shot scene_summary prompt for both regular and custom paths

Sub-project B2. Provider-agnostic fix for scene_summary emission rates
measured this session (qwen 39.7%, gemini 31.0% — both below the 70%
target). The previous declarative "BEFORE the suggestions array, emit
scene_summary..." is replaced with an imperative MUST + starts-with
constraint + hard-requirement reframing. A one-shot EXAMPLE block
demonstrates the {scene_summary, suggestions} shape using a different
category from typical highlights (camera.angle) to avoid biasing
output content.

Both buildPrompt (regular) and buildCustomPrompt (custom-request)
paths receive the change. Custom-request previously had no
scene_summary instruction at all (Sub-project B's explicit deferral
that's now in scope).

Four TDD tests assert the imperative phrase and one-shot example
appear in both paths.

~+100-140 tokens per call. Expected emission lift: qwen 39.7% → ≥70%.
Matrix verification follows in Task 4.
```

---

## Task 2: Engine custom-request path captures sceneSummary

**Files:**

- Modify: `server/src/services/enhancement/v2/EnhancementV2Engine.ts`
- Modify: `server/src/services/enhancement/v2/__tests__/EnhancementV2Engine.test.ts`

- [ ] **Step 1: Read the current custom-request branch**

Run: `grep -n "custom\|Custom" server/src/services/enhancement/v2/EnhancementV2Engine.ts | head -10`

Identify the function that handles the custom-request path (around line 273, where the comment says "Custom-request path doesn't carry scene_summary"). Read 30 lines around it.

- [ ] **Step 2: Read the regular-path sceneSummary capture for reference**

Around line 322, the regular path does something like:

```ts
const rawSceneSummary = captured.siblings?.scene_summary;
const sceneSummary =
  typeof rawSceneSummary === "string" && rawSceneSummary.trim()
    ? rawSceneSummary.trim()
    : null;
```

The custom-request path needs to mirror this.

- [ ] **Step 3: Write the failing test**

Add to `EnhancementV2Engine.test.ts` (extend the custom-request describe block, or add a new one):

```ts
it("custom-request path captures scene_summary from siblings when present", async () => {
  // Use the existing test scaffolding pattern. Mock the AI service to
  // return a response with sceneSummary in siblings. Assert the engine
  // result's sceneSummary field reflects the captured value.
  // ... matches the pattern in existing custom-request tests
});

it("custom-request path returns sceneSummary: null when siblings is absent (back-compat)", async () => {
  // Assert null fallback still works when LLM doesn't emit the field
});
```

(Exact test code depends on the file's existing mock patterns. Read 50 lines around the existing custom-request tests to match the convention before writing.)

- [ ] **Step 4: Run RED**

`npx vitest run --config config/test/vitest.unit.config.js server/src/services/enhancement/v2/__tests__/EnhancementV2Engine.test.ts`

Expected: 2 failures on the new tests.

- [ ] **Step 5: Implement**

In `EnhancementV2Engine.ts` custom-request branch:

- Use `StructuredOutputEnforcer.enforceJSON` with `captureSiblings: ["scene_summary"]` (same pattern as the regular path).
- After unwrapping, extract `captured.siblings?.scene_summary`, normalize to `string | null`, return in the engine result.
- Replace the `sceneSummary: null` literal at the relevant return with the captured value.

- [ ] **Step 6: Run GREEN**

`npx vitest run --config config/test/vitest.unit.config.js server/src/services/enhancement/v2/__tests__/`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/enhancement/v2/EnhancementV2Engine.ts server/src/services/enhancement/v2/__tests__/EnhancementV2Engine.test.ts
```

Commit message:

```
feat(suggestions): custom-request path captures scene_summary from siblings

Sub-project B2 task 2. The custom-request path previously returned
sceneSummary: null unconditionally (explicit Sub-project B deferral).
With Task 1 adding the imperative + one-shot to buildCustomPrompt,
the LLM now emits scene_summary on the custom path too — but the
engine was discarding it.

Mirror the regular path's captureSiblings + normalize pattern.
Result: custom-request responses now include the same scene-anchoring
context as regular requests, enabling the same downstream usage.

Two TDD tests cover the capture (siblings present) and the null
fallback (siblings absent — back-compat).
```

---

## Task 3: Variant presets for matrix verification

**Files:**

- Modify: `scripts/synthetic/variants.ts`

- [ ] **Step 1: Read the existing variant declarations**

Run: `grep -n "VARIANT_PRESETS\|export\|name:" scripts/synthetic/variants.ts | head -25`

Identify the existing `qwen`, `gemini`, `openai` presets and their env-var sets.

- [ ] **Step 2: Add the two new presets**

Add `qwen-with-imperative` (mirrors `qwen` env, distinct tag) and `openai-with-camera-lens` (mirrors `openai` env, distinct tag). Both reuse existing env-var sets — they distinguish via the `--variant-tag` value that's already threaded through the harness.

If the file's preset structure includes a whitelist or enum, update those too.

- [ ] **Step 3: Type-check**

`npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 4: Smoke-test the orchestrator recognizes the new tags**

`npm run synthetic:matrix -- --list-variants 2>&1 | grep -E "qwen-with-imperative|openai-with-camera-lens"`

Expected: both names appear.

- [ ] **Step 5: Commit**

```bash
git add scripts/synthetic/variants.ts
```

Commit message:

```
feat(synthetic): add qwen-with-imperative + openai-with-camera-lens variant presets

Sub-project B2 task 3. Variant presets needed for matrix verification:

- qwen-with-imperative: pairs with qwen for measuring scene_summary
  emission lift (Sub-project B2).
- openai-with-camera-lens: pairs with openai for measuring optimize
  mean recovery against Sub-project D's 17.35 baseline (Sub-project C
  verification, deferred from C and bundled here).

Both reuse existing env-var sets; the distinguishing dimension is the
modelVariant tag stamped onto emitted events. Matrix orchestrator's
subprocess isolation per variant handles cleanly.
```

---

## Task 4: Matrix verification runs + reordering-log entries

**Files:**

- Modify: `docs/superpowers/programs/measurement.md`

- [ ] **Step 1: Run the suggestions matrix**

```bash
npm run synthetic:matrix -- --only suggestions --variants qwen,qwen-with-imperative
```

Expected: 2 variants × ~60 events each, ~2-3 minutes, ~$0.40 total.

- [ ] **Step 2: Score the events**

```bash
npm run judge:run -- --surface suggestions
```

Expected: scores all the new events. ~1-2 minutes.

- [ ] **Step 3: Generate the comparison report**

```bash
npm run synthetic:report-matrix -- --only suggestions --since 1h
```

Expected: side-by-side qwen vs qwen-with-imperative totals + dimension breakdowns.

- [ ] **Step 4: Query emission rate by variant**

Reuse a HogQL query from this session (saved in commit history if needed) to compute:

```sql
SELECT
  properties.modelVariant AS variant,
  count() AS total,
  countIf(properties.sceneSummary IS NOT NULL AND properties.sceneSummary != '') AS with_summary,
  round(countIf(properties.sceneSummary IS NOT NULL AND properties.sceneSummary != '') / count() * 100, 1) AS pct
FROM events
WHERE event = 'suggestions.completed'
  AND timestamp > now() - INTERVAL 1 HOUR
GROUP BY properties.modelVariant
```

Record the emission percentages.

- [ ] **Step 5: Run the optimize matrix (Sub-project C verification)**

```bash
npm run synthetic:matrix -- --only optimize --variants openai,openai-with-camera-lens
npm run judge:run -- --surface optimize
npm run synthetic:report-matrix -- --only optimize --since 1h
```

Record the optimize means.

- [ ] **Step 6: Update Measurement Program reordering log**

Append to `docs/superpowers/programs/measurement.md` (after the most recent entry):

```markdown
- **2026-05-22 (Sub-project B2):** Imperative + one-shot scene*summary shipped. The Sub-project B mechanism (forcing scene_summary first via prompt) was capped at ~36-41% emission across providers per the post-Sub-project-B diagnostic this session (qwen 39.7%, gemini 31.0% — refuting handoff's "Gemini reliable" framing). Investigation confirmed schema-enforcement is closed for both providers: Qwen via Groq doesn't support json_schema (GroqQwenAdapter.ts:261), and Gemini's responseSchema is validation-based, not grammar-constrained (required fields are advisory). Solution is prompt-engineering, provider-agnostic: imperative MUST + starts-with literal constraint + hard-requirement reframing + one-shot EXAMPLE block demonstrating the {scene_summary, suggestions} shape. Both buildPrompt and buildCustomPrompt receive the change (custom-request path previously had no scene_summary instruction at all — explicit Sub-project B deferral now reversed). EnhancementV2Engine custom-request branch now captures sceneSummary from siblings rather than returning null. **Matrix verification (qwen vs qwen-with-imperative):** emission rate <REPLACE_WITH_NUMBERS>, relevance dimension <REPLACE>. **Sub-project C matrix verification (openai vs openai-with-camera-lens, deferred from C and bundled here):** optimize total <REPLACE>, brevityDiscipline <REPLACE>. Out of scope (separate sub-projects): B3 (template-bound canned scaffolds — different root cause in V2CandidateScorer policy), F1 (Gemini JSON parse flakiness — same Gemini-responseSchema-advisory root cause but the remediation is in JsonExtractor/repair logic, not the prompt layer). New principle encoded: \_provider capability flags can be misleading. ProviderDetector lists Gemini's strictJsonSchema as true (it supports responseSchema natively) but the runtime enforcement is advisory in practice. Trust empirical emission-rate measurement before assuming schema-level controls work; the way to verify schema-enforcement strength is a 2-variant matrix on a non-trivial field, not the capability flag.*
```

Replace `<REPLACE...>` placeholders with the actual numbers from Steps 3-5.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/programs/measurement.md
```

Commit message:

```
docs(measurement): Sub-project B2 reordering-log entry — emission lift + C verification

Closes Sub-project B2. Records the matrix verification results for
both B2 (qwen emission) and Sub-project C (optimize camera_lens
verification, deferred from C and bundled here).
```

- [ ] **Step 8: Clean up — remove the diagnostic temp file (if still present)**

Run: `ls scripts/quality-judge/calibration/_diagnose-emission.tmp.ts 2>/dev/null && rm scripts/quality-judge/calibration/_diagnose-emission.tmp.ts && git add -u`

The diagnostic was removed earlier this session but if it reappears, remove again. No-op otherwise.

---

## Self-Review

**Spec coverage:**

- Spec § 1 row "Scope" → Tasks 1 + 2
- Spec § 1 row "Custom-request path extension" → Task 2
- Spec § 1 row "One-shot example category" → Task 1 step 3(a)
- Spec § 1 row "Imperative phrasing" → Task 1 step 3(b)
- Spec § 1 row "Format-reinforcement line" → Task 1 step 3(c)
- Spec § 1 row "Verification" → Task 4 steps 1-4
- Spec § 1 row "Sub-project C matrix verification" → Task 4 step 5
- Spec § 5 success criteria → All 4 tasks together cover all 9 success criteria bullets

**Placeholder scan:** Task 4's `<REPLACE_WITH_NUMBERS>` are intentional — recorded at runtime in Step 6.

**Type consistency:** No new types; reuses existing engine return shape.
