import { describe, it, expect } from "vitest";
import { StudioProjectSchema } from "../schemas";

/**
 * Regression (latent, found during M5 hardening): the wire schema
 * validated pinnedModel against the slug ENUM, so a persisted pin whose
 * model left the roster failed the whole project parse — bricking
 * bootstrap and every project fetch for that user.
 *
 * Invariant: any persisted pinnedModel string parses; staleness is a UI
 * concern (composer shows Auto + a notice), never a wire failure
 * (behavior 9).
 */
describe("regression: stale pinned models never fail the project parse", () => {
  const base = {
    id: "p1",
    title: "Fox Logo",
    createdAtMs: 1,
    updatedAtMs: 2,
  };

  it("parses a project pinned to a slug no longer in the roster", () => {
    const parsed = StudioProjectSchema.parse({
      ...base,
      pinnedModel: "recraft-v3-retired",
    });
    expect(parsed.pinnedModel).toBe("recraft-v3-retired");
  });

  it("still parses current slugs, null, and absence", () => {
    expect(
      StudioProjectSchema.parse({ ...base, pinnedModel: "recraft-v4.1" })
        .pinnedModel,
    ).toBe("recraft-v4.1");
    expect(
      StudioProjectSchema.parse({ ...base, pinnedModel: null }).pinnedModel,
    ).toBeNull();
    expect(StudioProjectSchema.parse(base).pinnedModel).toBeUndefined();
  });
});
