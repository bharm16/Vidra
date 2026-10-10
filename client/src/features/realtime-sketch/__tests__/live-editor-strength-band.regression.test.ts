import { describe, expect, it } from "vitest";

import {
  DEFAULT_STEPS,
  effectiveSteps,
  snapStrength,
} from "../config/constants";

/**
 * The live editor shipped a default strength that made the output a traced
 * copy of the drawing: the prompt had no effect at all, so editing it looked
 * like the sketchpad was simply being mirrored into the output pane.
 *
 * Measured 2026-08-01 against the pinned relay model
 * (fal-ai/z-image/turbo/image-to-image at 512², seed 42) by sweeping strength
 * while varying the sketch and the prompt independently — sketch influence is
 * how much the output moves when only the drawing changes, prompt influence
 * how much it moves when only the prompt changes:
 *
 *   effective steps   sketch influence   prompt influence   behaviour
 *   ≤ 6 of 8             16 – 21            0.2 – 2.5       traced copy
 *     7 of 8               25.2              14.3           both drive it
 *     8 of 8                0.00            69 – 74         sketch ignored
 *
 * The model buckets strength as ceil(strength × steps), confirmed by a 0.001
 * probe: 0.750 traces (bucket 6) while 0.751 blends (bucket 7). So the usable
 * band is the half-open interval (0.75, 0.875] — bucket 7 of 8 — and the UI's
 * own grid maths has to name that same bucket, or the number the creator sets
 * is not the number the model runs.
 */
// exclusive — 0.750 itself traces
// inclusive — 0.876 is already bucket 8

describe("regression: the strength grid names the bucket the model runs", () => {
  // A deterministic sweep beats random sampling here: the input is a bounded
  // 1-D range, so stepping it exhaustively covers every bucket boundary
  // including the 0.750/0.751 edge that distinguishes ceil from round.
  const everyStrength = Array.from({ length: 1001 }, (_, tick) => tick / 1000);

  it("snapping a strength names the bucket the model will actually run", () => {
    for (const strength of everyStrength) {
      expect(
        effectiveSteps(snapStrength(strength, DEFAULT_STEPS), DEFAULT_STEPS),
      ).toBe(Math.ceil(strength * DEFAULT_STEPS));
    }
  });

  it("snapping is idempotent — a snapped strength is already on the grid", () => {
    for (const strength of everyStrength) {
      const once = snapStrength(strength, DEFAULT_STEPS);
      expect(snapStrength(once, DEFAULT_STEPS)).toBe(once);
    }
  });
});
