import type { Generation, GenerationParams } from "../types";
import {
  deriveGenerationTier,
  getModelConfig,
  getModelCreditCost,
} from "../config/generationConfig";

export const createGenerationId = (): string =>
  `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const resolveGenerationOptions = (
  base?: GenerationParams,
  overrides?: GenerationParams,
): GenerationParams => ({
  promptVersionId: overrides?.promptVersionId ?? base?.promptVersionId ?? null,
  aspectRatio: overrides?.aspectRatio ?? base?.aspectRatio ?? null,
  duration: overrides?.duration ?? base?.duration ?? null,
  fps: overrides?.fps ?? base?.fps ?? null,
  generationParams: overrides?.generationParams ?? base?.generationParams,
  startImage: overrides?.startImage ?? base?.startImage ?? null,
  endImage: overrides?.endImage ?? base?.endImage ?? null,
  referenceImages: overrides?.referenceImages ?? base?.referenceImages,
  extendVideoUrl: overrides?.extendVideoUrl ?? base?.extendVideoUrl ?? null,
  characterAssetId:
    overrides?.characterAssetId ?? base?.characterAssetId ?? null,
  faceSwapAlreadyApplied:
    overrides?.faceSwapAlreadyApplied ?? base?.faceSwapAlreadyApplied,
  faceSwapUrl: overrides?.faceSwapUrl ?? base?.faceSwapUrl ?? null,
});

/**
 * Build the take a creator just asked for.
 *
 * The tier is derived from `model` rather than passed in (ADR-0021): the
 * render button can legitimately resolve to the draft model, so a caller-
 * supplied tier was free to contradict the model actually run — and did.
 */
export const buildGeneration = (
  model: string,
  prompt: string,
  params: GenerationParams,
): Generation => {
  const config = getModelConfig(model);
  const tier = deriveGenerationTier(model);
  const resolvedFaceSwapUrl =
    params.faceSwapUrl ??
    (params.faceSwapAlreadyApplied ? (params.startImage?.url ?? null) : null);
  return {
    id: createGenerationId(),
    tier,
    status: "pending",
    model,
    prompt,
    promptVersionId: params.promptVersionId ?? null,
    createdAt: Date.now(),
    completedAt: null,
    estimatedCost: getModelCreditCost(model, params.duration) || null,
    actualCost: null,
    aspectRatio: params.aspectRatio ?? null,
    duration: params.duration ?? null,
    fps: params.fps ?? null,
    mediaType: config?.mediaType ?? "video",
    mediaUrls: [],
    thumbnailUrl: null,
    characterAssetId: params.characterAssetId ?? null,
    faceSwapApplied: Boolean(resolvedFaceSwapUrl),
    faceSwapUrl: resolvedFaceSwapUrl,
    isFavorite: false,
    generationSettings: {
      selectedModel: model,
      videoTier: tier,
      aspectRatio: params.aspectRatio ?? null,
      duration: params.duration ?? null,
      fps: params.fps ?? null,
      generationParams: params.generationParams ?? null,
    },
    error: null,
  };
};
