# Sub-project B2 — Imperative + one-shot scene_summary emission — Design Spec

**Date:** 2026-05-22
**Program:** Sub-project B2 of the [Measurement Program](../programs/measurement.md). Continues Sub-project B's scene-summary-first mechanism by closing the emission-rate gap that capped B's relevance lift.
**Estimate:** ~half day (in-session, sequential with matrix verification)
**Branch:** off `main`
**Feature flag:** none — prompt-layer change.

---

## 0. Why

Sub-project B (2026-05-21) shipped scene-summary-first prompting and lifted suggestions total 20.06 → 20.98 (+0.92) and relevance 3.57 → 3.87 (+0.30). The lift was capped because Qwen via Groq emitted `scene_summary` only ~36% of the time in B's spec measurement.

**A diagnostic this session refined the picture across providers** (PostHog HogQL post-Sub-project-B):

| modelVariant | total events | with scene_summary | emission % |
| ------------ | ------------ | ------------------ | ---------- |
| (default)    | 58           | 24                 | 41.4%      |
| qwen         | 58           | 23                 | 39.7%      |
| gemini       | 58           | 18                 | **31.0%**  |

The handoff doc's framing ("Qwen ~36%, Gemini reliable") was **wrong on Gemini**. Gemini's actual rate is 31% — lower than Qwen. This refutes a Gemini-as-fallback strategy and confirms the fix must be **provider-agnostic** (prompt engineering, not schema enforcement).

The schema-enforcement path is closed for both Qwen and Gemini for distinct reasons:

- **Qwen via Groq** (`GroqQwenAdapter.ts:261`): "Qwen supports json_object, not json_schema". `required` is advisory.
- **Gemini** (`ProviderDetector.ts:115` says `strictJsonSchema: true`): receives the OpenAI strict schema where `scene_summary` IS required, but Gemini's `responseSchema` is **validation-based, not grammar-constrained**. Required fields are advisory in practice — same effect as Groq even though the capability flag suggests otherwise. (This is related to F1's Gemini JSON parse flakiness — both are Gemini-responseSchema-is-advisory symptoms.)

The mechanism per the handoff: stronger imperative prompt + one-shot example. ~+100-140 tokens per call.

---

## 1. Locked architectural decisions

| Decision                                            | Choice                                                                                                                                                                                                                                   | Reason                                                                                                                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                                               | Imperative + one-shot in both `buildPrompt` and `buildCustomPrompt`. Engine `_generateGuidedCandidates` path captures scene_summary on regular path (already does). Engine custom-request path extended to capture+expose scene_summary. | Prompt engineering is provider-agnostic. The custom-request extension was an explicit Sub-project B deferral that's now in scope per user's "nothing is out of scope" directive.                                 |
| Schema enforcement on Gemini                        | NOT changed. Gemini's `responseSchema` is validation-based; tightening the schema doesn't change emission. (Sub-project B's discovery for Groq, extended here to Gemini.)                                                                | Verified empirically (diagnostic this session: Gemini at 31% despite `scene_summary` in required of the OpenAI strict schema it receives). Schema-only fixes don't move provider behavior; prompt language does. |
| Schema enforcement on Groq                          | NOT changed. Sub-project B's locked decision stands: `scene_summary` in properties only, not required.                                                                                                                                   | Re-verified: `GroqQwenAdapter.ts:261` confirms json_schema unsupported on Qwen path.                                                                                                                             |
| One-shot example category                           | `camera.angle` ("aerial" → "high-angle drone" / "bird's-eye"). Different from typical highlight categories but unambiguous in the taxonomy.                                                                                              | Avoids biasing toward example content. Example shape demonstrates `{scene_summary, suggestions[]}` clearly.                                                                                                      |
| One-shot example placement                          | After CONTEXT block, before RULES block.                                                                                                                                                                                                 | Proximity to the output-format instruction. The example primes the LLM's attention on the structure right where the rules constrain it.                                                                          |
| Imperative phrasing                                 | "You MUST emit `scene_summary` FIRST. Begin your response with the literal text `{\"scene_summary\":` — the `suggestions` array MAY NOT appear before `scene_summary`. This is a hard requirement, not a preference."                    | Token-level autoregressive models latch onto starts-with constraints strongly. Imperative MUST + literal-text instruction + explicit ordering rule + "hard requirement" reframing combine for strongest signal.  |
| Format-reinforcement line                           | Change "Return a JSON object with these fields IN THIS ORDER" → "Return EXACTLY this JSON shape — `scene_summary` MUST be the first key:"                                                                                                | Removes ambiguity; reinforces hard-ordering language used in the imperative.                                                                                                                                     |
| Custom-request path extension                       | Extend `buildCustomPrompt` with parallel imperative + one-shot. Update `EnhancementV2Engine` custom-request branch to capture `siblings.scene_summary` and propagate to engine output (currently returns `null` at line 296).            | Per user's "nothing is out of scope" directive. Custom requests benefit from the same scene-anchoring mechanism. Sub-project B's deferral was an "out of scope" choice that's now reversed.                      |
| Verification                                        | 2-variant matrix: `qwen-current` (existing) vs `qwen-with-imperative` (new variant preset in `scripts/synthetic/variants.ts`). Both run via `npm run synthetic:matrix` + `npm run judge:run` + `npm run synthetic:report-matrix`.        | Sub-project E's infrastructure handles this directly. Variant preset needed because the matrix orchestrator subprocess-isolates each variant; in-process env mutation isn't safe.                                |
| Sub-project C matrix verification (deferred from C) | Also run a 2-variant matrix `openai-current` vs `openai-with-camera-lens`. Per user's "nothing is out of scope" directive, deferred Sub-project C verification is in scope here.                                                         | Both matrices use Sub-project E's infrastructure. Running them in the same session is amortized cost.                                                                                                            |
| Sub-project B3 (template-bound canned scaffolds)    | NOT in this spec. Separate sub-project after B2 ships.                                                                                                                                                                                   | B3's root cause is V2CandidateScorer policy + LLM training around diversity, not emission rate. Conflating would prevent attributing matrix-delta outcomes to either cause.                                      |
| F1 (Gemini JSON parse flakiness)                    | Coordinated with B2 (both surface Gemini responseSchema weakness) but not bundled. F1 ships separately after B2 verification.                                                                                                            | F1's fix is in the JsonExtractor / repair-logic layer; B2's fix is in the prompt layer. Same Gemini-weakness root cause but different remediation targets.                                                       |
| TDD discipline                                      | RED-GREEN-COMMIT per layer: prompt builder (test asserts imperative + one-shot present), engine custom-request handling (test asserts sceneSummary captured), variant preset (smoke test the matrix runs).                               | Per CLAUDE.md commit protocol.                                                                                                                                                                                   |
| Token cost                                          | ~+100-140 tokens/call. Acceptable.                                                                                                                                                                                                       | At ~$0.001/1k tokens for Qwen, the marginal cost is ~$0.0001/call. Negligible vs. the relevance-lift expected.                                                                                                   |

---

## 2. What changes

### `server/src/services/enhancement/v2/EnhancementV2PromptBuilder.ts`

- **`buildPrompt`** (regular path, ~line 25-83):
  - Insert a one-shot EXAMPLE block between CONTEXT and RULES sections (after line 60).
  - Replace line 62 (current "BEFORE the suggestions array, emit scene_summary…") with imperative phrasing per § 1.
  - Replace line 77 ("Return a JSON object with these fields IN THIS ORDER:") with "Return EXACTLY this JSON shape — `scene_summary` MUST be the first key:".

- **`buildCustomPrompt`** (custom-request path, currently does NOT include scene_summary instruction):
  - Add the imperative + one-shot scene_summary block in parallel structure to `buildPrompt`.
  - Same example, same imperative language.

### `server/src/services/enhancement/v2/EnhancementV2Engine.ts`

- **Custom-request path** (~line 273-296):
  - Currently returns `sceneSummary: null` unconditionally.
  - Change to capture `siblings.scene_summary` from the structured-output result (mirror the regular path's mechanism around line 322).
  - Surface as `sceneSummary` in the engine return.

### `scripts/synthetic/variants.ts`

- Add two new variant presets:
  - `qwen-with-imperative` — overrides `SUGGESTIONS_PROVIDER=groq` + `SUGGESTIONS_MODEL=qwen-...` (matches existing `qwen` variant); environment is identical to `qwen`; the difference is the code itself (the new prompt). Variant tag still distinguishes runs.
  - `openai-with-camera-lens` — for Sub-project C verification. Same setup as `openai` variant but the code-change-on-main provides the slot.
  - Both presets exist so the matrix orchestrator can tag emitted events with the right `modelVariant` for downstream comparison.

  **Implementation detail:** since both variants exercise code that's already in `main` after the relevant commits, the variant presets don't need different env vars — they just need different `--variant-tag` values to attribute the events. The variant presets can reuse the existing `qwen` and `openai` env-var sets and pass distinguishing tags.

### `server/src/services/enhancement/v2/__tests__/EnhancementV2PromptBuilder.test.ts`

New file. Tests:

1. `buildPrompt` output contains the imperative phrase `MUST emit \`scene_summary\` FIRST`.
2. `buildPrompt` output contains the one-shot example block (e.g., `EXAMPLE` marker + `"scene_summary": "Dusk aerial`).
3. `buildCustomPrompt` output contains the same imperative phrase.
4. `buildCustomPrompt` output contains the one-shot example block.

### `server/src/services/enhancement/v2/__tests__/EnhancementV2Engine.test.ts`

Add tests: 5. Custom-request path captures and propagates `sceneSummary` when present in the model response. 6. Custom-request path returns `sceneSummary: null` when absent (back-compat).

### `docs/superpowers/programs/measurement.md`

Sub-project B2 reordering-log entry recording:

- The 3-provider diagnostic finding (refuting handoff's Gemini-reliable assumption).
- Imperative + one-shot implementation.
- Custom-request path extension.
- Matrix verification results (qwen current vs with-imperative; emission rate delta).
- Sub-project C matrix verification results (optimize openai vs with-camera-lens).
- Flag F1 (Gemini JSON parse) as next-in-line, with the shared "Gemini responseSchema is advisory" insight as the connecting principle.

---

## 3. What does NOT change

- Schema files (`server/src/utils/provider/schemas/enhancement.ts`): no changes. Both Groq and OpenAI variants stay as Sub-project B left them.
- `StructuredOutputEnforcer.captureSiblings`: no changes. The mechanism Sub-project B added already supports surfacing scene_summary.
- `V2CandidateScorer.ts`: no changes. Scoring policy is orthogonal to emission rate.
- Slot policies (`policies/slotPolicies.ts`): no changes.
- `aiService` / provider adapters: no changes. The Gemini responseSchema observation is informational; F1 will address the parse-failure leg in its own sub-project.
- Suggestions API response shape: no changes. `sceneSummary` is already in the contract.

---

## 4. Risks and mitigations

| Risk                                                                                                                                         | Mitigation                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imperative phrasing causes LLM to refuse or over-comply (e.g., emit scene_summary even when context doesn't warrant a constraint statement). | Acceptable side effect. Better to over-emit than under-emit. Matrix run measures both relevance (signal) and emission rate (mechanism); both should rise.                                          |
| One-shot example's specific content biases LLM output toward "drone" / "aerial" terminology even when irrelevant.                            | Example uses `camera.angle` category — distinct from most real highlights. If matrix data shows camera.angle dominance, add a second example or randomize across categories in a future iteration. |
| Custom-request path extension breaks the existing custom-request contract (e.g., client expects sceneSummary to be null on custom path).     | The engine return type already includes `sceneSummary: string \| null`. Clients reading null tolerantly stay correct. Add a test asserting the null fallback still works.                          |
| Variant preset's `--variant-tag` value collides with an existing tag, causing event misattribution.                                          | Check `variants.ts` whitelist before adding. New tags: `qwen-with-imperative`, `openai-with-camera-lens` — neither currently exists.                                                               |
| Matrix run costs (~$1 total for two 2-variant matrices) exceed expectations.                                                                 | Acceptable. Confirmed before run.                                                                                                                                                                  |
| Gemini variant in matrix shows no emission lift (because its responseSchema treats prompts and schemas the same — advisory).                 | Document the finding; F1 will address Gemini's responseSchema-advisory weakness. B2's success is judged by qwen lift (the primary target per handoff).                                             |
| The token-cost increase (+100-140 tokens) tips the Qwen response into hitting some upper limit on long contexts.                             | Qwen's context window is well above this. Verified by checking modelConfig.ts max tokens.                                                                                                          |

---

## 5. Success criteria

- [ ] `buildPrompt` and `buildCustomPrompt` both contain the imperative phrase + one-shot example. Asserted by tests.
- [ ] `EnhancementV2Engine` custom-request path captures and propagates `sceneSummary` from siblings (currently returns `null`). Asserted by test.
- [ ] `scripts/synthetic/variants.ts` declares `qwen-with-imperative` and `openai-with-camera-lens` presets. Variant whitelist updated.
- [ ] All existing tests pass.
- [ ] `npx tsc --noEmit && npm run lint && npm run test:unit` exits 0.
- [ ] Matrix run for suggestions completes; emission rates for `qwen` vs `qwen-with-imperative` are recorded. Lift target: ≥30 percentage points (39.7% → ≥70%).
- [ ] Matrix run for optimize completes; means and brevityDiscipline scores for `openai` vs `openai-with-camera-lens` are recorded. Lift target: any non-regression on mean.
- [ ] Measurement Program reordering log records the diagnostic finding + B2 implementation + both matrix results.
- [ ] Commit per logical unit: (1) prompt builder + tests, (2) engine custom-request + tests, (3) variant presets, (4) matrix run + reordering-log entry.

---

## 6. Self-review checklist

- [x] No "TBD" placeholders or vague requirements.
- [x] Scope locked at "expanded" per user's 2026-05-22 directive (everything previously out-of-scope is in).
- [x] Out-of-scope items: B3 (separate sub-project; different root cause), F1 (separate sub-project; coordinated).
- [x] No ambiguity: every change names file path + insertion point + exact change shape.
- [x] Pre-commit hook: this is a `feat:` commit set, not `fix:`. No regression-test requirement per hook, but TDD discipline applies.
- [x] No-regex rule: no classification regex introduced. Test assertions use `.includes()` for substring checks.
- [x] Never-invent-provider/model: no new model identifiers. Variant presets use existing env-var sets.

---

## 7. Out of scope (explicit non-goals)

- ❌ Sub-project B3 (template-bound canned scaffolds in suggestions) — different root cause, separate sub-project after B2 verification.
- ❌ F1 (Gemini JSON parse flakiness) — same Gemini-responseSchema-advisory root cause, but the remediation is in JsonExtractor/repair logic, not the prompt layer.
- ❌ Schema-level enforcement on Groq or Gemini — investigated and ruled out per § 1 ("Schema enforcement on Gemini" / "Schema enforcement on Groq").
- ❌ Adding more variant presets beyond the two needed for B2 + C verification.
- ❌ Custom-request semantic changes (still no taxonomy enforcement, still no category constraints).
