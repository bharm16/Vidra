import { describe, expect, it } from "vitest";

import {
  buildComparisonQuery,
  formatComparisonTable,
  parseSinceArg,
  type SurfaceTelemetry,
} from "../report-matrix.js";

describe("parseSinceArg", () => {
  it("accepts '30m' as 30 minutes", () => {
    expect(parseSinceArg("30m")).toBe("30 MINUTE");
  });

  it("accepts '2h' as 2 hours", () => {
    expect(parseSinceArg("2h")).toBe("2 HOUR");
  });

  it("accepts '1d' as 1 day", () => {
    expect(parseSinceArg("1d")).toBe("1 DAY");
  });

  it("throws on malformed input", () => {
    expect(() => parseSinceArg("abc")).toThrow();
  });

  it("throws when the unit is missing", () => {
    expect(() => parseSinceArg("30")).toThrow();
  });

  it("throws on unknown unit", () => {
    expect(() => parseSinceArg("30y")).toThrow();
  });
});

describe("buildComparisonQuery", () => {
  it("builds a HogQL query that joins quality.scored to suggestions.completed by scoredEventId", () => {
    const sql = buildComparisonQuery("suggestions", "30 MINUTE");
    expect(sql).toContain("quality.scored");
    expect(sql).toContain("suggestions.completed");
    expect(sql).toContain("properties.modelVariant IS NOT NULL");
    expect(sql).toContain("INTERVAL 30 MINUTE");
    expect(sql).toContain("GROUP BY modelVariant");
  });

  it("uses the correct source event name per surface", () => {
    expect(buildComparisonQuery("optimize", "1 HOUR")).toContain(
      "optimize.completed",
    );
    expect(buildComparisonQuery("span-labeling", "1 DAY")).toContain(
      "label-spans.completed",
    );
  });

  it("pre-filters both sides via CTEs before joining (avoids HogQL 504)", () => {
    // Regression pin: the previous shape did
    //   FROM events q INNER JOIN events s ON toString(s.uuid) = q.properties.scoredEventId
    // with `modelVariant IS NOT NULL` as a post-join WHERE filter. That
    // form times out on real PostHog data sizes. The CTE rewrite pre-
    // filters each side before joining. If this query ever silently
    // reverts to the unbounded-join shape, this test fails.
    const sql = buildComparisonQuery("suggestions", "30 MINUTE");
    expect(sql).toContain("WITH scored AS");
    expect(sql).toContain("source AS");
    expect(sql).toContain("INNER JOIN source ON source.uuid = scored.sourceId");
    // The pre-filter must keep modelVariant IS NOT NULL inside the
    // source CTE — not as a post-join filter.
    const sourceCteStart = sql.indexOf("source AS");
    const mainSelectStart = sql.indexOf("SELECT source.modelVariant");
    const modelVariantFilter = sql.indexOf(
      "properties.modelVariant IS NOT NULL",
    );
    expect(sourceCteStart).toBeGreaterThan(-1);
    expect(mainSelectStart).toBeGreaterThan(sourceCteStart);
    expect(modelVariantFilter).toBeGreaterThan(sourceCteStart);
    expect(modelVariantFilter).toBeLessThan(mainSelectStart);
  });
});

describe("formatComparisonTable", () => {
  it("renders a markdown table with one row per variant", () => {
    const rows: SurfaceTelemetry[] = [
      {
        modelVariant: "qwen",
        n: 47,
        dimensions: {
          relevance: 3.87,
          diversity: 4.06,
          categoryFidelity: 4.51,
          plausibility: 4.7,
          qualityRange: 3.83,
        },
        totalScore: 20.98,
      },
      {
        modelVariant: "gemini",
        n: 47,
        dimensions: {
          relevance: 4.21,
          diversity: 3.95,
          categoryFidelity: 4.62,
          plausibility: 4.55,
          qualityRange: 3.91,
        },
        totalScore: 21.24,
      },
    ];
    const table = formatComparisonTable("suggestions", rows);
    expect(table).toContain("qwen");
    expect(table).toContain("gemini");
    expect(table).toContain("relevance");
    expect(table).toContain("20.98");
    expect(table).toContain("21.24");
    expect(table).toContain("Winner");
  });

  it("handles zero-row case gracefully (no scored events for variants)", () => {
    const table = formatComparisonTable("suggestions", []);
    expect(table).toContain("no scored events");
  });
});
