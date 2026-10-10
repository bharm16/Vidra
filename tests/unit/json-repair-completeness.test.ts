import { describe, it, expect } from "vitest";
import {
  attemptJsonRepair,
  assessRepairCompleteness,
} from "@clients/adapters/jsonRepair";

describe("attemptJsonRepair completeness tracking", () => {
  it("tracks auto-closed braces for truncated objects", () => {
    const result = attemptJsonRepair('{"a": {"b": 1');

    expect(result.autoClosedBraces).toBe(2);
    expect(result.autoClosedBrackets).toBe(0);
    expect(JSON.parse(result.repaired)).toEqual({ a: { b: 1 } });
  });

  it("tracks auto-closed brackets for truncated arrays", () => {
    const result = attemptJsonRepair("[[1,2],[3,4");

    expect(result.autoClosedBrackets).toBe(2);
    expect(result.autoClosedBraces).toBe(0);
    expect(JSON.parse(result.repaired)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe("assessRepairCompleteness", () => {
  it("returns not truncated for clean JSON", () => {
    const result = attemptJsonRepair('{"items": [1, 2, 3]}');
    const assessment = assessRepairCompleteness(result);

    expect(assessment.isLikelyTruncated).toBe(false);
    expect(assessment.reason).toBeUndefined();
  });

  it("detects truncation from auto-closed braces", () => {
    const result = attemptJsonRepair('{"spans": [{"label": "subject"');
    const assessment = assessRepairCompleteness(result);

    expect(assessment.isLikelyTruncated).toBe(true);
    expect(assessment.reason).toContain("Auto-closed");
  });

  it("detects truncation when array is shorter than expected", () => {
    const result = attemptJsonRepair('[{"id":1},{"id":2}]');
    const assessment = assessRepairCompleteness(result, 10);

    expect(assessment.isLikelyTruncated).toBe(true);
    expect(assessment.reason).toContain("2 items");
    expect(assessment.reason).toContain("expected at least 10");
  });

  it("passes when array meets minimum expected items", () => {
    const result = attemptJsonRepair('[{"id":1},{"id":2},{"id":3}]');
    const assessment = assessRepairCompleteness(result, 3);

    expect(assessment.isLikelyTruncated).toBe(false);
  });
});
