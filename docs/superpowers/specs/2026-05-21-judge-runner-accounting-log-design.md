# Judge Runner Accounting Log — Design Spec

**Date:** 2026-05-21
**Program:** Sub-project E follow-up of the [Measurement Program](../programs/measurement.md)
**Estimate:** 1 commit (~30 min)
**Branch:** off `main`
**Feature flag:** none

---

## 0. Why

Sub-project E's end-to-end verification (Task 8) surfaced a behavioral problem in `npm run judge:run`: when invoked twice in close succession by a human operator, run 2 emits duplicate `quality.scored` events for the same source UUIDs. The data-level cause is PostHog ingestion lag — run 1's `quality.scored` emissions are buffered/in-flight when run 2's `fetchAlreadyScoredIds` query executes, so the dedup `seen` set is incomplete and run 2 re-scores the same events.

The root _trigger_ is not the race itself; it's that the runner's stdout looks identical to a hung process during the success path. The operator sees `[quality-judge] running for ${surface}` and then nothing for minutes, decides the prior invocation failed silently, and re-runs the command — which is what produces the race.

The Sub-project E reordering log committed to "a one-line 'scored N events' log so the operator knows the first call drained the queue." This spec implements that with detailed accounting (the form chosen during brainstorm 2026-05-21) and adds a regression test.

---

## 1. Locked architectural decisions

| Decision                  | Choice                                                                                                                                        | Reason                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope                     | Operator-visible behavior only. No lock files, no data-level dedup.                                                                           | Race is operator-triggered (cron is once daily); fixing the social trigger is sufficient and proportional.                                                         |
| Log placement             | End of `runJudgeForSurface`, before `emitter.shutdown()` in the `finally` block.                                                              | Matches existing `[quality-judge] ${surface}: no events to score.` placement at line 55.                                                                           |
| Log content               | Five counts: `fetched`, `scored`, `alreadyScored`, `nonJudgeable`, `failed`.                                                                  | Makes all silent paths visible — including the "fetched > 0 but scored = 0" cases (all already-scored, all non-judgeable) which currently produce zero log output. |
| Format function           | Pure `formatRunSummary(counts, surface)` at module scope, returns string.                                                                     | Pure transforms are table-test-friendly; matches V2CandidateScorer pattern (37-test rewrite cited in 2026-05-14 Reordering log as bugs-caught-at-write-time).      |
| Counter accumulation      | Local `counts` object inside `runJudgeForSurface`, mutated in the loop.                                                                       | Single function, low complexity. No need to extract — branches stay co-located with the events that increment them.                                                |
| Empty-fetch behavior      | Unchanged. Existing `events.length === 0` early-return + `"no events to score."` log stays.                                                   | Symmetric with the new non-zero log. No double-logging.                                                                                                            |
| Failure counter           | Incremented in the existing per-event `catch` block.                                                                                          | Already warn-logs at lines 96-100. The accounting summary adds the rollup count alongside the existing per-event warns.                                            |
| Tests                     | Two new tests in `__tests__/run-judge.smoke.test.ts` + a separate pure-formatter test file.                                                   | Smoke test pins the regression invariant; formatter unit tests pin the format-string output across the five outcome shapes.                                        |
| Regression test invariant | "When `runJudgeForSurface` returns successfully and `events.length > 0`, a log line containing `${surface}: N fetched` is emitted to stdout." | Operator-visible behavior pin; satisfies the pre-commit hook's `fix:` commit requirement.                                                                          |

---

## 2. What changes

### `scripts/quality-judge/run-judge.ts`

Add at module scope (before `runJudgeForSurface`):

```ts
export interface RunSummaryCounts {
  fetched: number;
  scored: number;
  alreadyScored: number;
  nonJudgeable: number;
  failed: number;
}

export function formatRunSummary(
  counts: RunSummaryCounts,
  surface: QualityScoredSurface,
): string {
  return `[quality-judge] ${surface}: ${counts.fetched} fetched, ${counts.scored} scored, ${counts.alreadyScored} already-scored, ${counts.nonJudgeable} non-judgeable, ${counts.failed} failed.`;
}
```

Inside `runJudgeForSurface`, after `events.length === 0` early-return, initialize counter:

```ts
const counts: RunSummaryCounts = {
  fetched: events.length,
  scored: 0,
  alreadyScored: 0,
  nonJudgeable: 0,
  failed: 0,
};
```

Inside the for-loop, increment at each branch:

```ts
for (const event of events) {
  if (seen.has(event.uuid)) {
    counts.alreadyScored++;
    continue;
  }
  if (!isJudgeable(event, surface)) {
    counts.nonJudgeable++;
    continue;
  }
  // ... existing judge call ...
  try {
    // ... existing runJudge + emitter.emit ...
    counts.scored++;
  } catch (err) {
    counts.failed++;
    // ... existing warn ...
  }
}
```

After the loop closes, before `finally`:

```ts
// eslint-disable-next-line no-console
console.log(formatRunSummary(counts, surface));
```

### New test file: `scripts/quality-judge/__tests__/format-run-summary.test.ts`

Table-driven across the five outcome shapes:

1. All scored: `{fetched: 10, scored: 10, alreadyScored: 0, nonJudgeable: 0, failed: 0}` → `"... 10 fetched, 10 scored, 0 already-scored, 0 non-judgeable, 0 failed."`
2. All already-scored: `{fetched: 10, scored: 0, alreadyScored: 10, nonJudgeable: 0, failed: 0}`
3. All non-judgeable: `{fetched: 10, scored: 0, alreadyScored: 0, nonJudgeable: 10, failed: 0}`
4. All failed: `{fetched: 10, scored: 0, alreadyScored: 0, nonJudgeable: 0, failed: 10}`
5. Mixed (1 of each + 6 scored): `{fetched: 10, scored: 6, alreadyScored: 2, nonJudgeable: 1, failed: 1}`

Plus invariant assertion: `counts.scored + counts.alreadyScored + counts.nonJudgeable + counts.failed === counts.fetched`.

### Addition to `scripts/quality-judge/__tests__/run-judge.smoke.test.ts`

New test: `"emits accounting summary log for non-zero fetched"`.

- Mock `fetchEventsMock` to return 3 events
- Mock `fetchScoredMock` to return `new Set(["e1"])` (1 already-scored)
- Event `e2` has `outputContent` empty (non-judgeable)
- Event `e3` is judgeable; `judgeMock` resolves successfully
- Spy on `console.log` via `vi.spyOn`
- Run `runJudgeForSurface`
- Assert one log call contains `"optimize: 3 fetched, 1 scored, 1 already-scored, 1 non-judgeable, 0 failed."`

---

## 3. What does NOT change

- Event schemas (no `quality.scored` shape change)
- The `seen` dedup mechanism (still uses `fetchAlreadyScoredIds` — race window remains; the fix targets the trigger, not the race)
- Per-event warn-logs on judge failure (kept; the accounting log is additive)
- Empty-fetch early-return log (kept verbatim)
- Cron config (`quality-judge.yml`); no schedule change

---

## 4. Risks and mitigations

| Risk                                                             | Mitigation                                                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Counter drift (sum ≠ fetched) on future code edits.              | Formatter test asserts the invariant; smoke test asserts the format-string content.                                                                                       |
| The race itself is not fixed — duplicate scores remain possible. | Acknowledged. Out of scope per § 1 ("Scope"). Documented here so the gap is visible to future reviewers.                                                                  |
| Tests rely on `console.log` spying (brittle).                    | Smoke-test brittleness limited to the one new assertion. Pure-formatter tests do all the format-string verification without spying.                                       |
| `formatRunSummary` exported but consumed only internally.        | `export` is required for the pure-formatter test file to import it. Acceptable export surface for a logging helper that may be reused by other quality-judge entrypoints. |

---

## 5. Success criteria

- [ ] `npm run judge:run --surface=optimize` produces an end-of-run line of the form `[quality-judge] optimize: N fetched, M scored, K already-scored, J non-judgeable, F failed.` when `N > 0`.
- [ ] `npm run judge:run --surface=optimize` produces the existing `"no events to score."` line when `N === 0` (no behavioral change).
- [ ] All five formatter test cases pass.
- [ ] New smoke test passes; existing four smoke tests still pass.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npx eslint --config config/lint/eslint.config.js scripts/quality-judge --quiet` exits 0.

---

## 6. Self-review checklist

(Filled inline during spec self-review per brainstorming skill.)

- [x] No "TBD" placeholders or vague requirements.
- [x] Architecture matches the intent stated in § 0 (operator-visible behavior, not data-level race fix).
- [x] Scope sized to a single commit; no multi-step decomposition needed.
- [x] No ambiguity: every change is named with file path + insertion point + exact code shape.
- [x] Out-of-scope items explicitly listed (§ 3).
- [x] Pre-commit hook requirements addressed (regression test included).
