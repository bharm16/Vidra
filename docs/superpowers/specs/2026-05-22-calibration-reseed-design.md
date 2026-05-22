# Sub-project D — Calibration Reseed (Post-Harness-Rewrite) — Design Spec

**Date:** 2026-05-22
**Program:** Sub-project D of the [Measurement Program](../programs/measurement.md). Reframed from "span-labeling under-segmentation" after diagnostic investigation (2026-05-22) confirmed the apparent labeler bug was a calibration-data lineage artifact, not a labeler bug.
**Estimate:** ~1.5–2 hours (most of it is sequential subagent dispatches for labeling)
**Branch:** off `main`
**Feature flag:** none

---

## 0. Why

Sub-project A (2026-05-21) seeded the quality-judge calibration with 60 hand-scored events (20 per surface across optimize / suggestions / span-labeling) and measured Spearman ρ vs Claude labels: **optimize 0.787, suggestions 0.755, span-labeling 0.688**. Span-labeling missed the ρ ≥ 0.7 threshold; the working hypothesis was an under-segmentation product bug in the labeler.

The diagnostic investigation (2026-05-22, agent `a6c5046dcaf48639c`) refuted that hypothesis and proved a different one:

- `scripts/quality-judge/calibration/select-samples.ts:92,127` filters PostHog events with `timestamp > now() - INTERVAL 7 DAY`.
- The calibration was authored 2026-05-15 ~05:42 UTC; the 7-day lookback ended 2026-05-08.
- Commit `4bf218dd` ("drivers call live services via prod-aligned AIModelService factory") landed at 2026-05-14T23:16:39Z. Pre-`4bf218dd`, the synthetic harness emitted canned content via a `synthesizeSpans()` helper that did 3-word-window slicing with cycling category tags — bit-identical to the "window-fragment" outputs in span-labeling calibration entries 0-9.
- Post-`4bf218dd`, drivers call live LLM services via `AIModelService` and emit real content — entries 10-19 of the span-labeling calibration.
- Same hazard exists for optimize and suggestions: same sampler, same 7-day lookback, same authoring window.
- The pre-`4bf218dd` telemetry annotated events with `provider="gemini", model="gemini-2.5-flash"` even though no LLM was called. Provider/model attribution in PostHog for that window is fabricated.

Result: the labeler ρ gap (0.688) measures judge alignment with Claude on canned fake content, not on live labeler output. To know the actual labeler quality, calibration must be re-seeded from post-rewrite data and re-labeled.

This is **Layer 6** of the measurement-system false-signal pattern (1: canned harness; 2: rubric phantom-taxonomy; 3: calibration parallelization/dotenv; 4: regex/wordlist scorer classifiers; 5: fixture self-consistency; 6: **pre-rewrite synthetic-pool events polluting post-rewrite calibration sample**).

---

## 1. Locked architectural decisions

| Decision                          | Choice                                                                                                                                                  | Reason                                                                                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                             | Re-seed 3 calibrations + re-label + re-measure ρ + program-doc update. No labeler code change. No telemetry-schema change.                              | The original Sub-project D framing assumed a labeler bug. There isn't one. Adding telemetry discriminators (F1) or backfilling historical events (F2) are deferred to their own brainstorm cycles per user's locked scope.                                                          |
| Cutoff mechanism                  | Named constant `MIN_EVENT_TIMESTAMP = "2026-05-14T23:16:39Z"` in `select-samples.ts`. Applied as AND clause in both HogQL queries.                      | Defense-in-depth against future operators re-running the sampler at a different calendar date. The existing `INTERVAL 7 DAY` window stays — the constant is a floor, not a replacement.                                                                                             |
| Suggestions era boundary handling | 7-day window, mixed v1/v2-engine sample.                                                                                                                | Sub-project B's scene-summary work shipped 2026-05-21. Pure-v2 sample would have <24h of traffic and likely fail the 20-event minimum. Mixed sample calibrates the judge against "what the suggestions surface currently produces broadly," which is sufficient for ρ verification. |
| Labeling method                   | One subagent per surface dispatches 20 labels. Same pattern as Sub-project A.                                                                           | Sub-project A established this works. 60 sequential hand-labels would be ~2h of focused Claude judgment, parallelizable across subagent dispatches.                                                                                                                                 |
| Label leakage prevention          | Labeling subagents see ONLY the rubric prose + the 20 stub entries. No access to the prior calibration JSONs, no judge scores, no surface-level priors. | Labels must be Claude-vs-rubric, not Claude-vs-prior-Claude. Matches Sub-project A's discipline.                                                                                                                                                                                    |
| Success criterion                 | New ρ values recorded for all 3 surfaces. NOT a success criterion: ρ ≥ 0.7.                                                                             | If post-pollution-fix ρ is still < 0.7 for any surface, that surfaces a different real issue (rubric drift, judge instability, residual labeler quality) worth its own sub-project. Conflating "pollution removed" with "ρ acceptable" was the original mistake.                    |
| Old calibration data              | Overwritten in place; preserved in git history.                                                                                                         | Git history is sufficient audit. Keeping side-by-side files would invite future drift between "old" and "new" with no clear authority.                                                                                                                                              |
| Re-running judge on new sample    | Out of scope. The new calibration JSONs are anchors for the calibration runner only — not inputs to `run-judge.ts`.                                     | `run-judge.ts` operates on PostHog `<surface>.completed` events, not on calibration files. The calibration data is read only by `run-calibration.ts`.                                                                                                                               |
| Recording new ρ                   | One commit message line OR a single new entry in the program doc Reordering log under 2026-05-22.                                                       | Standard pattern for measurement-program findings.                                                                                                                                                                                                                                  |

---

## 2. What changes

### `scripts/quality-judge/calibration/select-samples.ts`

Add the constant near the top (after the env-var checks, before the type definitions):

```ts
/**
 * Excludes pre-harness-rewrite synthetic-pool events. Commit 4bf218dd
 * (2026-05-14T23:16:39Z) replaced canned synthesizeSpans/optimize/suggestions
 * helpers with live AIModelService calls. Events emitted before that
 * timestamp annotate themselves with provider/model fields but their content
 * is fake. See docs/superpowers/programs/measurement.md reordering log
 * 2026-05-22 entry.
 */
const MIN_EVENT_TIMESTAMP = "2026-05-14T23:16:39Z";
```

Modify `fetchScoredRows` (line 87):

```ts
const q = `
  SELECT properties.scoredEventId AS scoredEventId, toFloat(properties.totalScore) AS totalScore
  FROM events
  WHERE event = 'quality.scored'
    AND properties.surface = '${surface}'
    AND timestamp > now() - INTERVAL 7 DAY
    AND timestamp > '${MIN_EVENT_TIMESTAMP}'
  ORDER BY timestamp DESC
  LIMIT 500
`;
```

Modify `fetchSourceRows` (line 122):

```ts
const q = `
  SELECT toString(uuid) AS uuid, properties
  FROM events
  WHERE event = '${eventName}'
    AND toString(uuid) IN (${quotedUuids})
    AND timestamp > now() - INTERVAL 7 DAY
    AND timestamp > '${MIN_EVENT_TIMESTAMP}'
`;
```

### Calibration JSON files (overwritten by re-running `select-samples.ts`)

- `scripts/quality-judge/calibration/span-labeling.calibration.json`
- `scripts/quality-judge/calibration/optimize.calibration.json`
- `scripts/quality-judge/calibration/suggestions.calibration.json`

Each will contain 20 stub entries with `humanScore: 0`, `humanDimensions: {}`, `humanNotes: "TODO: label me"`, `authoredBy: "claude"`, `authoredAt: <fresh ISO date>`.

### Labeling subagent dispatches

Three sequential subagent invocations, one per surface. Each receives:

- The rubric prose: `scripts/quality-judge/rubrics/<surface>.md`
- The 20 stub entries for that surface
- The rubric version string from `rubricVersionFor(surface)`
- Instructions matching Sub-project A's labeling protocol

Output: 20 fully-labeled entries (5-dimension breakdown + total + notes) written back to the surface's calibration JSON.

### `npm run judge:calibrate`

Run after all 60 labels are in place. Emits the new ρ values.

### Measurement Program doc

Add Reordering log entry under 2026-05-22 documenting Layer 6.

---

## 3. What does NOT change

- Labeler code (`server/src/llm/span-labeling/`): no changes. The investigation refuted the labeler-bug hypothesis.
- Telemetry event schemas: no `harnessVersion` or `source: "synthetic-pool"` field added. Deferred to F1 brainstorm if it earns its keep.
- Historical PostHog events: not modified, not deleted. The cutoff constant ensures the calibration sampler ignores them; other consumers (dashboards) still see them and would need their own filters. Deferred to F2.
- Rubric files: no changes. The original rubrics already produced the 0.787 / 0.755 / 0.688 ρ values on polluted data, which means they're not the dominant source of disagreement.
- `run-judge.ts`: no changes (the judge runner reads from PostHog, not from calibration JSONs).
- `run-calibration.ts`: no changes (still computes Spearman ρ the same way; just reads new data).

---

## 4. Risks and mitigations

| Risk                                                                                                                            | Mitigation                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Re-seeded sample has <20 events for some surface (low traffic in the cleaner window).                                           | `selectForSurface` throws at line 142 with a clear message. If hit, expand window to 14 days OR accept the sampler's actual count and adjust the threshold. Either is acceptable for minimal-scope completion.                                         |
| Labeling subagent inadvertently sees the prior calibration JSON and reproduces its labels.                                      | Each dispatch's prompt explicitly excludes the prior file. The dispatch passes only the stubs (post-sampler output) and the rubric prose.                                                                                                              |
| New ρ is still < 0.7 for span-labeling (or any surface).                                                                        | This is an acceptable outcome per § 1 ("Success criterion"). Surface it in the program doc Reordering log entry and open a follow-up sub-project for the real issue. Do NOT keep re-labeling or re-sampling to chase a target.                         |
| The `MIN_EVENT_TIMESTAMP` constant becomes dead code in 6 months (when all events are post-cutoff).                             | Acceptable. The comment documents why it exists. A future reader either keeps it (defense-in-depth) or removes it with intent.                                                                                                                         |
| Labeling subagents disagree more with each other than the original Sub-project A labelers did.                                  | Out of scope for Sub-project D. If observed in the new ρ values (e.g., ρ drops below original 0.787 on optimize), that opens a "labeler stability" question for separate triage.                                                                       |
| New labels are subtly different from old (Claude has access to more rubric context now than in Sub-project A).                  | Acknowledged. The new labels are the new ground truth. The point of re-seeding is to anchor the judge against current understanding of the rubric, not to reproduce prior anchors.                                                                     |
| Optimize/suggestions calibrations are NOT polluted (the investigation inferred by sampler/timestamp logic, didn't verify each). | Re-seed all 3 surfaces unconditionally. The investigation's inference is strong (same sampler, same lookback, same authoring window), and the cost of re-labeling a not-strictly-needed surface is ~30 min, less than the cost of branching the scope. |

---

## 5. Success criteria

- [ ] `MIN_EVENT_TIMESTAMP` constant added to `select-samples.ts` with explanatory comment.
- [ ] `select-samples.ts` runs to completion with the new filter and overwrites all three calibration JSONs with post-`4bf218dd` event stubs.
- [ ] All 60 stubs are labeled (humanScore, humanDimensions, humanNotes) by Claude-via-subagent without seeing prior calibration data.
- [ ] `npm run judge:calibrate` produces new ρ values for all three surfaces. Values recorded in the commit message OR in the program-doc Reordering log entry.
- [ ] Measurement Program doc has a new 2026-05-22 entry documenting Layer 6, the investigation that surfaced it, and the new ρ values.
- [ ] If any surface still has ρ < 0.7 after re-seeding, the program-doc entry explicitly names that as a follow-up sub-project (don't silently re-fold it into D).

---

## 6. Self-review checklist

(Filled inline during spec self-review.)

- [x] No "TBD" placeholders or vague requirements.
- [x] Scope is locked at "minimal" per user's 2026-05-22 selection.
- [x] Architecture matches the diagnostic finding (data-lineage fix, not labeler fix).
- [x] Out-of-scope items explicitly listed (§ 3): labeler code, telemetry schemas, historical events, rubrics.
- [x] No ambiguity: every change is named with file path + insertion point + exact code shape.
- [x] Pre-commit hook requirements: this is a `refactor` / `docs` change (sampler code + JSON regen + doc update). Not a `fix:` commit; no regression-test requirement to satisfy.
- [x] No-regex rule: the only string interpolation in the new code (`${MIN_EVENT_TIMESTAMP}`) is template-literal substitution into a HogQL query, not a regex.
- [x] Never-invent-provider/model: no model identifiers touched.

---

## 7. Out of scope (explicit non-goals)

- ❌ Adding a labeler fix to address apparent under-segmentation (no labeler bug exists — investigation refuted this).
- ❌ Adding a `harnessVersion` or `source: "synthetic-pool"` discriminator field to operational events. (F1; deferred to its own brainstorm if it earns its keep.)
- ❌ Backfilling, deleting, or marking historical pre-`4bf218dd` PostHog events. (F2; deferred.)
- ❌ Re-running the judge with the new calibration data. Judge reads PostHog events, not calibration JSONs.
- ❌ Iterating rubric prose to push ρ up. The rubric is not the dominant disagreement source on polluted data; whether it is on clean data is a separate question.
- ❌ Adding new dashboards or alerts. Sub-project #4's job.
- ❌ Treating ρ ≥ 0.7 as a success criterion. The point of re-seeding is to measure clean ρ, not to engineer toward a target.
