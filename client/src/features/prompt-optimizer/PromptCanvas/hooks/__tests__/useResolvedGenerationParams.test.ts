import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useResolvedGenerationParams } from "../useResolvedGenerationParams";

const resolve = (
  generationParams: Record<string, string | number | boolean> | null,
  previewAspectRatio: string | null = null,
) =>
  renderHook(() =>
    useResolvedGenerationParams({ generationParams, previewAspectRatio }),
  ).result.current;

describe("useResolvedGenerationParams", () => {
  describe("effectiveAspectRatio", () => {
    it("prefers the ratio the user picked", () => {
      expect(
        resolve({ aspect_ratio: "9:16" }, "16:9").effectiveAspectRatio,
      ).toBe("9:16");
    });

    it("trims a padded ratio", () => {
      expect(resolve({ aspect_ratio: " 9:16 " }).effectiveAspectRatio).toBe(
        "9:16",
      );
    });

    // A blank ratio must fall through, not blank the frame.
    it("falls back to the preview ratio when the param is blank", () => {
      expect(
        resolve({ aspect_ratio: "   " }, "16:9").effectiveAspectRatio,
      ).toBe("16:9");
    });

    it("falls back to the preview ratio when no param is set", () => {
      expect(resolve(null, "16:9").effectiveAspectRatio).toBe("16:9");
    });

    it("reports null when neither source has a ratio", () => {
      expect(resolve(null, null).effectiveAspectRatio).toBeNull();
    });
  });

  describe("durationSeconds", () => {
    it("passes a numeric duration through", () => {
      expect(resolve({ duration_s: 8 }).durationSeconds).toBe(8);
    });

    // Capability values are string | number | boolean, so a numeric string is
    // a legal way to carry a duration.
    it("parses a numeric string duration", () => {
      expect(resolve({ duration_s: "8" }).durationSeconds).toBe(8);
      expect(resolve({ duration_s: "8.5" }).durationSeconds).toBe(8.5);
    });

    it("reports null for a non-numeric string", () => {
      expect(resolve({ duration_s: "eight" }).durationSeconds).toBeNull();
    });

    it("reports null for a non-finite number rather than NaN", () => {
      expect(
        resolve({ duration_s: Number.POSITIVE_INFINITY }).durationSeconds,
      ).toBeNull();
      expect(resolve({ duration_s: Number.NaN }).durationSeconds).toBeNull();
    });

    it("reports null when the model carries no duration", () => {
      expect(resolve({}).durationSeconds).toBeNull();
      expect(resolve(null).durationSeconds).toBeNull();
    });
  });

  describe("fpsNumber", () => {
    it("passes a numeric fps through", () => {
      expect(resolve({ fps: 24 }).fpsNumber).toBe(24);
    });

    // Deliberately stricter than duration: fps is never carried as a string.
    it("reports null for a string fps", () => {
      expect(resolve({ fps: "24" }).fpsNumber).toBeNull();
    });

    it("reports null for a non-finite fps", () => {
      expect(resolve({ fps: Number.NaN }).fpsNumber).toBeNull();
    });

    it("reports null when the model carries no fps", () => {
      expect(resolve(null).fpsNumber).toBeNull();
    });
  });
});
