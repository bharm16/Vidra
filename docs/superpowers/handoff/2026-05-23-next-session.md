# Measurement Program — Next-Session Handoff (2026-05-23)

You are picking up the Vidra Measurement Program at a clear pause point. This doc is self-contained — read it top-to-bottom and you'll know what shipped this session, what the data actually established, what NOT to do, and what to do next.

**Canonical program doc:** [`docs/superpowers/programs/measurement.md`](../programs/measurement.md) — the reordering log there is the audit trail for every prior decision and is more authoritative than this handoff if they disagree.

**Important update vs. the 2026-05-22 handoff:** The C-arc (C1 through C8 + revert) is now closed. Sub-projects D and Layer 6 are confirmed shipped. F5 telemetry rollout is now end-to-end (judge events stamped at 100%). The remaining-work picture has narrowed substantially.

---

## TL;DR — What state are you in?

The Measurement Program has effectively settled. The C-arc (8 sub-projects of optimize-surface iteration) reached a clean negative conclusion: the dimension it was targeting (`fidelity`) is already at ceiling (4.82/5), and the proxy metric we were chasing (aperture preservation) has zero variance and no judge-score correlation. The actual remaining lever on optimize is `brevityDiscipline` (4.10/5, 0.90 gap, ~58% of all available room on this surface).

| Sub-project                                 | Status                                                  | Note                             |
| ------------------------------------------- | ------------------------------------------------------- | -------------------------------- |
| #0 Eval Visibility                          | ✅ shipped                                              |                                  |
| #1 Source Discriminator + Synthetic Harness | ✅ shipped                                              |                                  |
| #3 LLM Judge Framework                      | ✅ shipped                                              |                                  |
| Layer 5 fixture fix                         | ✅ shipped                                              |                                  |
| A Calibration seeding                       | ✅ partial pass + reseeded under D                      |                                  |
| B / B2 / B3 Suggestions work                | ✅ shipped (B2 +20.6pp emission, B3 templates expanded) |                                  |
| C / C2-C8 Optimize tail-truncation          | ✅ closed (negative finding)                            | See § C-arc retrospective below  |
| **D Calibration reseed (Layer 6)**          | ✅ shipped 2026-05-22                                   | new ρ recorded honestly          |
| **D2 Calibration multi-axis metrics**       | ✅ shipped 2026-05-22                                   | ρ + MAE + ceilingPct + humanMean |
| **E Matrix infrastructure**                 | ✅ shipped 2026-05-21                                   |                                  |
| **F2 Liveness signal**                      | ✅ shipped 2026-05-23                                   |                                  |
| **F5 harnessVersion stamping**              | ✅ shipped + rolled out 2026-05-23                      | 100% coverage on judge events    |
| **F6 Pre-rewrite event period**             | ✅ documented 2026-05-22                                |                                  |

**Recommended next move:** see [§ Recommended sequence](#recommended-sequence). Short version: pick from three roughly-equal directions — brevityDiscipline experiment, fresh surface (suggestions/span-labeling further work), or measurement-infrastructure hardening. The C-arc is closed; do NOT reopen aperture preservation.

---

## What shipped 2026-05-23 (this session)

### F5 rollout — judge events now stamped (commit `332434b6`)

PostHog audit found a quiet architectural gap: `quality.scored` events were at 0% `harnessVersion` coverage across 265 events. Root cause: `scripts/quality-judge/run-judge.ts` emits via `scripts/evaluation/posthog-emitter.ts`, which constructed its own `posthog-node` client and bypassed `PostHogClient.capture()` (where F5's central stamping lived). The judge runs as a separate process from the server, so the server-side stamping never applied.

Fix:

1. Extracted `resolveHarnessVersion()` from `PostHogClient.ts` into [`server/src/infrastructure/harnessVersion.ts`](../../../server/src/infrastructure/harnessVersion.ts) — single resolver guarantees both emitters agree on process build identity.
2. Imported the resolver into `posthog-emitter.ts` and stamped on every emit. Caller-supplied properties take precedence (override channel matches PostHogClient pattern).

Verification: 67/67 → 100/100 → 119/119 `quality.scored` events stamped with `'332434b6'` across the session's three judge runs. Tests added covering both stamping and override.

**Why this matters going forward:** every dimensional analysis you do from here on can filter by `harnessVersion` to attribute scores to specific code builds. No more "is this delta the change or just drift over time" ambiguity. This is the cleanest attribution lever shipped on the program so far.

### C-arc closed (commit `fd4ffa8d` shipped + `f7cb2424` revert)

C8 added a `PRESERVE technical specs from the IR ... you MUST include those exact values` directive to `buildBaseHeader` in [promptStrategyUtils.ts](../../../server/src/services/video-prompt-analysis/services/rewriter/strategies/promptStrategyUtils.ts). Initial n=20 read showed total score -0.85 from baseline, brevityDiscipline 4.04 → 3.80, so I reverted.

Follow-up n=19 read on the revert showed total score -1.16 from baseline — _worse_ than C8. Both reads sit in the n=20 noise band (95% CI ≈ ±0.8 at this sample size).

**The C-arc reaches a clean negative conclusion when you aggregate the n=263 data:**

1. **Aperture preservation is a vanity metric.** Across 263 events, `f/X` token appeared in output 0 times. Cannot be A/B tested because no contrast group exists. The judge dim that maps to it (`fidelity`) is at 4.82/5 — judge does not penalize the substitution.

2. **`brevityDiscipline` is the actual ceiling.** Dimensional breakdown (n=263):

   | dim                   | score    | gap from 5.0                          |
   | --------------------- | -------- | ------------------------------------- |
   | detailEnrichment      | 4.98     | 0.02                                  |
   | fidelity              | 4.82     | 0.18                                  |
   | constraintCompliance  | 4.82     | 0.18                                  |
   | coherence             | 4.73     | 0.27                                  |
   | **brevityDiscipline** | **4.10** | **0.90** (~58% of all available room) |

3. **Brevity vs tech-spec preservation are in direct competition.** Per-strategy word budgets are _prompt-text_ limits the LLM self-enforces, not `max_tokens` (which is 8192):
   - `Wan22PromptStrategy`: 35-55 words (never exceed 55)
   - `Veo4PromptStrategy`: 40-120 words
   - `Sora2PromptStrategy`: 60-120 words
   - `Kling26PromptStrategy`: 40-80 words

   When the IR is rich, 60 words can't carry everything. The LLM chooses cinematography prose over tech-spec preservation — because prose lifts coherence/craft dimensions the judge weights, while dropped tech specs don't penalize fidelity.

**The discipline lesson encoded:** minimum n=60 per commit before claiming a directional effect on this surface. At n=20, expected 95% CI ≈ ±0.8 on total score — wider than most plausible changes. The C8/revert flip-flop is a worked example of why the project's own 60-event calibration norm exists.

---

## What you should know before you start

These principles were earned 2026-05-21 through 2026-05-23. Read them. The same false-signal class will bite again if you don't.

1. **n=20 reads are screening signals, not verdicts on this surface.** The C8/revert flip-flop happened because I treated an n=20 read as a verdict. The follow-up n=19 read on the revert (worse than C8) was the giveaway. With stddev ≈1.73 on optimize totals, expected SE at n=20 is ~0.4 and 95% CI is ±0.8. Anything within ±0.8 of baseline is undetermined until you accumulate n≥60.

2. **Aperture preservation on optimize is closed.** Do NOT reopen. The dim that would map to it (`fidelity` at 4.82/5) is already at ceiling, and the metric itself has zero variance in n=263. The C-arc spent 8 sub-projects proving this. If you have a new hypothesis about tech-spec preservation, run the dimensional join query FIRST to confirm the target dim has room before iterating.

3. **The PRESERVE-style directive antipattern.** Telling the LLM to MUST include certain phrases under tight word budgets backfires — it attempts the phrase, runs out of budget, and produces fragments. C8 demonstrated this mechanism cleanly. Future budget-or-content directives need to acknowledge the tradeoff explicitly (e.g., "if you must drop content to stay under N words, drop ornamental adjectives before tech specs").

4. **Centralized telemetry resolvers > per-emitter duplication.** F5's original design stamped only in `PostHogClient.capture()`; the judge emitter bypassed it. Single-source resolver in `harnessVersion.ts` solved it. Watch for similar gaps when shipping new event sources — any process that creates its own `posthog-node` client must import the shared resolver.

5. **Carry-forward principles from the 2026-05-22 handoff still hold** (re-read [there](2026-05-22-next-session.md#what-you-should-know-before-you-start) for the canonical list): never invent LLM provider/model values, no regex anywhere, measurement tooling in two places must read from the same env vars, e2e verification surfaces bug classes unit tests can't catch, subprocess isolation > in-process env mutation, Vidra is pre-launch with zero users, trust user env-file claims, no Claude attribution, always recommend with every question, calibration samples can span product versions silently.

---

## Tools you have that prior sessions didn't

### F5 telemetry stamping is now end-to-end

Every PostHog event from the server OR the judge process carries `properties.harnessVersion`. Query pattern:

```sql
SELECT properties.harnessVersion AS sha, count() AS n,
       round(avg(toFloat(JSONExtractRaw(properties.dimensions, 'brevityDiscipline'))), 2) AS brevity
FROM events
WHERE event = 'quality.scored' AND properties.surface = 'optimize'
  AND timestamp > now() - INTERVAL 24 HOUR
GROUP BY sha ORDER BY brevity DESC
```

Use this to attribute any future per-dimension delta to specific commits. The `harnessVersion` is set from `git rev-parse --short HEAD` at process start (or `HARNESS_VERSION` env if set), so each matrix-run subprocess gets stamped with the current build automatically.

### CTE-based join pattern for HogQL

The naive join `quality.scored INNER JOIN events ON scoredEventId = uuid` times out at PostHog cardinality. The working pattern is in [`scripts/synthetic/report-matrix.ts:96-142`](../../../scripts/synthetic/report-matrix.ts) — pre-filter both sides in CTEs before joining. Reuse this shape for any future dim-by-commit or dim-by-variant analysis.

---

## Open work — three roughly-equal directions

The C-arc is closed and the measurement infrastructure is in good shape. What's left is genuinely a choice of direction, not a forced sequence.

### Direction 1: brevityDiscipline experiment (the natural C-arc successor)

**Why it matters:** brevityDiscipline at 4.10/5 carries 58% of all available judge-score room on optimize. If you can move it 0.3-0.5 points, total moves 0.3-0.5 → meaningful product quality lift.

**Three approach families** (pick one in brainstorm):

A. **Loosen per-strategy word limits.** Cheapest to try (edit four template files, raise upper bound). Risk: video models (Sora, Veo, Kling, Luma) may truncate themselves on overlong prompts, losing intent at a different layer. Verify by sampling actual video-model outputs on long vs short prompts.

B. **Explicit budget-prioritization guidance.** Add directive like "if you must drop content to stay under N words, drop ornamental adjectives before tech specs." Tests the prompt-engineering ceiling at this surface — may hit the same structural-preference wall C8 hit.

C. **Reduce IR ornament density upstream.** The IR carries subject + action + camera + lens + lighting + audio + style + motion — that's a lot to compress into 60 words. Investigate whether the IR-extraction step is including ornament that the compile step then has to discard. May be a cleaner architectural fix.

**Verification protocol:** matrix three times on the same SHA to accumulate n≥60, then judge, then dim-by-commit join. Do NOT commit-flip on a single n=20 read.

**Estimated effort:** A is ~half day; B is ~half day; C is ~1-2 days (touches more code).

### Direction 2: Push other surfaces

Optimize at 23.44/25 is high; the remaining 1.56 points spread across 4 of 5 dims at ≥4.73/5. The other two surfaces may have more headroom:

- **Suggestions (post-B3 baseline)** — verify the diversity-collapse fix held over n≥60; check if `qualityRange` dim moved.
- **Span-labeling** — D's reseed showed mean 22.9 with 50% at ceiling (25/25). The remaining 10/20 below-ceiling entries are where any future lift would have to come from. Investigate whether they're labeler edge cases or rubric-interpretation drift.

**Estimated effort:** ~half day to characterize either surface's room before deciding to ship anything.

### Direction 3: Measurement-infrastructure hardening

The session surfaced that the F5 rollout was a hidden architectural gap nobody had spotted. There may be more:

- **Survey all PostHog event emitters** (not just the judge) for ones that bypass `PostHogClient.capture()`. Anything that creates its own `posthog-node` client is a candidate gap.
- **Add a CI lint** that rejects new `new PostHog(...)` calls outside of `PostHogClient.ts` and the shared judge emitter, forcing future telemetry through the central path.
- **Dashboard the dim-by-commit query** so you don't have to remember to run it manually after each commit.

**Estimated effort:** ~half day each.

---

## Recommended sequence

If you want a default to do without thinking too hard: **Direction 1A first** (loosen per-strategy word limits — cheapest test of the brevityDiscipline hypothesis), measured at n≥60, then decide based on data whether to continue Direction 1B/C or pivot.

Reasoning: brevityDiscipline is the highest-leverage gap on the surface where you have the best measurement infrastructure. Direction 1A is the smallest possible change that could move it — if it moves the metric, you've found the real lever; if it doesn't, you've ruled out the cheap option and graduated to the architecturally cleaner Direction 1C.

**Anti-pattern (don't do):**

- Don't reopen aperture preservation. It's been proven a vanity metric across 263 events.
- Don't ship a directive change based on a single n=20 read. The C8/revert flip-flop was a worked example of why.
- Don't add new optimize surface directives without first checking whether the dimension you intend to lift has room (run dim breakdown first).

---

## Pointers — where everything lives

| What                                                     | Path                                                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Measurement Program canonical doc                        | `docs/superpowers/programs/measurement.md`                                                                                       |
| **Previous handoff (still relevant for principle list)** | `docs/superpowers/handoff/2026-05-22-next-session.md`                                                                            |
| Sub-project D spec                                       | `docs/superpowers/specs/2026-05-22-calibration-reseed-design.md`                                                                 |
| Sub-project B2 spec                                      | `docs/superpowers/specs/2026-05-22-suggestions-imperative-scene-summary.md`                                                      |
| Sub-project B3 spec                                      | `docs/superpowers/specs/2026-05-22-suggestions-diversity-design.md`                                                              |
| Sub-project C / camera_lens slot                         | `docs/superpowers/specs/2026-05-22-optimize-camera-lens-slot-design.md`                                                          |
| Synthetic harness                                        | `scripts/synthetic/`                                                                                                             |
| Variant presets                                          | `scripts/synthetic/variants.ts`                                                                                                  |
| Matrix orchestrator                                      | `scripts/synthetic/run-matrix.ts`                                                                                                |
| Matrix report                                            | `scripts/synthetic/report-matrix.ts`                                                                                             |
| Quality judge                                            | `scripts/quality-judge/run-judge.ts`                                                                                             |
| Calibration                                              | `scripts/quality-judge/calibration/run-calibration.ts` + `*.calibration.json`                                                    |
| Eval emitter (now stamps harnessVersion)                 | `scripts/evaluation/posthog-emitter.ts`                                                                                          |
| PostHog client (server-side)                             | `server/src/infrastructure/PostHogClient.ts`                                                                                     |
| **harnessVersion resolver (new)**                        | `server/src/infrastructure/harnessVersion.ts`                                                                                    |
| Optimize compile step (where C8 lived)                   | `server/src/services/video-prompt-analysis/services/rewriter/strategies/promptStrategyUtils.ts`                                  |
| Per-model word-budget strategies                         | `server/src/services/video-prompt-analysis/services/rewriter/strategies/{Sora2,Veo4,Wan22,Kling26,Luma,Runway}PromptStrategy.ts` |

## Key commits to scan if you want context fast

```
f7cb2424  Revert C8 (this session — the n=20 flip-flop)
332434b6  F5 rollout — harnessVersion on judge events (this session)
fd4ffa8d  C8 PRESERVE directive (this session — reverted)
61f7ebc0  D2: ρ + MAE + humanMean + ceilingPct (2026-05-22)
59be7c66  D: calibration reseed after Layer 6 (2026-05-22)
970f6122  F5: stamp harnessVersion onto every captured event (2026-05-23 early)
eb52a0eb  F2: judge liveness signal (2026-05-23 early)
4bf218dd  The harness rewrite that Layer 6 was about (2026-05-14 — historical context)
```

`git log --oneline | head -30` from current HEAD shows the recent arc.

---

## How to start your session

1. Read this doc top-to-bottom.
2. Re-read the [2026-05-22 handoff](2026-05-22-next-session.md) for principles + tools (the carry-forward content is still valid; this doc layers on what's new).
3. Skim the new reordering-log entry at the bottom of `docs/superpowers/programs/measurement.md` for the C-arc closure + F5 rollout details.
4. Pick a direction from [§ Open work](#open-workthree-roughly-equal-directions) — default to Direction 1A if you don't have strong preferences.
5. Brainstorm with the user before implementing (`superpowers:brainstorming`), then `superpowers:writing-plans`, then implement.
6. **n≥60 per commit** before claiming a directional effect. This is non-negotiable on optimize.
