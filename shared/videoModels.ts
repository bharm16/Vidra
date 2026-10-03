// ============================================================================
// Generation-side model IDs (provider-scoped identifiers)
//
// These are the literal string IDs that downstream provider adapters (OpenAI,
// Luma, Kling, Gemini, Replicate) accept. Kept pure so both client and server
// can import without pulling in any runtime/Node modules.
//
// NOTE: `VideoModelId` intentionally widens to `string` via `(string & {})`.
// The server's `VIDEO_MODELS` record derives values from env vars (e.g.
// `WAN_2_5_I2V_MODEL`, `DRAFT_I2V_MODEL`) that can legitimately be arbitrary
// strings at runtime. The known-id union preserves autocomplete and enables
// type guards like `isKlingModelId` to narrow correctly.
// ============================================================================

export type SoraModelId = "sora-2" | "sora-2-pro";
export type LumaModelId = "luma-ray3";
export type KlingModelId = "kling-v2-1-master";
export type VeoModelId = "google/veo-3";
export type KlingAspectRatio = "16:9" | "9:16" | "1:1";

/**
 * Canonical generation-side video model IDs currently wired in `VIDEO_MODELS`.
 * Used for type-guard narrowing and Record-keyed provider maps.
 */
export type KnownVideoModelId =
  | SoraModelId
  | LumaModelId
  | KlingModelId
  | VeoModelId
  | "wan-video/wan-2.2-t2v-fast"
  | "wan-video/wan-2.2-i2v-fast"
  | "wan-video/wan-2.5-i2v"
  | "wan-video/wan-2.5-i2v-fast"
  | "genmo/mochi-1-final"
  | "minimax/video-02";

/**
 * Generation-side video model identifier.
 *
 * Accepts any known literal ID with autocomplete, plus any string for
 * env-configurable model overrides (see NOTE above). This mirrors the
 * previous `(typeof VIDEO_MODELS)[VideoModelKey]` type, which widened to
 * `string` because `VIDEO_MODELS` is not declared `as const`.
 */
export type VideoModelId = KnownVideoModelId | (string & {});

export const CANONICAL_PROMPT_MODEL_IDS = [
  "runway-gen45",
  "luma-ray3",
  "kling-2.1",
  "sora-2",
  "veo-3",
  "wan-2.2",
] as const;

export type CanonicalPromptModelId =
  (typeof CANONICAL_PROMPT_MODEL_IDS)[number];

export interface PromptModelConstraints {
  wordLimits: { min: number; max: number };
  triggerBudgetWords: number;
}

const CANONICAL_PROMPT_MODEL_ID_SET = new Set<string>(
  CANONICAL_PROMPT_MODEL_IDS,
);

export const PROMPT_MODEL_ALIASES: Record<string, CanonicalPromptModelId> = {
  // Canonical values
  "runway-gen45": "runway-gen45",
  "luma-ray3": "luma-ray3",
  "kling-2.1": "kling-2.1",
  "sora-2": "sora-2",
  "veo-3": "veo-3",
  "wan-2.2": "wan-2.2",

  // Friendly aliases
  runway: "runway-gen45",
  luma: "luma-ray3",
  kling: "kling-2.1",
  sora: "sora-2",
  veo: "veo-3",
  wan: "wan-2.2",

  // Legacy prompt aliases
  "kling-26": "kling-2.1",
  "veo-4": "veo-3",
  veo3: "veo-3",
  "veo-3.1": "veo-3",
  "veo-3.1-generate-preview": "veo-3",
  "kling-v2.1": "kling-2.1",
  "kling-v2-1-master": "kling-2.1",
  "kwaivgi/kling-v2.1": "kling-2.1",

  // Generation aliases accepted at prompt boundary
  "google/veo-3": "veo-3",
  "wan-video/wan-2.2-t2v-fast": "wan-2.2",
  "wan-video/wan-2.2-i2v-fast": "wan-2.2",
  "wan-video/wan-2.5-i2v": "wan-2.2",
  "wan-video/wan-2.5-i2v-fast": "wan-2.2",
  "wan-2.5": "wan-2.2",
  pro: "wan-2.2",
  draft: "wan-2.2",
};

export const PROMPT_MODEL_CONSTRAINTS: Record<
  CanonicalPromptModelId,
  PromptModelConstraints
> = {
  "runway-gen45": {
    wordLimits: { min: 50, max: 150 },
    triggerBudgetWords: 25,
  },
  "luma-ray3": {
    wordLimits: { min: 40, max: 120 },
    triggerBudgetWords: 20,
  },
  "kling-2.1": {
    wordLimits: { min: 40, max: 80 },
    triggerBudgetWords: 15,
  },
  "sora-2": {
    wordLimits: { min: 60, max: 120 },
    triggerBudgetWords: 15,
  },
  "veo-3": {
    wordLimits: { min: 50, max: 200 },
    triggerBudgetWords: 25,
  },
  "wan-2.2": {
    wordLimits: { min: 30, max: 60 },
    triggerBudgetWords: 10,
  },
};

export function normalizePromptModelAlias(value: string): string {
  return value.trim().toLowerCase();
}

export function isCanonicalPromptModelId(
  value: string,
): value is CanonicalPromptModelId {
  return CANONICAL_PROMPT_MODEL_ID_SET.has(value);
}

export function resolveCanonicalPromptModelId(
  value?: string | null,
): CanonicalPromptModelId | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const normalized = normalizePromptModelAlias(value);
  return PROMPT_MODEL_ALIASES[normalized] ?? null;
}

/** Release exclusions do not remove historical ids from saved takes. */
export const DEFERRED_RELEASE_GENERATION_MODELS = [
  "kling-2.1",
  "luma-ray3",
  "sora-2",
] as const satisfies readonly CanonicalPromptModelId[];

/**
 * Additional release-policy check for an already registered generation model.
 * Registration/credentials must still be checked by the caller; env-configured
 * provider ids are deliberately not rejected merely for being absent here.
 */
export function isReleaseGenerationModelSupported(model: string): boolean {
  const normalized = normalizePromptModelAlias(model);
  if (normalized.startsWith("sora-2") || normalized.startsWith("openai/sora-2"))
    return false;
  const canonical = resolveCanonicalPromptModelId(model);
  return !DEFERRED_RELEASE_GENERATION_MODELS.some(
    (deferred) => deferred === canonical,
  );
}

export function getPromptModelConstraints(
  value?: string | null,
): PromptModelConstraints | undefined {
  const canonicalModelId = resolveCanonicalPromptModelId(value);
  return canonicalModelId
    ? PROMPT_MODEL_CONSTRAINTS[canonicalModelId]
    : undefined;
}
