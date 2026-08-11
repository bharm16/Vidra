import { useMemo } from "react";
import type { CapabilityValues } from "@shared/capabilities";

export interface ResolvedGenerationParams {
  /** Aspect ratio the next generation will actually use. */
  effectiveAspectRatio: string | null;
  /** Duration in seconds, or null when the model does not carry one. */
  durationSeconds: number | null;
  /** Frame rate, or null when the model does not carry one. */
  fpsNumber: number | null;
}

/**
 * Read the generation parameters the canvas needs to display.
 *
 * One reason to change — the capability parameter vocabulary — so it lives in one
 * place instead of three memos inside the canvas orchestrator. The coercions are
 * the interesting part and each has an edge case worth pinning: capability values
 * arrive as `string | number | boolean`, so a duration can be a numeric string,
 * a non-finite number must read as absent rather than as NaN, and a blank
 * aspect ratio must fall through to the preview's own ratio rather than blanking
 * the frame.
 */
export function useResolvedGenerationParams(params: {
  generationParams: CapabilityValues | null | undefined;
  previewAspectRatio: string | null | undefined;
}): ResolvedGenerationParams {
  const { generationParams, previewAspectRatio } = params;

  const effectiveAspectRatio = useMemo(() => {
    const fromParams = generationParams?.aspect_ratio;
    if (typeof fromParams === "string" && fromParams.trim()) {
      return fromParams.trim();
    }
    return previewAspectRatio ?? null;
  }, [generationParams?.aspect_ratio, previewAspectRatio]);

  const durationSeconds = useMemo(() => {
    const durationValue = generationParams?.duration_s;
    if (typeof durationValue === "number") {
      return Number.isFinite(durationValue) ? durationValue : null;
    }
    if (typeof durationValue === "string") {
      const parsed = Number.parseFloat(durationValue);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, [generationParams?.duration_s]);

  const fpsNumber = useMemo(() => {
    const fpsValue = generationParams?.fps;
    return typeof fpsValue === "number" && Number.isFinite(fpsValue)
      ? fpsValue
      : null;
  }, [generationParams?.fps]);

  return { effectiveAspectRatio, durationSeconds, fpsNumber };
}
