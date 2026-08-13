import { useMemo } from "react";
import type { CapabilityValues } from "@shared/capabilities";
import {
  readAspectRatio,
  readDurationSeconds,
  readFps,
} from "@features/generation-controls/resolveGenerationParams";

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
 * The coercions live in `@features/generation-controls`, which owns the
 * capability parameter vocabulary; this hook is the memoized view of them plus
 * the one rule that is genuinely local — a blank aspect ratio falls through to
 * the preview's own ratio rather than blanking the frame.
 *
 * These reads report what the creator set, so an unset value is null. A caller
 * that needs the value the generation will actually run with wants
 * `resolveDurationSeconds`, which applies the model's default.
 */
export function useResolvedGenerationParams(params: {
  generationParams: CapabilityValues | null | undefined;
  previewAspectRatio: string | null | undefined;
}): ResolvedGenerationParams {
  const { generationParams, previewAspectRatio } = params;

  const effectiveAspectRatio = useMemo(
    () => readAspectRatio(generationParams) ?? previewAspectRatio ?? null,
    [generationParams, previewAspectRatio],
  );

  const durationSeconds = useMemo(
    () => readDurationSeconds(generationParams),
    [generationParams],
  );

  const fpsNumber = useMemo(
    () => readFps(generationParams),
    [generationParams],
  );

  return { effectiveAspectRatio, durationSeconds, fpsNumber };
}
