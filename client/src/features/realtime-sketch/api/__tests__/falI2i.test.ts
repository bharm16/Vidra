import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockBuildFirebaseAuthHeaders } = vi.hoisted(() => ({
  mockBuildFirebaseAuthHeaders: vi.fn(),
}));

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: mockBuildFirebaseAuthHeaders,
}));

import { sendSketchFrame, SketchFrameRefused } from "../falI2i";

/**
 * The relay's anti-corruption boundary has to tell two 429s apart: the burst
 * lane's "you are drawing too fast", which the loop retries, and the daily
 * admission budget's "your allowance is gone" (issue #84), which it must not.
 * The discriminator is the refusal envelope's `reason`, never the status.
 */
const frame = {
  prompt: "a desk lamp",
  image_url: "data:image/jpeg;base64,abc",
  strength: 0.875,
  num_inference_steps: 8,
  seed: 42,
};

function respondWith(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

describe("sendSketchFrame", () => {
  beforeEach(() => {
    mockBuildFirebaseAuthHeaders.mockResolvedValue({
      "X-Firebase-Token": "token",
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns fal's body untouched on success", async () => {
    const falResult = { images: [{ url: "data:image/webp;base64,render" }] };
    respondWith(200, falResult);

    await expect(
      sendSketchFrame(frame, new AbortController().signal),
    ).resolves.toEqual(falResult);
  });

  it("turns a spent-allowance refusal into a typed refusal", async () => {
    respondWith(429, {
      reason: "daily-allowance-reached",
      detail: "Daily sketch allowance reached.",
      resetAtMs: 1_790_000_000_000,
    });

    const error = await sendSketchFrame(
      frame,
      new AbortController().signal,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SketchFrameRefused);
    expect((error as SketchFrameRefused).refusal).toEqual({
      reason: "daily-allowance-reached",
      detail: "Daily sketch allowance reached.",
      resetAtMs: 1_790_000_000_000,
    });
  });

  it("turns an unreadable budget into a typed refusal", async () => {
    respondWith(503, {
      reason: "budget-unavailable",
      detail: "Sketch budget is temporarily unavailable — no frame was sent.",
    });

    const error = await sendSketchFrame(
      frame,
      new AbortController().signal,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SketchFrameRefused);
    expect((error as SketchFrameRefused).refusal.reason).toBe(
      "budget-unavailable",
    );
  });

  it("leaves the burst lane's 429 an ordinary failure", async () => {
    respondWith(429, { message: "Too many sketch frames in a short time" });

    const error = await sendSketchFrame(
      frame,
      new AbortController().signal,
    ).catch((caught: unknown) => caught);

    expect(error).not.toBeInstanceOf(SketchFrameRefused);
    expect((error as Error).message).toContain(
      "Too many sketch frames in a short time",
    );
  });
});
