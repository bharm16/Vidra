# Measurement Program — Next-Session Handoff (2026-05-22)

You are picking up the Vidra Measurement Program at a clear pause point. This doc is self-contained — read it top-to-bottom and you'll know what shipped, what's open, what to do next, and what NOT to do.

**Canonical program doc:** [`docs/superpowers/programs/measurement.md`](../programs/measurement.md) — the reordering log there is the audit trail for every prior decision and is more authoritative than this handoff if they disagree.

---

## TL;DR — What state are you in?

The Measurement Program has shipped six sub-projects so far. Three remain (B2, C, D) plus two small deferred follow-ups (Gemini JSON parse flakiness, judge dedup race). Sub-project E (matrix infrastructure) just shipped, which means **per-surface model swap and comparison is now a first-class capability**. Use it.

| Sub-project                                 | Status                | Notes                                                                                         |
| ------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| #0 Eval Visibility                          | ✅ shipped            |                                                                                               |
| #1 Source Discriminator + Synthetic Harness | ✅ shipped            |                                                                                               |
| #3 LLM Judge Framework                      | ✅ shipped            |                                                                                               |
| Layer 5 fixture fix                         | ✅ shipped 2026-05-14 | Suggestions fixture self-consistency                                                          |
| **A** Calibration seeding                   | ✅ partial pass       | optimize ρ=0.787, suggestions ρ=0.755, span-labeling ρ=0.688 (misses 0.7 floor by 0.012)      |
| **B** Suggestions scene-summary             | ✅ partial pass       | relevance 3.57→3.87 (+0.30 vs +0.73 target), minTotal 5→11; Qwen emission rate ~36% caps lift |
| **E** Matrix infrastructure                 | ✅ shipped 2026-05-21 | `npm run synthetic:matrix` + `:report-matrix`; verified end-to-end                            |
| **B2** Push Qwen emission                   | ⏳ next               | Empirically grounded by Sub-project E's matrix data                                           |
| **C** Optimize tail-truncation              | ⏳ open               | Clearest-cut bug (mid-sentence truncation)                                                    |
| **D** Span-labeling under-segmentation      | ⏳ open               | Would also close calibration ρ gap (0.688 → ≥ 0.7)                                            |
| #2/#4/#5/#6/#7                              | not started           | Per the Measurement Program decomposition                                                     |

**Recommended next move:** see [§ Recommended sequence](#recommended-sequence) below. Short version: Sub-project C first (clearest bug, cheapest ship), then D (two-birds-one-stone for calibration), then B2 (now has real comparison data to inform).

---

## What you should know before you start

These principles were earned across Sub-projects A → E. Read them. The same false-signal class will bite again if you don't.

1. **Never invent LLM provider/model values.** Always grep `server/src/config/modelConfig.ts` for real `executionType → provider/model` before writing drivers, tests, or fixtures. Sub-project E's spec invented `SPAN_LABELING_PROVIDER` — the real env var is `SPAN_PROVIDER`. This bit when the first verification ran.

2. **Absolutely no regex anywhere.** For classification/family/semantic gating, use NLP analyzers, taxonomy lookups, or LLM classification. Wordlists / `Set<string>` + phrase lookups are regex in another form. `parseSinceArg` in `scripts/synthetic/report-matrix.ts` is the canonical example of how to parse without regex (char-by-char with ASCII digit codes).

3. **Measurement tooling in two places must read from the same env vars.** If `modelConfig.ts` routes against `SPAN_PROVIDER` and a driver's telemetry annotation hardcodes `"gemini"`, you'll silently misattribute Qwen-routed events as Gemini. Sub-project E Task 3 fixed this for span-labeling. Watch for similar drift if you add new surfaces.

4. **E2E verification surfaces bug classes unit tests can't catch.** `report-matrix.ts`'s HogQL passed all 11 unit tests against synthetic fixtures but timed out (`HogQL 504`) on real PostHog data. Query plans against synthetic data differ from query plans against production data. Smoke-test against real cardinality before trusting any measurement query.

5. **Subprocess isolation > in-process env mutation.** ESM imports evaluate `process.env` at module-load time. A single-process loop that mutates `process.env` between variants will race against import-side evaluation. Sub-project E uses `spawn()` per variant for this reason.

6. **Vidra is pre-launch with zero users.** Every measurement decision is grounded in this. Synthetic + dogfood + eval are the only signals. Never frame work as "what real users do" — there are none.

7. **Trust user's env-file claims; verify by reading, not narrow grep.** When the user says env is set up, read `.env` with permission instead of re-grepping with narrow patterns that might miss legitimate variants.

8. **Browser testing — use Chrome/headed, never preview scripts.** Skip `preview_*` MCP tools and launch.json; drive the real browser via Chrome MCP or headed Playwright.

9. **Don't attribute Claude in this project.** No `Co-Authored-By` trailer, no "Generated with Claude Code" footer, no AI signatures in files / commits / PRs.

10. **Always recommend with every question.** When you give the user options, the first one is your recommendation and it ends with "(Recommended)" — never neutral framing.

---

## Tools you have that prior sessions didn't

### Matrix infrastructure (Sub-project E, shipped 2026-05-21)

You can now answer "is Model X better than Model Y on surface Z?" in three commands:

```bash
# Available presets
npm run synthetic:matrix -- --list-variants

# Run two models against suggestions, sequentially, ~$0.50 total
npm run synthetic:matrix -- --only suggestions --variants qwen,gemini

# Score the events
npm run judge:run -- --surface suggestions

# Compare
npm run synthetic:report-matrix -- --only suggestions --since 30m
```

Variant presets live in `scripts/synthetic/variants.ts`. Add new presets there. Whitelist validation runs at startup. The orchestrator subprocess-isolates each variant; failed variants don't abort the run.

**First real cross-model data (recorded 2026-05-21, suggestions surface):**

| Variant | n   | total |
| ------- | --- | ----- |
| qwen    | 60  | 21.18 |
| gemini  | 41  | 20.32 |

Gemini's lower n is a pre-existing JSON-mode flakiness in `EnhancementV2Engine._generateGuidedCandidates`, not a Sub-project E bug. See [§ Deferred follow-ups](#deferred-follow-ups).

### Calibrated judge

GPT-4o judge is anchored at Spearman ρ ≥ 0.7 for two of three surfaces (optimize 0.787, suggestions 0.755). Span-labeling is at 0.688 — close, but it's a "judge-vs-Claude-labels" cross-model anchor rather than human-anchored. Sub-project D's product fix is expected to close the ρ gap as a side effect (the bifurcated old-vs-new span-labeling outputs in the calibration sample go away once D lands).

---

## Open sub-projects

### Sub-project B2: Push Qwen `scene_summary` emission rate

**Why it matters:** Sub-project B's mechanism (force `scene_summary` first, conditioning the LLM's own generation) lifts relevance for the events that emit the summary — but Qwen via Groq only emits the field ~36% of the time. Lifting Qwen emission from 36% → 80%+ is the highest-leverage path to closing the spec's relevance gap (3.87 → 4.3+ target).

**What Sub-project E just told you:** Qwen with 36% emission STILL beats Gemini head-to-head on suggestions (21.18 vs 20.32). So **don't swap providers** — target Qwen's emission rate. Sub-project E's spec already anticipated this; the matrix gave you the empirical confirmation.

**Three plausible mechanisms (pick after a brainstorm with the user):**

1. **Stronger imperative prompt language** — change "BEFORE the suggestions array, emit `scene_summary`" to "You MUST emit `scene_summary` FIRST. Begin every response with `{"scene_summary": "..."`. The suggestions array MAY NOT be emitted before scene_summary." Adds ~20 tokens; cheap. Highest uncertainty payoff.

2. **One-shot example in the prompt** — include one full worked example showing `{ scene_summary, suggestions }` as the response shape. Adds ~80-120 tokens per call. Higher emission lift likelihood, more cost.

3. **Schema enforcement (already tried, doesn't work).** Sub-project B's Groq schema initially marked `scene_summary` as required, but Groq's `json_object` mode doesn't honor `required` arrays — treats it as advisory. We backed it out to `properties`-only. Don't re-try this path.

**Recommended verification path:**

- Brainstorm with the user; pick one mechanism
- Implement
- Run a 2-variant matrix: `--variants qwen-current,qwen-with-fix`
- Compare emission rate (`SELECT countIf(properties.sceneSummary IS NOT NULL AND properties.sceneSummary != '') / count() AS emission_rate ...`) — should rise from ~36% to whatever the new floor is
- Compare relevance dimension specifically — should lift toward 4.3+

**Spec:** none yet. Open a fresh brainstorm session via `superpowers:brainstorming` once you're ready.

**Estimated effort:** ~half day for the smallest mechanism (option 1), ~1 day if you want a multi-variant comparison.

### Sub-project C: Optimize tail-truncation fix

**Why it matters:** The optimize surface scored 23.10/25 in the pre-Sub-project-E baseline. The weakest dimension was `brevityDiscipline` at 4.10/5. The failure pattern across the 5 worst events was the same shape repeatedly:

- "mid-sentence truncation and repetition" ×3
- "incomplete sentence at the end" ×2
- "fragmented sentence ('Shot with a 35mm lens at,...')"
- "natural golden hour light" twice (filler/repetition)
- "extreme wide, high-angle" introduced when not in user input (drift)

This is observably a real bug regardless of rubric interpretation — mid-sentence truncation is unambiguous.

**Likely fix locations** (don't trust me — verify by reading):

- `server/src/services/prompt-optimization/PromptOptimizationService.ts` — likely max_tokens / stop conditions
- Templates under `server/src/services/prompt-optimization/templates/` — may demand too many decorations in too few tokens

**Investigation steps:**

1. Run `npm run synthetic -- --only optimize` and observe ~5 outputs in PostHog (the surface emits `optimize.completed` with full `outputPrompt`).
2. Check the actual output character lengths against the configured max_tokens. Compare to what `gpt-4o-2024-08-06` would have produced with no length cap.
3. Look for fragmented endings — the `"50mm lens at,"` trailing-comma pattern is the symptom.

**Recommended verification path:**

- Make the fix (likely a max_tokens bump or template tightening)
- Run a 2-variant matrix: `--variants openai,openai-with-fix` (you'll need to add the second preset to `variants.ts`)
- Compare brevityDiscipline + total scores

**Estimated effort:** ~half day. Smallest scope of the three open sub-projects.

### Sub-project D: Span-labeling under-segmentation

**Why it matters:** Span-labeling scored 22.79/25 in the pre-Sub-project-E baseline. Weakest dimension: `coverage` at 4.29. The pattern: the Gemini-2.5-flash labeler chunks multiple distinct concepts into one span AND misses action verbs.

Examples from the calibration set:

- "missed action 'cuts through'" / "missed 'steamed milk' as a potential span" — verb phrases dropped
- "should be split: 'symmetrical composition' and 'pastel palette'" — multi-concept lumping
- "'abandoned 1950s diner' and 'overgrown with vines' could be individually labeled"

**Two-birds-one-stone:** D's product fix is expected to remove the bifurcation in the span-labeling calibration sample (entries 0-9 emit window-fragment outputs scored 5-11; entries 10-19 emit clean semantic spans scored 21-25). Once the bifurcation goes away, the calibration ρ should rise from 0.688 → ≥ 0.7 as a side effect. Verify this by re-running `npm run judge:calibrate` after D ships.

**Likely fix location:**

- `server/src/llm/span-labeling/SpanLabelingService.ts` — Gemini template (v3.0 → v3.1)
- The template likely needs: explicit "label action verbs" instruction, "prefer multiple smaller spans over one large span", maybe a few-shot example showing the split pattern

**Recommended verification path:**

- Update template to v3.1
- Run `npm run synthetic -- --only span-labels`
- Run `npm run judge:run -- --surface span-labeling`
- Compare coverage dimension (target: 4.29 → 4.7+)
- Re-run `npm run judge:calibrate` and confirm span-labeling ρ ≥ 0.7

**Estimated effort:** ~1 day. Higher uncertainty than C because prompt-engineering iteration may need multiple rounds.

---

## Deferred follow-ups

### F1: Gemini structured-output JSON parse flakiness

**Where:** `server/src/services/enhancement/v2/EnhancementV2Engine.ts`, specifically `_generateGuidedCandidates`. Pre-existing, not caused by Sub-project E.

**Symptom:** Gemini via the GeminiAdapter occasionally produces malformed JSON (e.g., `SyntaxError: Expected ',' or ']' after array element in JSON at position 1043`). Sub-project E's matrix run saw ~17 of 58 Gemini events fail at parse time despite `StructuredOutputEnforcer`'s retry+repair logic.

**Why this matters now:** asymmetric n counts in matrix runs (Qwen 58 valid vs Gemini 41 valid) make A/B comparisons noisier than they should be. If you're running B2's emission-rate comparison and Gemini is in the mix, the result is partly the comparison you wanted and partly Gemini parse-failure rate.

**Recommended fix path:**

1. Look at the actual failure modes in `JsonExtractor.ts` / `StructuredOutputEnforcer.ts` retry paths.
2. Check whether Gemini is emitting trailing commas, unclosed arrays, or smart-quotes. The repair logic may need a Gemini-specific pass.
3. Alternatively, add a "judgeable %" column to the matrix report so the asymmetry is visible rather than hidden.

**Estimated effort:** ~half day for the column-addition; unknown for the actual repair logic (depends on what the malformed JSON looks like).

### F2: Judge dedup race on rapid re-invocation

**Where:** `scripts/quality-judge/run-judge.ts`. Pre-existing, surfaced cleanly by Sub-project E Task 8's verification.

**Symptom:** `npm run judge:run` prints `[quality-judge] running for suggestions` and then is silent during processing. If the operator thinks it failed and re-invokes, the second invocation queries PostHog while the first is still flushing, causing duplicate `quality.scored` events for the same `scoredEventId`.

**Why this matters:** marginal data pollution in dashboards; trivial UX paper-cut that wastes operator time re-checking.

**Recommended fix:** add `console.log` lines for "scored N events" or "processing event K of M" so the operator knows progress. One-line change. Or print "done" / final score count on success.

**Estimated effort:** 15 minutes.

### F3: Calibration JSON v2 (human-anchored)

**Where:** `scripts/quality-judge/calibration/*.calibration.json`. From Sub-project A's design decision: labels are currently Claude-authored (cross-model agreement check, not human anchor).

**Why this matters:** the judge's absolute scores are anchored to Claude's preferences, not a human's. As long as B/C/D's deltas are framed as "judge agreement deltas" rather than "product quality deltas", this is fine. But for any "we shipped a product improvement" claim that requires absolute trust in the score, a human-labeled calibration set is the only path.

**Recommended:** Defer until there's real user dogfooding or until a "is the product launch-ready" decision needs to be backed by human-anchored data. Until then, the cross-model anchor is sufficient.

### F4: GH Actions secrets for nightly calibration cron

**Where:** Vidra's GitHub Actions secrets — `gh api repos/.../actions/secrets` returned `total_count: 0` as of 2026-05-14.

**Why this matters:** the nightly quality-judge cron and the PR calibration gate workflow both fail silently without `POSTHOG_API_KEY` and `OPENAI_API_KEY` in repo secrets.

**Recommended fix:** human-only step. Set the secrets in the GitHub UI; verify a manual `workflow_dispatch` of the nightly cron emits `quality.scored` events with `source=ci`.

**Estimated effort:** 5 minutes once you have credentials access.

---

## Recommended sequence

Given the open work, this is what I'd do:

### Option A (recommended): Bank the easy wins first

1. **F2 (judge dedup log line)** — 15 min, zero risk, removes a paper-cut that affects every subsequent run
2. **Sub-project C (optimize tail-truncation)** — ~half day. Clearest bug. Likely cheapest fix (token-budget or template tightening). Verify via 2-variant matrix.
3. **Sub-project D (span-labeling under-segmentation)** — ~1 day. Two-birds-one-stone — also closes calibration ρ gap. Verify via matrix + re-run `judge:calibrate`.
4. **Sub-project B2 (Qwen emission rate)** — ~half day. Now empirically grounded (Qwen beats Gemini → don't swap, target emission). Verify via 2-variant matrix `qwen-current,qwen-with-fix`.

By the end of this sequence:

- All three surfaces have run through the matrix pipeline for product-quality improvements
- Calibration ρ is ≥ 0.7 on all three surfaces (D's side effect)
- Suggestions scores have moved from the post-B 20.98 baseline closer to the spec's 22+ target
- The reordering log captures three more layers of false-signal hunting + one product-quality push per surface

### Option B: Front-load B2 (sharpest leverage on the spec's primary metric)

1. F2
2. B2 — closes the relevance gap that motivated the whole arc (Sub-project B's partial pass was the catalyst for E)
3. C
4. D

Lower aggregate impact but more decisive on the question that started this. Pick this if you want to see the relevance number move first.

### Anti-pattern (don't do)

- **Don't tackle F3 (human-anchored calibration) before the product-quality sub-projects ship.** Calibration on a partial-quality product is wasted effort; first push quality up, then re-anchor with human labels at a baseline worth anchoring.
- **Don't add new surfaces to the matrix infrastructure** until B2/C/D are done. The current 3-surface registry is the minimum sufficient set; adding a 4th surface (e.g., preview, motion) means refactoring the surface-naming asymmetry that the final cross-cutting review flagged as M1.
- **Don't run a 5+-variant matrix without confirming cost first.** Each variant burns ~$0.30-0.60 (Gemini retries inflate cost). Five variants ≈ $2-3 in synthetic + judge.

---

## Pointers — where everything lives

| What                               | Path                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Measurement Program canonical doc  | `docs/superpowers/programs/measurement.md`                                                                                                |
| Sub-project A spec / plan          | `docs/superpowers/specs/2026-05-15-quality-judge-calibration-seeding-design.md` / `plans/2026-05-15-quality-judge-calibration-seeding.md` |
| Sub-project B spec / plan          | `docs/superpowers/specs/2026-05-15-suggestions-scene-summary-design.md` / `plans/2026-05-15-suggestions-scene-summary.md`                 |
| Sub-project E spec / plan          | `docs/superpowers/specs/2026-05-21-synthetic-model-matrix-design.md` / `plans/2026-05-21-synthetic-model-matrix.md`                       |
| Parent quality-improvement spec    | `docs/superpowers/specs/2026-05-14-baseline-quality-improvement-design.md`                                                                |
| Synthetic harness                  | `scripts/synthetic/` (see its README)                                                                                                     |
| Variant presets                    | `scripts/synthetic/variants.ts`                                                                                                           |
| Matrix orchestrator                | `scripts/synthetic/run-matrix.ts`                                                                                                         |
| Matrix report                      | `scripts/synthetic/report-matrix.ts`                                                                                                      |
| Quality judge                      | `scripts/quality-judge/run-judge.ts`                                                                                                      |
| Calibration                        | `scripts/quality-judge/calibration/run-calibration.ts` + `*.calibration.json`                                                             |
| LLM routing config                 | `server/src/config/modelConfig.ts`                                                                                                        |
| EnhancementV2 (suggestions engine) | `server/src/services/enhancement/v2/`                                                                                                     |
| Span labeling                      | `server/src/llm/span-labeling/SpanLabelingService.ts`                                                                                     |
| Prompt optimization                | `server/src/services/prompt-optimization/`                                                                                                |
| Project commit protocol + rules    | `CLAUDE.md` (root)                                                                                                                        |

## Key commits to scan if you want context fast

```
a56f5758  docs(measurement): Sub-project E reordering-log entry — read first
464f6d96  fix(synthetic): HogQL CTE rewrite (the e2e-surfaced bug)
2217021a  feat(synthetic): matrix orchestrator
a909791a  feat(synthetic): comparison report
cfb57e55  feat(synthetic): variant preset registry
844ab28a  feat(synthetic): --variant-tag flag + driver thread-through + span-labeling alignment
dda3390c  Sub-project A close (calibration partial pass)
4eb5ba04  Sub-project B close (suggestions scene-summary partial pass)
bb231cf6  Layer 5 fixture fix (the false-signal predecessor)
```

`git log --oneline | head -40` from the current HEAD shows the full recent arc.

---

## How to start your session

1. Read this doc top-to-bottom.
2. Read the most recent reordering-log entry in `docs/superpowers/programs/measurement.md` (the "Sub-project E shipped" entry) — it has more detail on principles and the immediate context.
3. Pick a sub-project or follow-up from [§ Recommended sequence](#recommended-sequence).
4. If it's a sub-project: invoke `superpowers:brainstorming` to lock the design, then `superpowers:writing-plans`, then implement (in-session or subagent-driven per user preference).
5. If it's a follow-up (F1-F4): they're small enough that brainstorming may be overkill — but match the project's discipline (TDD where applicable, no regex, no claude attribution, commit per logical unit).

The user will tell you which to pick. Recommend Option A unless they say otherwise.
