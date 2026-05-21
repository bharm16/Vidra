# Judge Runner Accounting Log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the silent-stdout success path in `npm run judge:run` that tempts human operators to re-invoke and trigger duplicate `quality.scored` emissions via PostHog ingestion lag.

**Architecture:** Two TDD cycles. (1) Add a pure `formatRunSummary(counts, surface)` helper with table-driven unit tests. (2) Wire five counters into the existing for-loop in `runJudgeForSurface`, emit the formatted line at end-of-try, pin the regression with a smoke test that spies on `console.log`.

**Tech Stack:** Vitest, tsx, ESM TypeScript. No new dependencies.

**Spec:** [`2026-05-21-judge-runner-accounting-log-design.md`](../specs/2026-05-21-judge-runner-accounting-log-design.md)

---

## File map

| Path                                                         | Op     | Responsibility                                                                                                                         |
| ------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/quality-judge/run-judge.ts`                         | modify | Add `RunSummaryCounts` type + `formatRunSummary` pure helper; thread counters through the existing loop; emit log at end of try block. |
| `scripts/quality-judge/__tests__/format-run-summary.test.ts` | create | Table-driven unit tests for `formatRunSummary` across 5 outcome shapes + sum-invariant assertion.                                      |
| `scripts/quality-judge/__tests__/run-judge.smoke.test.ts`    | modify | Add one new test that asserts the accounting log line is emitted by `runJudgeForSurface` when fetched > 0.                             |

No `shared/`, no DI, no routes, no services touched. Integration Test Gate does not apply.

---

## Task 1: Write failing pure-formatter test

**Files:**

- Create: `scripts/quality-judge/__tests__/format-run-summary.test.ts`

- [ ] **Step 1: Create the failing test file**

```ts
import { describe, it, expect } from "vitest";

import { formatRunSummary, type RunSummaryCounts } from "../run-judge.js";

const surface = "optimize" as const;

interface Row {
  name: string;
  counts: RunSummaryCounts;
  expected: string;
}

const rows: Row[] = [
  {
    name: "all scored",
    counts: {
      fetched: 10,
      scored: 10,
      alreadyScored: 0,
      nonJudgeable: 0,
      failed: 0,
    },
    expected:
      "[quality-judge] optimize: 10 fetched, 10 scored, 0 already-scored, 0 non-judgeable, 0 failed.",
  },
  {
    name: "all already-scored",
    counts: {
      fetched: 10,
      scored: 0,
      alreadyScored: 10,
      nonJudgeable: 0,
      failed: 0,
    },
    expected:
      "[quality-judge] optimize: 10 fetched, 0 scored, 10 already-scored, 0 non-judgeable, 0 failed.",
  },
  {
    name: "all non-judgeable",
    counts: {
      fetched: 10,
      scored: 0,
      alreadyScored: 0,
      nonJudgeable: 10,
      failed: 0,
    },
    expected:
      "[quality-judge] optimize: 10 fetched, 0 scored, 0 already-scored, 10 non-judgeable, 0 failed.",
  },
  {
    name: "all failed",
    counts: {
      fetched: 10,
      scored: 0,
      alreadyScored: 0,
      nonJudgeable: 0,
      failed: 10,
    },
    expected:
      "[quality-judge] optimize: 10 fetched, 0 scored, 0 already-scored, 0 non-judgeable, 10 failed.",
  },
  {
    name: "mixed: 6 scored, 2 already-scored, 1 non-judgeable, 1 failed",
    counts: {
      fetched: 10,
      scored: 6,
      alreadyScored: 2,
      nonJudgeable: 1,
      failed: 1,
    },
    expected:
      "[quality-judge] optimize: 10 fetched, 6 scored, 2 already-scored, 1 non-judgeable, 1 failed.",
  },
];

describe("formatRunSummary", () => {
  for (const row of rows) {
    it(`renders ${row.name}`, () => {
      expect(formatRunSummary(row.counts, surface)).toBe(row.expected);
    });
  }

  it("preserves sum invariant: scored + alreadyScored + nonJudgeable + failed === fetched", () => {
    for (const row of rows) {
      const sum =
        row.counts.scored +
        row.counts.alreadyScored +
        row.counts.nonJudgeable +
        row.counts.failed;
      expect(sum).toBe(row.counts.fetched);
    }
  });

  it("formats the surface name into the prefix", () => {
    const counts: RunSummaryCounts = {
      fetched: 1,
      scored: 1,
      alreadyScored: 0,
      nonJudgeable: 0,
      failed: 0,
    };
    expect(formatRunSummary(counts, "span-labeling")).toContain(
      "[quality-judge] span-labeling: ",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/quality-judge/__tests__/format-run-summary.test.ts`
Expected: FAIL — import error from `../run-judge.js` because `formatRunSummary` and `RunSummaryCounts` don't exist yet.

---

## Task 2: Implement `formatRunSummary` + commit Cycle 1

**Files:**

- Modify: `scripts/quality-judge/run-judge.ts:25` (insert before `RunJudgeOptions` interface)

- [ ] **Step 1: Add the type and helper to `run-judge.ts` at module scope**

Insert after the existing imports (after line 24) and before `export interface RunJudgeOptions`:

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

- [ ] **Step 2: Run formatter tests to verify they pass**

Run: `npx vitest run scripts/quality-judge/__tests__/format-run-summary.test.ts`
Expected: PASS — all 7 tests (5 table rows + sum invariant + surface prefix).

- [ ] **Step 3: Verify type-check still passes**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit Cycle 1**

```bash
git add scripts/quality-judge/run-judge.ts scripts/quality-judge/__tests__/format-run-summary.test.ts
git commit -m "$(cat <<'EOF'
fix(quality-judge): add formatRunSummary helper for end-of-run accounting

Pure formatter that renders a five-field accounting line
(fetched/scored/already-scored/non-judgeable/failed) for the judge
runner. Exported so Task 2 in this fix can call it from
runJudgeForSurface, and so future quality-judge entrypoints can reuse
the same format. Table-driven unit tests pin the format string and
the sum invariant.

Spec: docs/superpowers/specs/2026-05-21-judge-runner-accounting-log-design.md
EOF
)"
```

---

## Task 3: Write failing smoke test for accounting log emission

**Files:**

- Modify: `scripts/quality-judge/__tests__/run-judge.smoke.test.ts` (add one new test case)

- [ ] **Step 1: Add the new test inside the existing `describe("run-judge orchestrator", ...)` block**

Insert this `it(...)` block after the existing `"does not throw when the judge call fails (best-effort)"` test (around line 149 in the current file):

```ts
it("emits accounting summary log when fetched > 0", async () => {
  fetchEventsMock.mockResolvedValue([
    {
      uuid: "e1",
      event: "optimize.completed",
      properties: {
        inputPrompt: "x",
        outputPrompt: "y",
        source: "synthetic",
      },
    },
    {
      uuid: "e2",
      event: "optimize.completed",
      properties: {
        inputPrompt: "x",
        outputPrompt: null,
        source: "synthetic",
      },
    },
    {
      uuid: "e3",
      event: "optimize.completed",
      properties: {
        inputPrompt: "x",
        outputPrompt: "y",
        source: "synthetic",
      },
    },
  ]);
  fetchScoredMock.mockResolvedValue(new Set(["e1"]));
  judgeMock.mockResolvedValue({
    dimensions: {
      fidelity: 5,
      detailEnrichment: 4,
      coherence: 4,
      constraintCompliance: 5,
      brevityDiscipline: 4,
    },
    reasoning: "ok",
    tokensIn: 800,
    tokensOut: 100,
    costUsd: 0.003,
  });

  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  try {
    await runJudgeForSurface("optimize", { hoursBack: 24, userSampleRate: 1 });

    const accountingLines = logSpy.mock.calls
      .map((args) => String(args[0]))
      .filter((line) => line.startsWith("[quality-judge] optimize:"));
    expect(accountingLines.length).toBeGreaterThanOrEqual(1);
    const accountingLine = accountingLines[accountingLines.length - 1];
    expect(accountingLine).toBe(
      "[quality-judge] optimize: 3 fetched, 1 scored, 1 already-scored, 1 non-judgeable, 0 failed.",
    );
  } finally {
    logSpy.mockRestore();
  }
});
```

Note: `e1` is in the already-scored set, `e2` has `outputPrompt: null` (so `isJudgeable` returns false), `e3` is the only one that reaches `runJudge`. The mock for `judgeMock` is the same shape as the existing test at line 62.

- [ ] **Step 2: Run smoke tests to verify the new test fails**

Run: `npx vitest run scripts/quality-judge/__tests__/run-judge.smoke.test.ts`
Expected: FAIL — `accountingLines.length` is 0 because no end-of-run log exists yet. The other four existing smoke tests still pass.

---

## Task 4: Wire counters into `runJudgeForSurface` + commit Cycle 2

**Files:**

- Modify: `scripts/quality-judge/run-judge.ts` (inside `runJudgeForSurface`, in the try block)

- [ ] **Step 1: Read the current shape of `runJudgeForSurface` to confirm insertion points**

Confirm the relevant region by reading lines 35-105 of `scripts/quality-judge/run-judge.ts`. The existing structure is:

```ts
try {
  const rubric = await loadRubric(surface);
  const rubricVersion = await rubricVersionFor(surface);
  const eventName = scoredEventNameFor(surface);

  const events = await queryClient.fetchEventsToScore(...);
  if (events.length === 0) {
    console.log(`[quality-judge] ${surface}: no events to score.`);
    return;
  }

  const seen = await queryClient.fetchAlreadyScoredIds(...);

  for (const event of events) {
    if (seen.has(event.uuid)) continue;
    if (!isJudgeable(event, surface)) continue;
    // try-catch around runJudge + emitter.emit
  }
} finally {
  await emitter.shutdown();
}
```

- [ ] **Step 2: Initialize the counters before the for-loop**

Insert immediately before the `for (const event of events) {` line:

```ts
const counts: RunSummaryCounts = {
  fetched: events.length,
  scored: 0,
  alreadyScored: 0,
  nonJudgeable: 0,
  failed: 0,
};
```

- [ ] **Step 3: Increment counters at each branch in the loop**

Replace the `continue` statements in the existing loop with increment-then-continue, and add `counts.scored++` / `counts.failed++` in the inner try/catch. The new loop body shape:

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

  const startedAt = Date.now();
  try {
    const judged = await runJudge({
      rubric,
      surface,
      inputContent: extractInputContent(event, surface),
      outputContent: extractOutputContent(event, surface),
    });
    const totalScore = sumDimensions(judged.dimensions);
    emitter.emit({
      distinctId: resolveDistinctId(),
      event: "quality.scored",
      properties: {
        scoredEvent: event.event,
        scoredEventId: event.uuid,
        surface,
        rubricVersion,
        judgeModel: JUDGE_MODEL_NAME,
        judgeDurationMs: Date.now() - startedAt,
        judgeCostUsd: judged.costUsd,
        totalScore,
        dimensions: judged.dimensions,
        reasoning: judged.reasoning,
        source: event.properties.source ?? "unknown",
      },
    });
    counts.scored++;
  } catch (err) {
    counts.failed++;
    // eslint-disable-next-line no-console
    console.warn(
      `[quality-judge] ${surface} ${event.uuid}: judge failed: ${String(err)}`,
    );
  }
}
```

- [ ] **Step 4: Emit the accounting log after the loop, still inside the try block**

Insert immediately after the closing `}` of the for-loop and before the closing `}` of the outer try block (i.e., before the `finally`):

```ts
// eslint-disable-next-line no-console
console.log(formatRunSummary(counts, surface));
```

- [ ] **Step 5: Run the smoke tests to verify they all pass**

Run: `npx vitest run scripts/quality-judge/__tests__/run-judge.smoke.test.ts`
Expected: PASS — all 5 tests (4 existing + 1 new accounting-log test).

- [ ] **Step 6: Run the formatter tests once more to confirm no regression**

Run: `npx vitest run scripts/quality-judge/__tests__/format-run-summary.test.ts`
Expected: PASS — all 7 tests still green.

- [ ] **Step 7: Verify type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Verify lint**

Run: `npx eslint --config config/lint/eslint.config.js scripts/quality-judge --quiet`
Expected: exit 0.

- [ ] **Step 9: Commit Cycle 2**

```bash
git add scripts/quality-judge/run-judge.ts scripts/quality-judge/__tests__/run-judge.smoke.test.ts
git commit -m "$(cat <<'EOF'
fix(quality-judge): emit accounting summary at end of judge run

runJudgeForSurface now accumulates fetched/scored/already-scored/
non-judgeable/failed counts as it walks the event list, and logs the
formatted accounting line via formatRunSummary at end-of-try. This
removes the silent-stdout success path that tempted human operators
to re-invoke npm run judge:run — the trigger for the PostHog
ingestion-lag dedup race documented in Sub-project E's reordering
log entry (2026-05-21).

Data-level race is unchanged and explicitly out of scope per spec § 3.

Regression test pinned: smoke test asserts the accounting line is
emitted when events.length > 0.

Spec: docs/superpowers/specs/2026-05-21-judge-runner-accounting-log-design.md
EOF
)"
```

---

## Task 5: Full validation gate

**Files:** None modified; verification only.

- [ ] **Step 1: Run the broader quality-judge test surface**

Run: `npx vitest run scripts/quality-judge/__tests__/`
Expected: PASS — all tests in `scripts/quality-judge/__tests__/`. Confirms no other quality-judge tests regressed.

- [ ] **Step 2: Run the unit-test suite to confirm nothing else broke**

Run: `npm run test:unit`
Expected: PASS on all shards.

- [ ] **Step 3: Final type-check and lint sweep**

Run: `npx tsc --noEmit && npx eslint --config config/lint/eslint.config.js . --quiet`
Expected: both exit 0.

- [ ] **Step 4: Confirm two commits landed**

Run: `git log --oneline -3`
Expected: top two entries are the two Cycle commits from Tasks 2 and 4. Third entry is the spec commit `4b63b660`.

- [ ] **Step 5: Smoke-check the script end-to-end (optional, requires real credentials)**

If `OPENAI_API_KEY` and `POSTHOG_API_KEY` are set in `.env`:

Run: `QUALITY_JUDGE_HOURS_BACK=1 npm run judge:run -- --surface=optimize`
Expected: A final line on stdout matching `[quality-judge] optimize: N fetched, M scored, K already-scored, J non-judgeable, F failed.` Or, if no events in the 1h window, the existing `"no events to score."` line.

If credentials are absent, skip — the smoke test in Task 3 already covers the behavior with mocks.

---

## Self-review

**Spec coverage check:**

| Spec section                                                                                | Implemented by                                                                                                 |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| § 1 — "Format function: Pure `formatRunSummary` at module scope"                            | Task 2, Step 1                                                                                                 |
| § 1 — "Counter accumulation: Local `counts` object inside `runJudgeForSurface`"             | Task 4, Steps 2-3                                                                                              |
| § 1 — "Log placement: end of try block before `emitter.shutdown()`"                         | Task 4, Step 4                                                                                                 |
| § 1 — "Empty-fetch behavior: unchanged"                                                     | Preserved — Task 4 doesn't touch the early-return at line 53-57                                                |
| § 1 — "Tests: two new tests in run-judge.smoke.test.ts + separate pure-formatter test file" | Task 1 creates the formatter file; Task 3 adds the smoke test                                                  |
| § 1 — "Regression invariant: log line containing `${surface}: N fetched` is emitted"        | Task 3 — asserts exact format string match                                                                     |
| § 5 — All six success criteria                                                              | Covered by Tasks 2 (formatter tests), 4 (integration + tsc + eslint), and 5 (broader test gate + manual smoke) |

No gaps.

**Placeholder scan:** No "TBD", no "implement later", no "similar to Task N", no "add error handling" without code. Every code step has complete code or a complete command.

**Type consistency check:**

- `RunSummaryCounts` defined in Task 2; referenced in Task 1 (test imports it), Task 3 (test does not need it — uses literal property names in the format string), Task 4 (used as the type of the `counts` local).
- `formatRunSummary(counts, surface)` signature `(counts: RunSummaryCounts, surface: QualityScoredSurface) => string` used consistently across Task 1 (calls with surface "optimize" and "span-labeling"), Task 2 (definition), Task 4, Step 4 (call site).
- `QualityScoredSurface` type imported at line 23 of `run-judge.ts` already — no new import needed for Task 2.

No drift.

---

## Risks pinned

| Risk                                                                         | Caught by                                          |
| ---------------------------------------------------------------------------- | -------------------------------------------------- |
| Counter drift (sum ≠ fetched) on future edits                                | Task 1's "sum invariant" test                      |
| Formatter string drift (someone reorders fields)                             | Task 1's table-driven row assertions               |
| Log emission regression (someone refactors and drops the `console.log` call) | Task 3's smoke test that asserts the exact line    |
| TS type error after adding the interface                                     | Task 2, Step 3 (`tsc --noEmit`)                    |
| Lint regression                                                              | Task 2, Step 4 / Task 4, Step 8 (`eslint --quiet`) |

---

## Out of scope (explicit non-goals)

These would expand scope and are explicitly NOT in this plan:

- ❌ Lock-file or "recently-scored within Nm" guard
- ❌ Server-side or PostHog-side dedup query
- ❌ Mid-run progress heartbeat
- ❌ Changes to `quality.scored` event schema
- ❌ Changes to the cron config (`quality-judge.yml`)
