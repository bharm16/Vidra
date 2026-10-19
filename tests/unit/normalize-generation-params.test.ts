import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerMock } = vi.hoisted(() => ({ loggerMock: { warn: vi.fn() } }));

vi.mock("@infrastructure/Logger", () => ({
  logger: loggerMock,
}));

import { normalizeGenerationParams } from "@routes/optimize/normalizeGenerationParams";

describe("normalizeGenerationParams", () => {
  beforeEach(() => {
    loggerMock.warn.mockReset();
  });

  it("returns null when no settings object is supplied", () => {
    for (const generationParams of [undefined, null, "16:9", ["16:9"]]) {
      expect(normalizeGenerationParams({ generationParams, operation: "optimize", requestId: "req-1" })).toEqual({ normalizedGenerationParams: null });
    }
  });

  it("keeps plain settings values unchanged", () => {
    const result = normalizeGenerationParams({
      generationParams: { aspect_ratio: "9:16", duration_s: 6, resolution: "4k", seed: 42, audio: true },
      targetModel: "veo-3",
      operation: "optimize",
      requestId: "req-2",
    });
    expect(result).toEqual({ normalizedGenerationParams: { aspect_ratio: "9:16", duration_s: 6, resolution: "4k", seed: 42, audio: true } });
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("drops nested or non-finite values and says which", () => {
    const result = normalizeGenerationParams({
      generationParams: { aspect_ratio: "16:9", keyframes: [{ url: "x" }], fps: Number.NaN },
      operation: "generateVideo",
      requestId: "req-3",
      userId: "user-1",
    });
    expect(result).toEqual({ normalizedGenerationParams: { aspect_ratio: "16:9" } });
    expect(loggerMock.warn).toHaveBeenCalledWith("Dropped non-scalar generation parameters", expect.objectContaining({ dropped: ["keyframes", "fps"], requestId: "req-3" }));
  });
});
