import { getDefaultGenerationDurationSeconds } from "@shared/generationPricing";

/**
 * The ratio a generation uses when neither the creator nor the surrounding
 * surface names one. Lifted from a literal that was inlined in the settings row.
 */
export const DEFAULT_ASPECT_RATIO = "16:9";

type ParamsBag = Record<string, unknown> | null | undefined;

const readNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Read the generation parameters the canvas displays and reports.
 *
 * Capability values arrive as `string | number | boolean`, so every read here
 * has an edge case worth pinning: a duration can be a numeric string, a
 * non-finite number must read as absent rather than as NaN, and a blank aspect
 * ratio must fall through rather than blanking the frame.
 *
 * The `read*` functions answer "what did the creator set?" and return null for
 * unset. `resolveDurationSeconds` answers the different question "what will the
 * generation actually use?" — which is the one every telemetry site and the
 * recommendation request want, and the one three call sites previously answered
 * three different ways (a hardcoded 5, the model default of 8, and null).
 */
export const readDurationSeconds = (params: ParamsBag): number | null =>
  readNumber(params?.duration_s);

/**
 * Deliberately stricter than duration: fps is never carried as a string, so a
 * string here means the bag is wrong rather than that the creator picked 24.
 */
export const readFps = (params: ParamsBag): number | null => {
  const fps = params?.fps;
  return typeof fps === "number" && Number.isFinite(fps) ? fps : null;
};

export const readAspectRatio = (params: ParamsBag): string | null => {
  const ratio = params?.aspect_ratio;
  if (typeof ratio === "string" && ratio.trim()) return ratio.trim();
  return null;
};

/**
 * The duration the next generation will run for: what the creator set, or the
 * model's own default. This is the number credits are priced against
 * (`getGenerationCreditCost` uses the same fallback), so a caller that invents
 * its own default reports a generation that costs something else.
 */
export const resolveDurationSeconds = (
  params: ParamsBag,
  modelId: string | null | undefined,
): number =>
  readDurationSeconds(params) ?? getDefaultGenerationDurationSeconds(modelId);
