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
