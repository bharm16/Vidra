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

    // A blank ratio must fall through, not blank the frame.
    it("falls back to the preview ratio when the param is blank", () => {
      expect(
        resolve({ aspect_ratio: "   " }, "16:9").effectiveAspectRatio,
      ).toBe("16:9");
    });

    it("reports null when neither source has a ratio", () => {
      expect(resolve(null, null).effectiveAspectRatio).toBeNull();
    });
  });
});
