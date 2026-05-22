# Measurement Program — Next-Session Handoff (2026-05-22)

You are picking up the Vidra Measurement Program at a clear pause point. This doc is self-contained — read it top-to-bottom and you'll know what shipped, what's open, what to do next, and what NOT to do.

**Canonical program doc:** [`docs/superpowers/programs/measurement.md`](../programs/measurement.md) — the reordering log there is the audit trail for every prior decision and is more authoritative than this handoff if they disagree.

**Important update vs. an earlier draft of this doc:** Sub-project D was REFRAMED on 2026-05-22 after a diagnostic session refuted the "labeler under-segmentation bug" hypothesis. The actual issue is **Layer 6 of the measurement-system false-signal hunt — pre-rewrite synthetic-pool events polluted the calibration sample**. There is no labeler bug to fix. Sub-project D's new scope is a calibration reseed. The design spec is already written at [`docs/superpowers/specs/2026-05-22-calibration-reseed-design.md`](../specs/2026-05-22-calibration-reseed-design.md) — read that before starting D.

---

## TL;DR — What state are you in?

The Measurement Program has shipped six sub-projects so far. Three remain (B2, C, D) plus two small deferred follow-ups (Gemini JSON parse flakiness, judge dedup race). Sub-project E (matrix infrastructure) just shipped, which means **per-surface model swap and comparison is now a first-class capability**. Use it.

| Sub-project                                 | Status                | Notes                                                                                                                  |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| #0 Eval Visibility                          | ✅ shipped            |                                                                                                                        |
| #1 Source Discriminator + Synthetic Harness | ✅ shipped            |                                                                                                                        |
| #3 LLM Judge Framework                      | ✅ shipped            |                                                                                                                        |
| Layer 5 fixture fix                         | ✅ shipped 2026-05-14 | Suggestions fixture self-consistency                                                                                   |
| **A** Calibration seeding                   | ✅ partial pass       | optimize ρ=0.787, suggestions ρ=0.755, span-labeling ρ=0.688 (misses 0.7 floor by 0.012)                               |
| **B** Suggestions scene-summary             | ✅ partial pass       | relevance 3.57→3.87 (+0.30 vs +0.73 target), minTotal 5→11; Qwen emission rate ~36% caps lift                          |
| **E** Matrix infrastructure                 | ✅ shipped 2026-05-21 | `npm run synthetic:matrix` + `:report-matrix`; verified end-to-end                                                     |
| **B2** Push Qwen emission                   | ⏳ next               | Empirically grounded by Sub-project E's matrix data                                                                    |
| **C** Optimize tail-truncation              | ⏳ open               | Clearest-cut bug (mid-sentence truncation)                                                                             |
| **D** **Calibration reseed (Layer 6)**      | ⏳ spec ready         | Reframed 2026-05-22 — no labeler bug; reseed cal w/ `MIN_EVENT_TIMESTAMP` filter. See spec link in § D below. ~1.5-2h. |
| #2/#4/#5/#6/#7                              | not started           | Per the Measurement Program decomposition                                                                              |

**Recommended next move:** see [§ Recommended sequence](#recommended-sequence) below. Short version: F2 (15-min log-line fix) → Sub-project D (calibration reseed, spec ready, ~1.5-2h) → Sub-project C (optimize tail-truncation, ~half day) → Sub-project B2 (Qwen emission, now empirically grounded). D moves earlier than the original draft because the spec is already written and it's the prerequisite for trusting B2/C measurement deltas.

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

11. **Calibration samples can span product versions silently** (Layer 6, discovered 2026-05-22). If you sample events from PostHog across a window that crossed a harness/product rewrite, your sample mixes pre-rewrite and post-rewrite outputs but the telemetry annotation doesn't distinguish them — the `provider`/`model` fields on pre-rewrite events were stamped even though no LLM was called. The fix is a `MIN_EVENT_TIMESTAMP` cutoff constant in the sampler. The deeper lesson: **measurement infrastructure has its own version-vs-data lineage problem; the events PostHog stores today don't know which version of the harness produced them. Two follow-ups (F5/F6) would fix the lineage gap at the schema level; until they ship, sampler-side cutoffs are the workaround.**

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

GPT-4o judge is anchored at Spearman ρ ≥ 0.7 for two of three surfaces (optimize 0.787, suggestions 0.755). Span-labeling is at 0.688 — close, but the 2026-05-22 diagnostic proved this is **not a labeler problem**. The calibration sample (taken 2026-05-15) included pre-harness-rewrite events where the harness emitted canned `synthesizeSpans()` window-fragment content — Claude scored those low and Claude-vs-GPT-4o disagreement on fake content drove ρ down. Sub-project D's new scope re-seeds calibration from post-`4bf218dd` events only. The new ρ will be honest. Until D lands, treat span-labeling absolute ρ skeptically (rank-correlation pattern is still informative, but the 0.688 figure is "Claude scoring fake outputs."). All labels are still Claude-authored (cross-model agreement check), not human-anchored — see F3.

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

### Sub-project D: Calibration reseed (Layer 6 — REFRAMED 2026-05-22)

**Spec:** [`docs/superpowers/specs/2026-05-22-calibration-reseed-design.md`](../specs/2026-05-22-calibration-reseed-design.md) — read this first. Self-contained; tells you exactly what to change.

**Why the scope changed:** the original handoff framed D as "fix span-labeling under-segmentation." A diagnostic session on 2026-05-22 (agent `a6c5046dcaf48639c`) refuted that hypothesis. The actual story:

- Sub-project A's calibration sampler (`scripts/quality-judge/calibration/select-samples.ts`) used a 7-day PostHog lookback when run on 2026-05-15. That window spanned commit `4bf218dd` (2026-05-14T23:16:39Z), which replaced canned `synthesizeSpans()` / canned optimize / canned suggestions helpers with live `AIModelService` calls.
- Pre-`4bf218dd` events were emitted with `provider="gemini", model="gemini-2.5-flash"` annotations even though no LLM was called — the harness fabricated those fields. Content was 3-word-window slicing with cycling category tags.
- The span-labeling calibration entries 0-9 were Claude scoring those fake window-fragment outputs (correctly low — 5-11/25). Entries 10-19 were Claude scoring real Gemini output (21-25/25). The judge's "disagreement" with Claude was disagreement about how to score fake content, not about labeler quality.
- Optimize and suggestions calibrations are likely polluted by the same lookback overlap — Sub-project D re-seeds all three unconditionally.

This is **Layer 6** of the false-signal hunt: pre-rewrite synthetic-pool events polluting post-rewrite calibration samples.

**What to do (~1.5-2h, mostly subagent labeling):**

1. Add `MIN_EVENT_TIMESTAMP = "2026-05-14T23:16:39Z"` const to `scripts/quality-judge/calibration/select-samples.ts` with explanatory comment.
2. Modify `fetchScoredRows` and `fetchSourceRows` to add `AND timestamp > '${MIN_EVENT_TIMESTAMP}'` to both HogQL queries.
3. Re-run `select-samples.ts` to overwrite all three `*.calibration.json` files with post-cutoff stubs.
4. Dispatch three sequential labeling subagents (one per surface), each receiving ONLY the rubric prose + the 20 stubs (no prior calibration data, no judge scores, no surface-level priors). Same labeling discipline as Sub-project A.
5. Run `npm run judge:calibrate`; record the new ρ values.
6. Update the Measurement Program reordering log with the 2026-05-22 Layer 6 entry and the new ρ values.

**Success criterion is NOT ρ ≥ 0.7 — it's just "new ρ values are recorded honestly."** If span-labeling is still < 0.7 after the reseed, that surfaces a different real issue (rubric drift, judge instability, residual labeler quality) — open a follow-up sub-project for it. Conflating "pollution removed" with "ρ acceptable" was the original mistake.

**Files in scope:**

- `scripts/quality-judge/calibration/select-samples.ts` (sampler + new const)
- `scripts/quality-judge/calibration/*.calibration.json` (overwritten in place; git history preserves old)
- `docs/superpowers/programs/measurement.md` (new reordering-log entry)

**Out of scope:** any labeler code change (`server/src/llm/span-labeling/`), any telemetry-schema discriminator field (`harnessVersion` / `source: "synthetic-pool"`) — that's F5, and any historical-event backfill — that's F6. Both deferred per the spec.

**Why D moves earlier in the recommended sequence:** the spec is already written. Until D lands, every measurement comparison (B2's emission-rate matrix, C's tail-truncation matrix) is being benchmarked against a polluted ρ. D is the prerequisite for trusting the next two sub-projects' deltas as "real product change" rather than "Claude vs polluted judge."

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

### F5: Telemetry-schema discriminator for harness version

**Where:** Event payloads emitted by `scripts/synthetic/drivers/*.driver.ts` and consumed by everything downstream.

**Symptom:** The harness can emit events under multiple substantively different code paths (canned content vs. live LLM calls, different prompt-template versions, different model providers). Today, an event's `provider`/`model` fields are stamped by the driver but the underlying _harness behavior_ (canned vs. live) isn't recorded anywhere. This is the root cause of Layer 6 — Sub-project A's calibration sample couldn't distinguish pre/post-`4bf218dd` events without a manual git-log archaeology pass.

**Why this matters:** As long as the harness keeps shipping behavior changes (and it should — Sub-projects B2 / future template work will keep doing this), the lineage problem will recur. The current Sub-project D fix is a sampler-side cutoff constant; F5 is the schema-level fix that would make sampler cutoffs unnecessary.

**Recommended fix:** Add `harnessVersion` (semver or commit-SHA-short) and optionally `source: "synthetic" | "synthetic-pool" | "user" | ...` discriminator fields to every operational event. Stamp at emission time. Make calibration samplers and dashboards filter on these explicitly.

**Estimated effort:** Brainstorm-then-design — touches all three driver paths, the event schemas, possibly the PostHog dashboards. ~1 day for the brainstorm + design; implementation depends on how far the schema change ripples.

### F6: Backfill or mark historical pre-`4bf218dd` PostHog events

**Where:** PostHog events emitted before 2026-05-14T23:16:39Z.

**Symptom:** Those events still exist in PostHog with fabricated `provider="gemini"` annotations. Sub-project D's cutoff makes the calibration sampler ignore them, but other consumers (dashboards, ad-hoc HogQL queries) still see them and would need their own filters.

**Recommended:** Either delete the pre-cutoff events (PostHog supports event deletion via the API), or add a `synthetic_pool_pre_rewrite: true` property to them via a one-shot script. Defer to brainstorm — the right answer depends on whether anyone is querying that historical data.

**Estimated effort:** ~half day if delete-via-API, ~1 day if property backfill (PostHog property updates are awkward).

---

## Recommended sequence

Given the open work, this is what I'd do:

### Option A (recommended): D first — it's the prerequisite for trusting everything else

1. **F2 (judge dedup log line)** — 15 min, zero risk, removes a paper-cut that affects every subsequent run.
2. **Sub-project D (calibration reseed, Layer 6)** — ~1.5-2h. **Spec already written.** Adds `MIN_EVENT_TIMESTAMP` cutoff, re-runs sampler, dispatches three labeling subagents, re-runs `judge:calibrate`, records honest ρ. **Why first:** every measurement comparison after this depends on the calibrated judge being honest. Running B2 or C against a polluted ρ means treating "Claude vs polluted judge" deltas as if they were product-quality deltas. Don't.
3. **Sub-project C (optimize tail-truncation)** — ~half day. Clearest bug. Likely cheapest fix (token-budget or template tightening). Verify via 2-variant matrix.
4. **Sub-project B2 (Qwen emission rate)** — ~half day. Now empirically grounded (Qwen beats Gemini → don't swap, target emission). Verify via 2-variant matrix `qwen-current,qwen-with-fix`.

By the end of this sequence:

- All three surfaces have honest calibration ρ values
- The two product-quality sub-projects (B2, C) have shipped against a trustworthy baseline
- Suggestions scores have moved from the post-B 20.98 baseline closer to the spec's 22+ target
- The reordering log captures Layer 6 + the two product-quality pushes

### Option B: Front-load B2 (sharpest leverage on the spec's primary metric, but at a cost)

1. F2
2. B2 — closes the relevance gap that motivated the whole arc (Sub-project B's partial pass was the catalyst for E)
3. D — clean up the lineage debt
4. C

**Why I don't recommend this:** B2's measurement is against the polluted calibration anchor. The delta you measure ("relevance went from 3.87 to 4.X") is a real number, but the meaning ("the judge thinks the product improved") is wobbly until D lands. You'll end up re-measuring B2's outcome after D anyway. Pick this only if you want to see the relevance number move first for momentum reasons.

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
| **Sub-project D spec (reframed)**  | **`docs/superpowers/specs/2026-05-22-calibration-reseed-design.md` — read first if you're picking up D**                                  |
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
