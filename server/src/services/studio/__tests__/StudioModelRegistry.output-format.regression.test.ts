import { describe, it, expect } from "vitest";
import { StudioModelRegistry } from "../StudioModelRegistry";

/**
 * Regression (found live 2026-07-24, M4 edit verification): Auto routed an
 * edit to google/nano-banana-2-lite and Replicate answered 422 —
 * `output_format must be one of "jpg", "png"`. The builder sent "webp",
 * which the non-lite nano-banana-2 accepts but the lite tier does not
 * (M1's edit proof ran on non-lite, masking this).
 *
 * Invariant: inputs built for the google model family only ever use an
 * output_format every family member accepts ("png").
 */
describe("regression: google-family inputs use a family-wide output_format", () => {
  const registry = new StudioModelRegistry();
  const googleSlugs = [
    "nano-banana-2",
    "nano-banana-2-lite",
    "nano-banana-pro",
  ] as const;

  for (const slug of googleSlugs) {
    it(`${slug} generate input requests png`, () => {
      const input = registry.buildGenerateInput(slug, "a fox logo");
      expect(input.output_format).toBe("png");
    });

    it(`${slug} edit input requests png`, () => {
      const input = registry.buildEditInput(slug, "make it bolder", [
        "https://signed.example.com/fox.webp",
      ]);
      expect(input.output_format).toBe("png");
    });
  }
});
