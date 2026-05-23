import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  OPTIMIZE_DIMENSION_KEYS,
  SUGGESTIONS_DIMENSION_KEYS,
  SPAN_LABELING_DIMENSION_KEYS,
} from "../judge-event-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CalibrationEntry {
  scoredEvent: string;
  inputContent: Record<string, unknown>;
  outputContent: Record<string, unknown>;
  humanScore: number;
  humanDimensions: Record<string, number>;
}

function loadSet(surface: string): CalibrationEntry[] {
  const path = join(
    __dirname,
    "..",
    "calibration",
    `${surface}.calibration.json`,
  );
  return JSON.parse(readFileSync(path, "utf8")) as CalibrationEntry[];
}

const cases: Array<{
  surface: string;
  scoredEvent: string;
  dimensionKeys: readonly string[];
}> = [
  {
    surface: "optimize",
    scoredEvent: "optimize.completed",
    dimensionKeys: OPTIMIZE_DIMENSION_KEYS,
  },
  {
    surface: "suggestions",
    scoredEvent: "suggestions.completed",
    dimensionKeys: SUGGESTIONS_DIMENSION_KEYS,
  },
  {
    surface: "span-labeling",
    scoredEvent: "label-spans.completed",
    dimensionKeys: SPAN_LABELING_DIMENSION_KEYS,
  },
];

for (const { surface, scoredEvent, dimensionKeys } of cases) {
  describe(`${surface} calibration set`, () => {
    const entries = loadSet(surface);

    it("file parses as a JSON array", () => {
      expect(Array.isArray(entries)).toBe(true);
    });

    // The remaining assertions are gated: they only run once the calibration
    // JSON is populated (length > 0). Until then they're effectively no-ops,
    // letting the infrastructure land cleanly while the hand-authoring work is
    // tracked separately.
    if (entries.length === 0) {
      it.skip("contains at least 30 entries (pending hand-authoring)", () => {});
      return;
    }

    it("contains at least 20 entries (4 quartiles × 5 stratified picks)", () => {
      // Sub-project A's locked design: 20 entries per surface (5 per
      // quartile across 4 quartiles). Sub-project D's reseed preserved
      // this shape. The original "30 entries" target was aspirational
      // before the stratification design landed.
      expect(entries.length).toBeGreaterThanOrEqual(20);
    });

    it(`every entry uses scoredEvent = '${scoredEvent}'`, () => {
      for (const e of entries) {
        expect(e.scoredEvent).toBe(scoredEvent);
      }
    });

    it("every entry has all 5 dimensions in [0,5]", () => {
      for (const e of entries) {
        for (const k of dimensionKeys) {
          expect(typeof e.humanDimensions[k]).toBe("number");
          expect(e.humanDimensions[k]).toBeGreaterThanOrEqual(0);
          expect(e.humanDimensions[k]).toBeLessThanOrEqual(5);
        }
      }
    });

    it("humanScore equals the sum of dimensions", () => {
      for (const e of entries) {
        const sum = Object.values(e.humanDimensions).reduce((a, b) => a + b, 0);
        expect(e.humanScore).toBe(sum);
      }
    });

    it("covers a meaningful quality range (max - min >= 8)", () => {
      // Range-based rather than absolute. Clean post-cutoff data
      // (Sub-project D, 2026-05-22) can legitimately have min > 10 if
      // the surface is generally healthy (span-labeling 16-25, suggestions
      // 14-24). The intent of this assertion is "the calibration set
      // isn't flat" — measured by spread, not absolute floor.
      const scores = entries.map((e) => e.humanScore);
      const range = Math.max(...scores) - Math.min(...scores);
      expect(range).toBeGreaterThanOrEqual(8);
    });
  });
}
