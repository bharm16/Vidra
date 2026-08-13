import { describe, it, expect } from "vitest";
import { DEFAULT_GENERATION_DURATION_SECONDS } from "@shared/generationPricing";
import {
  DEFAULT_ASPECT_RATIO,
  readAspectRatio,
  readDurationSeconds,
  readFps,
  resolveDurationSeconds,
} from "../resolveGenerationParams";

describe("readDurationSeconds", () => {
  it("reads a numeric duration", () => {
    expect(readDurationSeconds({ duration_s: 12 })).toBe(12);
  });

  it("reads a numeric string — capability values arrive as strings from selects", () => {
    expect(readDurationSeconds({ duration_s: "12" })).toBe(12);
  });

  it("reads a non-finite number as absent rather than as NaN", () => {
    expect(readDurationSeconds({ duration_s: Number.NaN })).toBeNull();
    expect(
      readDurationSeconds({ duration_s: Number.POSITIVE_INFINITY }),
    ).toBeNull();
  });

  it("reads an unparseable string as absent", () => {
    expect(readDurationSeconds({ duration_s: "auto" })).toBeNull();
  });

  it("reads a missing or nullish params bag as absent", () => {
    expect(readDurationSeconds({})).toBeNull();
    expect(readDurationSeconds(null)).toBeNull();
    expect(readDurationSeconds(undefined)).toBeNull();
  });
});

describe("resolveDurationSeconds", () => {
  it("prefers what the creator set", () => {
    expect(resolveDurationSeconds({ duration_s: 12 }, "some-model")).toBe(12);
  });

  it("falls back to the model's default when unset", () => {
    // The whole point of this module: every caller that needs an effective
    // duration gets the same one. Three call sites previously answered this
    // with 5, with 8, and with null.
    expect(resolveDurationSeconds({}, undefined)).toBe(
      DEFAULT_GENERATION_DURATION_SECONDS,
    );
  });

  it("gives the same answer to every caller for the same params", () => {
    const params = { aspect_ratio: "9:16" };
    expect(resolveDurationSeconds(params, "model-a")).toBe(
      resolveDurationSeconds(params, "model-a"),
    );
  });
});

describe("readAspectRatio", () => {
  it("reads and trims a set ratio", () => {
    expect(readAspectRatio({ aspect_ratio: " 9:16 " })).toBe("9:16");
  });

  it("reads a blank ratio as absent so callers can fall through", () => {
    expect(readAspectRatio({ aspect_ratio: "   " })).toBeNull();
    expect(readAspectRatio({})).toBeNull();
    expect(readAspectRatio(null)).toBeNull();
  });

  it("publishes the default callers fall back to", () => {
    expect(DEFAULT_ASPECT_RATIO).toBe("16:9");
  });
});

describe("readFps", () => {
  it("reads a numeric fps", () => {
    expect(readFps({ fps: 24 })).toBe(24);
  });

  it("reads a non-finite or missing fps as absent", () => {
    expect(readFps({ fps: Number.NaN })).toBeNull();
    expect(readFps({})).toBeNull();
    expect(readFps(undefined)).toBeNull();
  });

  it("reads a string fps as absent — stricter than duration on purpose", () => {
    // fps is never carried as a string, so a string here means the bag is
    // wrong rather than that the creator picked 24.
    expect(readFps({ fps: "24" })).toBeNull();
  });
});
