import { describe, expect, it } from "vitest";

import { FalRealtimeResultSchema } from "../schemas";

const validResult = {
  images: [{ url: "data:image/jpeg;base64,abc123", width: 768, height: 768 }],
  timings: { inference: 0.31 },
  seed: 42,
  request_id: "0-1",
};

describe("FalRealtimeResultSchema", () => {
  it("accepts a realtime result and strips unknown fields", () => {
    const parsed = FalRealtimeResultSchema.safeParse({
      ...validResult,
      some_future_field: "ignored",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.images[0]?.url).toBe("data:image/jpeg;base64,abc123");
      expect(parsed.data.timings?.inference).toBe(0.31);
      expect(parsed.data.request_id).toBe("0-1");
      expect("some_future_field" in parsed.data).toBe(false);
    }
  });

  it("accepts a result without timings (model time shows as absent)", () => {
    const { timings: _timings, ...withoutTimings } = validResult;
    expect(FalRealtimeResultSchema.safeParse(withoutTimings).success).toBe(
      true,
    );
  });

  it("rejects results with no usable image", () => {
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
        images: [{ url: "" }],
      }).success,
    ).toBe(false);
  });
});
