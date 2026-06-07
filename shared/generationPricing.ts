export const DEFAULT_GENERATION_DURATION_SECONDS = 8;

export const DEFAULT_SERVER_VIDEO_CREDITS_PER_SECOND = 10;

type FlatGenerationPricing = {
  kind: "flat";
  credits: number;
  defaultDurationSeconds?: number | undefined;
};

type PerSecondGenerationPricing = {
  kind: "per-second";
  creditsPerSecond: number;
  defaultDurationSeconds?: number | undefined;
};

export type GenerationPricing =
  | FlatGenerationPricing
  | PerSecondGenerationPricing;

export const GENERATION_PRICING = {
  "flux-kontext": {
    kind: "flat",
    credits: 4,
  },
  storyboard: {
    kind: "flat",
    credits: 4,
  },
  "wan-2.2": {
    kind: "per-second",
    creditsPerSecond: 3.5,
  },
  "wan-2.5": {
    kind: "per-second",
    creditsPerSecond: 3.5,
  },
  "sora-2": {
    kind: "per-second",
    creditsPerSecond: 6,
  },
  sora: {
    kind: "per-second",
    creditsPerSecond: 6,
  },
  "kling-v2-1-master": {
    kind: "per-second",
    creditsPerSecond: 5,
  },
  kling: {
    kind: "per-second",
    creditsPerSecond: 5,
  },
  "google/veo-3": {
    kind: "per-second",
    creditsPerSecond: 24,
  },
  veo: {
    kind: "per-second",
    creditsPerSecond: 24,
  },
  "luma-ray3": {
    kind: "per-second",
    creditsPerSecond: 7,
  },
  luma: {
    kind: "per-second",
    creditsPerSecond: 7,
  },
  runway: {
    kind: "per-second",
    creditsPerSecond: 6,
  },

  // Full model-id keys. The server registry (VIDEO_CREDITS_PER_SECOND) keys off
  // VIDEO_MODELS values, which are full provider/model ids — not the short
  // aliases above. Without these entries the server lookups miss and fall back
  // to per-call literals. Values mirror the current effective server pricing so
  // the lookup is authoritative (see server/config/__tests__ regression test).
  // NOTE: "wan-video/wan-2.2-t2v-fast" is deliberately absent — VIDEO_MODELS.DRAFT
  // and VIDEO_MODELS.PRO both map to it with conflicting intended rates (3.5 vs 5),
  // so a single shared value would require a pricing decision. Flagged, not resolved.
  "sora-2-pro": {
    kind: "per-second",
    creditsPerSecond: 14,
  },
  "minimax/video-02": {
    kind: "per-second",
    creditsPerSecond: 4,
  },
  "genmo/mochi-1-final": {
    kind: "per-second",
    creditsPerSecond: 6,
  },
  "wan-video/wan-2.2-i2v-fast": {
    kind: "per-second",
    creditsPerSecond: 3.5,
  },
  "wan-video/wan-2.5-i2v": {
    kind: "per-second",
    creditsPerSecond: 3.5,
  },
} as const satisfies Record<string, GenerationPricing>;

export const getGenerationPricing = (
  modelId?: string | null,
): GenerationPricing | null => {
  if (typeof modelId !== "string") return null;
  const normalized = modelId.trim();
  if (!normalized) return null;
  return (
    GENERATION_PRICING[normalized as keyof typeof GENERATION_PRICING] ?? null
  );
};

export const getDefaultGenerationDurationSeconds = (
  modelId?: string | null,
): number => {
  const pricing = getGenerationPricing(modelId);
  return pricing?.defaultDurationSeconds ?? DEFAULT_GENERATION_DURATION_SECONDS;
};

export const getGenerationCreditsPerSecond = (
  modelId?: string | null,
): number | null => {
  const pricing = getGenerationPricing(modelId);
  if (!pricing || pricing.kind !== "per-second") {
    return null;
  }
  return pricing.creditsPerSecond;
};

export const getGenerationCreditCost = (
  modelId?: string | null,
  durationSeconds?: number | null,
): number => {
  const pricing = getGenerationPricing(modelId);
  if (!pricing) return 0;

  if (pricing.kind === "flat") {
    return pricing.credits;
  }

  const duration =
    durationSeconds ?? getDefaultGenerationDurationSeconds(modelId);
  return Math.ceil(pricing.creditsPerSecond * duration);
};
