import { describe, it, expect } from "vitest";
import { z } from "zod";
import { StudioModelInfoSchema } from "../schemas";

/**
 * Regression (latent, same class as the stale-pin fix next door): the
 * roster schema validated `slug` against the 8-value slug ENUM while the
 * server declares it a plain string. Registering a 9th model server-side
 * made getStudioModels() throw during bootstrap — and bootstrap fetched
 * the roster and the project list together, so the throw blanked the
 * Creator's entire project list.
 *
 * Invariant: every roster entry the server offers parses. The roster is
 * display data — an unknown slug is a picker row, never a wire failure.
 */
describe("regression: an unknown roster model never fails the roster parse", () => {
  const ninth = {
    slug: "recraft-v5-preview",
    displayName: "Recraft V5 Preview",
    capabilities: ["design", "general"],
    latencyHintSeconds: 8,
  };

  it("parses a roster entry whose slug this client has never heard of", () => {
    expect(StudioModelInfoSchema.parse(ninth).slug).toBe("recraft-v5-preview");
  });

  it("parses the whole roster array as getStudioModels does", () => {
    const roster = z.array(StudioModelInfoSchema).parse([
      {
        slug: "recraft-v4.1",
        displayName: "Recraft V4.1",
        capabilities: ["design"],
        latencyHintSeconds: 6,
      },
      ninth,
    ]);

    expect(roster.map((model) => model.slug)).toEqual([
      "recraft-v4.1",
      "recraft-v5-preview",
    ]);
  });

  it("still rejects a roster entry that is structurally wrong", () => {
    expect(() =>
      StudioModelInfoSchema.parse({ ...ninth, latencyHintSeconds: "fast" }),
    ).toThrow();
  });
});
