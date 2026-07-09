import { describe, expect, it } from "vitest";

import { FalI2iResultSchema } from "../schemas";

// Wire shape pinned live by the HTTP probes (fal.run sync_mode): the image
// arrives as a data-URI url in images[0].url.
const validResult = {
  images: [{ url: "data:image/jpeg;base64,abc123", width: 512, height: 512 }],
  timings: { inference: 0.19 },
  seed: 42,
};

describe("FalI2iResultSchema", () => {
  it("accepts a sync result and strips unknown fields", () => {
    const parsed = FalI2iResultSchema.safeParse({
      ...validResult,
      has_nsfw_concepts: [false],
      prompt: "",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.images[0]?.url).toBe("data:image/jpeg;base64,abc123");
      expect(parsed.data.timings?.inference).toBe(0.19);
      expect("has_nsfw_concepts" in parsed.data).toBe(false);
    }
  });

  it("accepts a result without timings (model time shows as absent)", () => {
    const { timings: _timings, ...withoutTimings } = validResult;
    expect(FalI2iResultSchema.safeParse(withoutTimings).success).toBe(true);
  });

  it("rejects results with no usable image url", () => {
    expect(
      FalI2iResultSchema.safeParse({ ...validResult, images: [] }).success,
    ).toBe(false);
    expect(
      FalI2iResultSchema.safeParse({ timings: { inference: 0.2 } }).success,
    ).toBe(false);
    expect(
      FalI2iResultSchema.safeParse({
        ...validResult,
        images: [{ url: "" }],
      }).success,
    ).toBe(false);
  });
});
