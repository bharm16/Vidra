import { describe, expect, it } from "vitest";

import { FalRealtimeResultSchema } from "../schemas";

// Wire shape pinned live by scripts/spikes/fal-lightning-realtime-smoke.ts:
// over the realtime msgpack socket the image arrives as raw JPEG bytes in
// images[0].content — there is no url field.
const validResult = {
  images: [
    {
      content: new Uint8Array([255, 216, 255, 224]),
      width: 768,
      height: 768,
      content_type: "image/jpeg",
    },
  ],
  timings: { inference: 0.31 },
  seed: 42,
  request_id: "0-1",
};

describe("FalRealtimeResultSchema", () => {
  it("accepts a realtime result and strips unknown fields", () => {
    const parsed = FalRealtimeResultSchema.safeParse({
      ...validResult,
      has_nsfw_concepts: [false],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.images[0]?.content).toBeInstanceOf(Uint8Array);
      expect(parsed.data.images[0]?.content_type).toBe("image/jpeg");
      expect(parsed.data.timings?.inference).toBe(0.31);
      expect(parsed.data.request_id).toBe("0-1");
      expect("has_nsfw_concepts" in parsed.data).toBe(false);
    }
  });

  it("accepts a result without timings (model time shows as absent)", () => {
    const { timings: _timings, ...withoutTimings } = validResult;
    expect(FalRealtimeResultSchema.safeParse(withoutTimings).success).toBe(
      true,
    );
  });

  it("rejects results with no usable image bytes", () => {
    expect(
      FalRealtimeResultSchema.safeParse({ ...validResult, images: [] }).success,
    ).toBe(false);
    expect(
      FalRealtimeResultSchema.safeParse({ timings: { inference: 0.3 } })
        .success,
    ).toBe(false);
    expect(
      FalRealtimeResultSchema.safeParse({
        ...validResult,
        images: [{ content: "not-bytes", width: 768, height: 768 }],
      }).success,
    ).toBe(false);
  });
});
