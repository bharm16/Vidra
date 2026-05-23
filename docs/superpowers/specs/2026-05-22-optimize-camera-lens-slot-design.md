# Sub-project C — Optimize `camera_lens` slot (root-cause fix) — Design Spec

**Date:** 2026-05-22
**Program:** Sub-project C of the [Measurement Program](../programs/measurement.md). Targets the dominant optimize failure mode surfaced by Sub-project D's calibration labeling: the `"<focal-length> lens at,"` fragment that appeared in ~50% of labeled entries.
**Estimate:** ~1.5-2 days
**Branch:** off `main`
**Feature flag:** none — schema additions are backwards-compatible (new field optional in all schemas).

---

## 0. Why

Sub-project D's labeling of 20 stratified post-cutoff optimize outputs (2026-05-22) surfaced a dominant failure mode: the optimizer emits a lens specification but truncates before the f-stop number, leaving a fragment that breaks the surrounding sentence. Examples from the labeled sample: `"Shot with a 50mm lens at, creating a shallow depth of field"`, `"captured with an anamorphic lens at. An abstract..."`. The labeler quote: _"the optimizer consistently emits a lens spec but truncates before the f-stop number"_. Mean Claude-vs-rubric humanScore dropped to 17.35/25 vs. the spec's 22+ target.

The root cause is a **schema/template duplication**:

- `videoPromptOptimizationTemplate.ts` instructs the LLM to put `Camera behavior + angle + lens + aperture` into the `camera_move` slot (lines 341, 518) with few-shot examples in the format `"28mm lens at f/11"` (lines 61, 96, 134, 172).
- `videoPromptRenderer.ts` independently emits its own hardcoded aperture phrasing via `focusFromFraming()`, appending strings like `"with deep focus (f/11-f/16)"` to the camera sentence regardless of what the LLM produced.
- When both fire, output reads `"The camera uses 28mm lens at f/11 ... with deep focus (f/11-f/16)"` — duplicate aperture mentions.
- The LLM appears to compensate by omitting the f-stop number from its own slot value, producing `"28mm lens at"` to avoid the duplication it senses is coming.
- The renderer concatenates this fragment with subsequent sentence parts, surfacing as `"...lens at, ..."` or `"...lens at."` in the rendered output.

The fix is to **eliminate the duplication by separating the concerns**: a dedicated `camera_lens` slot that the LLM fills with focal-length + aperture, and a renderer that suppresses its hardcoded `focusFromFraming` aperture phrasing when the LLM-provided slot is present.

---

## 1. Locked architectural decisions

| Decision                                     | Choice                                                                                                                                                                                                                                                                       | Reason                                                                                                                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                                        | Schema redesign: add `camera_lens: string \| null` slot; split lens/aperture out of `camera_move`. Renderer suppresses `focusFromFraming` hardcoded aperture when `camera_lens` is present. Linter validates `camera_lens` is well-formed when non-null. TDD at every layer. | The "lens at" fragment is the dominant failure mode (50%+ of entries). Tighter fixes (lint+reroll for orphan fragments only) treat symptoms; the schema fix removes the root cause for this AND prevents the class of bugs that share the pattern. |
| Tag-soup tails in `style` slot               | OUT OF SCOPE — separate sub-project (C2)                                                                                                                                                                                                                                     | Different root cause (LLM dumping comma-separated descriptor lists into a single slot). User confirmed scope split.                                                                                                                                |
| Mid-sentence terminal truncations            | OUT OF SCOPE — separate sub-project (C3)                                                                                                                                                                                                                                     | Likely max_tokens-related (current 4000). Independent of the schema fix; benefits from honest baseline first.                                                                                                                                      |
| `camera_lens` optional vs. required          | Optional (`string \| null`)                                                                                                                                                                                                                                                  | Some prompts genuinely don't specify lens preference (e.g., short documentary prompts). Forcing non-null would push the LLM toward fabricating lens specs. Renderer falls back to existing `focusFromFraming` when null.                           |
| Duplication elimination strategy             | When `camera_lens` is non-null, renderer omits its hardcoded `focusFromFraming` aperture phrase entirely. When null, renderer keeps current behavior.                                                                                                                        | Single source of truth principle. The LLM-provided lens is more semantically precise than the framing-based default. Back-compat preserved when slot is absent.                                                                                    |
| Few-shot example update                      | All 4 examples in `VIDEO_FEW_SHOT_EXAMPLES` split `"camera"` field into `"camera_move"` (movement only) + `"camera_lens"` (lens+aperture)                                                                                                                                    | Few-shot examples are the strongest signal for output format. Splitting them in the examples forces the LLM to learn the new slot boundary.                                                                                                        |
| Linter approach                              | Use existing `isQualityVideoPromptLintError` mechanism (line 46-56 of VideoStrategy.ts triggers reroll). Lint rule: non-null `camera_lens` must contain either `"f/"` (aperture) OR end in `"mm"`/`"prime"`/`"lens"` (focal length).                                         | Reuses the existing reroll path — no new control flow. Reroll attempts 3 on quality errors per VideoStrategy line 533.                                                                                                                             |
| Schema change in Groq fallback `looseSchema` | Add `camera_lens` to the `required` array — wait, no: explicitly NOT in `required` because slot is optional                                                                                                                                                                  | Required-but-null is a footgun in JSON schema. Keep it optional and rely on the prompt instruction.                                                                                                                                                |
| Telemetry / measurement                      | No new event fields. Measurement happens via the existing `optimize.completed` event property `outputPrompt` (the rendered text). Sub-project E's matrix tooling can compare openai/openai-with-camera-lens variants.                                                        | Sub-project E already provides cross-variant comparison infrastructure. No new instrumentation needed.                                                                                                                                             |
| TDD discipline                               | RED-GREEN-REFACTOR at every layer: linter test (RED), implement; renderer test (RED), implement; schema factory test, etc. Per CLAUDE.md commit protocol.                                                                                                                    | Touching 7 source files + 3 test files; without TDD the test surface gets skipped.                                                                                                                                                                 |
| Backwards-compat in Groq schemas             | Two providers' schemas updated symmetrically. Existing optimize.completed events (no `camera_lens` field) remain valid against the new schema (optional field).                                                                                                              | Production-data compatibility. PostHog historical events should still parse.                                                                                                                                                                       |

---

## 2. What changes

### `server/src/services/prompt-optimization/strategies/videoPromptTypes.ts`

Add to `VideoPromptSlots` interface:

```ts
camera_lens?: string | null;
```

Update `normalizeShotFraming` and any related helper if it iterates slot keys (audit during implementation).

### `server/src/services/prompt-optimization/strategies/videoPromptOptimizationTemplate.ts`

- Update slot-description line 341 (and duplicate at line 518). Replace:

  ```ts
  "camera": "Camera behavior + angle + lens + aperture. (Examples: 'Wide shot on 16mm with deep focus f/11' OR 'Close-up on 85mm with shallow focus f/1.8'). MATCH APERTURE TO SHOT TYPE."
  ```

  With:

  ```ts
  "camera_move": "Single camera movement — dolly, tracking, pan, tilt, handheld, steadicam, static, zoom, crane, jib, orbit, push, pull, arc. 3-8 words. Do NOT include lens or aperture here."
  "camera_lens": "Focal length plus aperture, e.g. '28mm at f/11', 'anamorphic 50mm at f/2.8', '85mm prime at f/1.8'. Match aperture to shot type: Wide=f/8-f/11, Medium=f/2.8-f/4, Close-up=f/1.4-f/2.0. Null is allowed when no specific lens preference."
  ```

- Update all 4 few-shot examples (lines 61, 96, 134, 172):

  Before: `camera: "Wide tracking shot, low angle, 28mm lens at f/11"`
  After: `camera_move: "Wide tracking shot, low angle"` + `camera_lens: "28mm at f/11"`

  (Note: `low angle` already overlaps with `camera_angle` slot — audit during implementation to ensure few-shot examples don't double-specify angle.)

### `server/src/utils/provider/SchemaFactory.ts`

- `getVideoOptimizationSchema()` returns provider-specific schemas. For both OpenAI strict and Groq variants, add `camera_lens: { type: ["string", "null"] }` (or equivalent — verify the project's actual nullable-string convention via existing slots like `subject`).
- OpenAI strict mode: include in `properties` AND `required` array per OpenAI's strict-mode requirement (all properties must be in required, nullable handled via type union). Verify via running tests.
- Groq json_object simplified schema: optional, properties-only.

### `server/src/services/prompt-optimization/strategies/VideoStrategy.ts`

- `_fallbackOptimization` `looseSchema` (line 311-327): add `"camera_lens"` to the `required` array (or omit if Groq supports optional; verify).

### `server/src/services/prompt-optimization/strategies/videoPromptRenderer.ts`

- Modify `renderMainVideoPrompt`:

  Current sentence2 (lines 251-274):

  ```ts
  const sentence2Parts: string[] = [];
  if (cameraMove) {
    sentence2Parts.push(`The camera uses ${cameraMove}${anglePhrase ? ` ${anglePhrase}` : ""}`);
  } else if (anglePhrase) {
    sentence2Parts.push(`The camera holds ${anglePhrase}`);
  }
  if (focus) {
    if (focus === "deep focus") {
      sentence2Parts.push("with deep focus (f/11-f/16) to keep background detail readable");
    } ...
  }
  ```

  New:

  ```ts
  const cameraLens = clean(slots.camera_lens);
  const sentence2Parts: string[] = [];
  if (cameraMove) {
    sentence2Parts.push(
      `The camera uses ${cameraMove}${anglePhrase ? ` ${anglePhrase}` : ""}`,
    );
  } else if (anglePhrase) {
    sentence2Parts.push(`The camera holds ${anglePhrase}`);
  }
  if (cameraLens) {
    sentence2Parts.push(`on ${cameraLens}`);
  } else if (focus) {
    // Renderer-side fallback only when LLM omitted lens info
    if (focus === "deep focus")
      sentence2Parts.push(
        "with deep focus (f/11-f/16) to keep background detail readable",
      );
    else if (focus === "shallow depth of field")
      sentence2Parts.push(
        "with shallow depth of field (f/1.8-f/2.8) to isolate the main subject",
      );
    else
      sentence2Parts.push(
        "with selective focus (f/4-f/5.6) to guide attention to the main action",
      );
  }
  ```

  Apply same change to `renderCompactVideoPrompt` and `renderPreviewPrompt` if their composition includes focus/lens.

### `server/src/services/prompt-optimization/strategies/videoPromptLinter.ts`

- Add validation in `lintVideoPromptSlots`:

  ```ts
  const cameraLens =
    typeof slots.camera_lens === "string" ? slots.camera_lens.trim() : null;
  if (cameraLens) {
    const wellFormed =
      cameraLens.includes("f/") ||
      /(?:mm|prime|lens|anamorphic|telephoto|wide-angle|macro)\b/i.test(
        cameraLens,
      );
    if (!wellFormed) {
      errors.push(
        '`camera_lens` must contain aperture ("f/X") or focal-length unit (mm/prime/lens); avoid orphaned-preposition fragments.',
      );
    }
    const wordCount = cameraLens.split(/\s+/).filter(Boolean).length;
    if (wordCount > 12) {
      errors.push(
        "`camera_lens` is too long; keep to a single focal-length+aperture phrase.",
      );
    }
  }
  ```

  Caveat: the existing code uses regex inside the linter file already (line 246 `validMovementTerms`); the codebase rule is "no regex for classification/family/semantic gating" — focal-length unit detection is structural and finite (mm/prime/lens), so this matches the existing linter pattern. Acceptable per Sub-project D's precedent.

- Add to `isQualityVideoPromptLintError` in `VideoStrategy.ts` (line 46-56):

  ```ts
  /`camera_lens` must contain aperture/i.test(error) ||
  /`camera_lens` is too long/i.test(error) ||
  ```

  This routes the lint failure through the existing reroll path (3 attempts on quality errors per VideoStrategy line 533).

### `server/src/services/prompt-optimization/services/IntentLockService.ts` and similar

Audit during implementation: any service that iterates slot keys (e.g., `IntentLockService`, slot completeness scorers) needs to know about `camera_lens` — likely just add to a switch/key-array.

### Test files

- `videoPromptLinter.test.ts` (or new file): 6 test cases — null OK, valid "28mm at f/11" OK, "anamorphic" with no aperture rejected (no f/, no mm — actually "anamorphic" matches the keyword regex per the rule), "lens at" rejected, ">12 words" rejected, mixed-case "F/2.8" OK.
- `videoPromptRenderer.regression.test.ts`: 4 cases — null lens uses focusFromFraming fallback; non-null lens uses LLM value and suppresses fallback; both lens and camera_move present compose correctly; renderer emits at most ONE aperture mention regardless of input.
- Schema factory tests: 2 cases — OpenAI strict schema includes camera_lens; Groq schema includes camera_lens.
- `VideoStrategy.regression.test.ts`: 1 case — full pipeline with a stub AIService that returns slot with `camera_lens: "28mm at f/11"`. Verifies the rendered output contains `"on 28mm at f/11"` exactly once and does NOT contain `"with deep focus (f/11-f/16)"`.
- **Direct regression test** for the actual labeled fragment: parse the optimize calibration entry that contains `"captured with an anamorphic lens at."` and assert that the new linter would flag the equivalent slot value (this proves the lint rule catches the dominant pattern).

---

## 3. What does NOT change

- Telemetry event schemas: `optimize.completed` event continues to emit `outputPrompt` (the rendered text); no new property fields needed. The lens info is implicit in the rendered prompt; Sub-project E's matrix tooling compares total scores and dimension breakdowns.
- The judge rubric (`scripts/quality-judge/rubrics/optimize.md`): no changes. Brevity/coherence dimensions already capture the fragment issue.
- The calibration JSONs from Sub-project D: no changes. They remain the honest baseline for measuring Sub-project C's improvement.
- The synthetic harness drivers (`scripts/synthetic/drivers/optimize.driver.ts`): no changes. It invokes the prod service via `optimize_standard`; the slot addition is transparent.
- Constitutional review flow (`workflows/constitutionalReview.ts`): no changes. It operates on the rendered text, not the slots.
- Suggestions engine (`EnhancementV2Engine`): no changes. This is optimize-only.

---

## 4. Risks and mitigations

| Risk                                                                                                                                                                                                      | Mitigation                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI strict mode requires all `properties` to appear in `required`. Adding `camera_lens` as `["string", "null"]` may or may not satisfy "strict optional".                                              | Implementation step verifies via test: write a schema, run a minimal API call, check parse success with `camera_lens` omitted vs. present. If strict mode forbids nullable-optional, fall back to required `["string", "null"]` (always emit null when absent). |
| LLM ignores the new slot in early few-shot iterations, leaving everything in `camera_move`.                                                                                                               | Few-shot examples explicitly split `camera_move` and `camera_lens` — strongest training signal. If the matrix shows <50% adoption, follow-up sub-project to strengthen the prompt language.                                                                     |
| Backwards-compat for production events: existing PostHog `optimize.completed` events lack `camera_lens`; dashboards that aggregate slot data may break.                                                   | Audit dashboards before merge (likely none directly query slot keys; they consume `outputPrompt` text). Mark slot as optional in PostHog property definitions if any exist.                                                                                     |
| Renderer fallback to `focusFromFraming` becomes dead code if 95%+ of LLM responses include `camera_lens`.                                                                                                 | Acceptable. The fallback is defensive — if the LLM fails to emit lens info, the renderer still produces a reasonable sentence. Delete only when adoption is empirically >99%.                                                                                   |
| Lint rule's "must contain f/ OR focal-length unit" misses valid lens descriptions that use unusual phrasing (e.g., `"vintage cine lens"` without focal length).                                           | The keyword list (`mm/prime/lens/anamorphic/telephoto/wide-angle/macro`) covers >99% of cinematographic conventions. If false positives surface, expand the keyword list incrementally — never regex.                                                           |
| The `_fallbackOptimization` path's `looseSchema` may not handle nullable-optional cleanly with the StructuredOutputEnforcer; existing serialization roundtrips may not handle the new field consistently. | TDD test asserts a roundtrip: serialize slots with `camera_lens: null`, deserialize, render — output unchanged. Also assert with `camera_lens: "28mm at f/11"`, deserialize, render — contains "on 28mm at f/11" exactly once.                                  |
| Few-shot example rewrite changes `_creative_strategy` or other fields' relationships, breaking style consistency in outputs.                                                                              | Keep all other few-shot fields untouched. Only modify the `camera` → split into `camera_move + camera_lens` mapping.                                                                                                                                            |
| Two providers (OpenAI strict, Groq json_object) have different schema-enforcement semantics. Sub-project B's experience shows Groq treats `required` as advisory.                                         | Document the asymmetry explicitly. OpenAI strict will enforce camera_lens always being present (null or non-null). Groq may omit it entirely. Lint rule + reroll path handles both cases identically.                                                           |
| The regression test that proves the lint rule catches the labeled fragment is hard to write because the fragment appears in the _rendered_ output, but the lint runs on _slot_ values.                    | Write the regression test at the slot level: input slot with `camera_lens: "anamorphic lens at"` (the orphaned fragment), assert lint flags it. The link to the labeled output is established by the design rationale (§ 0), not by the test data.              |

---

## 5. Success criteria

- [ ] `camera_lens?: string \| null` added to `VideoPromptSlots` type; tsc passes with no errors.
- [ ] Schema factories (both OpenAI strict and Groq simplified) include `camera_lens`. Verified via schema-factory unit tests.
- [ ] `videoPromptOptimizationTemplate.ts` slot description split into `camera_move` and `camera_lens`. All 4 few-shot examples split.
- [ ] `videoPromptRenderer.ts` `renderMainVideoPrompt`, `renderCompactVideoPrompt`, and `renderPreviewPrompt` use `camera_lens` when present; suppress `focusFromFraming` hardcoded aperture phrase when `camera_lens` is non-null.
- [ ] `videoPromptLinter.ts` validates `camera_lens` non-null values; integrated into `isQualityVideoPromptLintError` for reroll routing.
- [ ] All existing tests pass.
- [ ] New tests cover: linter (6 cases), renderer composition (4 cases), schema factory presence (2 cases), VideoStrategy integration (1 case), regression test for the labeled "lens at" fragment.
- [ ] `npx tsc --noEmit && npm run lint && npm run test:unit` exits 0.
- [ ] Synthetic harness run (`npm run synthetic -- --only optimize` then `npm run judge:run -- --surface optimize`) emits at least 5 `optimize.completed` events without the "lens at" fragment pattern. (Smoke-test only; not a calibration validation.)
- [ ] Commit per logical unit: (1) types + schema, (2) template + few-shot, (3) renderer, (4) linter, (5) integration tests + regression. Each commit passes pre-commit hook.
- [ ] Measurement Program reordering log gets a 2026-05-22 Sub-project C entry naming the dominant failure mode, the schema-redesign fix, and the post-fix optimize mean (recorded after a 2-variant matrix comparison if affordable, otherwise marked as "matrix verification TBD").

---

## 6. Self-review checklist

(Filled inline during spec self-review.)

- [x] No "TBD" placeholders or vague requirements except acknowledged ones (post-fix matrix mean — recorded after measurement, not pre-design).
- [x] Scope is locked at "broad" per user's 2026-05-22 selection (added `camera_lens` slot, full schema redesign).
- [x] Out-of-scope items explicitly listed (§ 3): tag-soup tails, mid-sentence truncations, telemetry/event-schema additions, rubric changes.
- [x] No ambiguity: every change is named with file path + exact code shape. Insertion points cited by file:line where relevant.
- [x] Pre-commit hook requirements: this is a `feat:` commit — adds new schema. No regression-test requirement, but TDD discipline applies regardless.
- [x] No-regex rule: linter rule uses keyword/substring checks for focal-length unit detection (matches existing linter precedent at line 246 of videoPromptLinter.ts). Explicitly NOT using regex for classification.
- [x] Never-invent-provider/model: no new model identifiers introduced. The slot change is consumer-side; `optimize_standard` model config (server/src/config/modelConfig.ts) unchanged.

---

## 7. Out of scope (explicit non-goals)

- ❌ Tag-soup tails in `style` slot (e.g., `"cinematic look, naturalistic lighting, shallow depth of field"`). Different root cause — LLM dumping multiple descriptors into one slot. Open as Sub-project C2 if it stays prevalent.
- ❌ Mid-sentence terminal truncations (`"imbued with the serene yet dramatic glow of"` ending mid-clause). Likely max_tokens-related. Open as Sub-project C3.
- ❌ New `optimize.completed` event property fields. Sub-project E's matrix tooling already provides cross-variant comparison via `outputPrompt` text + dimension scores.
- ❌ Calibration data updates. Sub-project D's calibration remains the baseline; Sub-project C's improvement is measured via post-implementation synthetic + judge run, not by re-labeling.
- ❌ Suggestions engine (`EnhancementV2Engine`). This is optimize-only.
- ❌ Constitutional review flow. Operates on rendered text, not slots.
- ❌ Frontend client changes. The optimize API returns the rendered string; the new slot is internal to the server.
