import { useMemo } from "react";
import { FEATURES } from "@/config/features.config";
import { useModelRecommendation } from "@/features/model-intelligence";
import { MIN_PROMPT_LENGTH_FOR_RECOMMENDATION } from "@/features/model-intelligence/constants";
import { normalizeModelIdForSelection } from "@/features/model-intelligence/utils/modelLabels";
import {
  VIDEO_DRAFT_MODEL,
  VIDEO_RENDER_MODELS,
} from "@components/ToolSidebar/config/modelConfig";
import type { VideoTier } from "@components/ToolSidebar/types";
import type { HighlightSnapshot } from "@/features/prompt-optimizer/context/types";
import type {
  ModelRecommendation,
  ModelRecommendationSpan,
} from "@/features/model-intelligence/types";

interface UseModelSelectionRecommendationOptions {
  prompt: string;
  activeTab: "image" | "video";
  keyframesCount: number;
  durationSeconds: number;
  selectedModel: string;
  videoTier: VideoTier;
  promptHighlights?: HighlightSnapshot | null;
}

interface UseModelSelectionRecommendationResult {
  recommendationMode: "i2v" | "t2v";
  modelRecommendation: ModelRecommendation | null;
  isRecommendationLoading: boolean;
  recommendationError: string | null;
  recommendedModelId: string | undefined;
  efficientModelId: string | undefined;
  renderModelOptions: Array<{ id: string; label: string }>;
  renderModelId: string;
  recommendationAgeMs: number | null;
}

const buildRecommendationSpans = (
  prompt: string,
  spans: HighlightSnapshot["spans"] | undefined,
): ModelRecommendationSpan[] | undefined => {
  if (!spans?.length) return undefined;
  if (!prompt.trim()) return undefined;

  const maxIndex = prompt.length;
  const normalizedSpans = spans
    .map((span) => {
      const start = Math.max(0, Math.min(maxIndex, Math.floor(span.start)));
      const end = Math.max(0, Math.min(maxIndex, Math.floor(span.end)));
      if (start >= end) return null;
      const text = prompt.slice(start, end).trim();
      if (!text) return null;
      return {
        text,
        start,
        end,
        category: span.category,
        confidence: span.confidence,
      };
    })
    .filter((span): span is NonNullable<typeof span> => span !== null);

  return normalizedSpans.length ? normalizedSpans : undefined;
};

export function useModelSelectionRecommendation({
  prompt,
  activeTab,
  keyframesCount,
  durationSeconds,
  selectedModel,
  videoTier,
  promptHighlights,
}: UseModelSelectionRecommendationOptions): UseModelSelectionRecommendationResult {
  const trimmedPrompt = prompt.trim();
  const trimmedPromptLength = trimmedPrompt.length;

  const recommendationSpans = useMemo(
    () => buildRecommendationSpans(prompt, promptHighlights?.spans),
    [prompt, promptHighlights?.spans],
  );

  const recommendationMode = useMemo(
    () => (keyframesCount > 0 ? "i2v" : "t2v"),
    [keyframesCount],
  );

  const shouldLoadRecommendations = useMemo(
    () =>
      // ADR-0002: model-intelligence is premature — v1 hardcodes the model,
      // so recommendation calls stay off the canvas hot path.
      FEATURES.MODEL_INTELLIGENCE_UI &&
      activeTab === "video" &&
      trimmedPromptLength >= MIN_PROMPT_LENGTH_FOR_RECOMMENDATION,
    [activeTab, trimmedPromptLength],
  );

  const {
    recommendation: modelRecommendation,
    isLoading: isRecommendationLoading,
    error: recommendationError,
  } = useModelRecommendation(prompt, {
    mode: recommendationMode,
    enabled: shouldLoadRecommendations,
    ...(typeof durationSeconds === "number" ? { durationSeconds } : {}),
    ...(recommendationSpans ? { spans: recommendationSpans } : {}),
  });

  const recommendedModelId = useMemo(() => {
    const modelId = modelRecommendation?.recommended?.modelId;
    return modelId ? normalizeModelIdForSelection(modelId) : undefined;
  }, [modelRecommendation?.recommended?.modelId]);

  const efficientModelId = useMemo(() => {
    const modelId = modelRecommendation?.alsoConsider?.modelId;
    return modelId ? normalizeModelIdForSelection(modelId) : undefined;
  }, [modelRecommendation?.alsoConsider?.modelId]);

  const renderModelOptions = useMemo(
    () =>
      VIDEO_RENDER_MODELS.map((model) => ({
        id: model.id,
        label: model.label,
      })),
    [],
  );

  const renderModelId = useMemo(() => {
    if (selectedModel === VIDEO_DRAFT_MODEL.id) {
      return VIDEO_DRAFT_MODEL.id;
    }

    if (
      selectedModel &&
      VIDEO_RENDER_MODELS.some((model) => model.id === selectedModel)
    ) {
      return selectedModel;
    }

    if (videoTier === "draft") {
      return VIDEO_DRAFT_MODEL.id;
    }

    return VIDEO_RENDER_MODELS[0]?.id ?? "";
  }, [selectedModel, videoTier]);

  const recommendationAgeMs = useMemo(() => {
    const computedAt = modelRecommendation?.computedAt;
    if (!computedAt || typeof computedAt !== "string") return null;
    const timestamp = Date.parse(computedAt);
    if (!Number.isFinite(timestamp)) return null;
    return Date.now() - timestamp;
  }, [modelRecommendation?.computedAt]);

  return {
    recommendationMode,
    modelRecommendation,
    isRecommendationLoading,
    recommendationError,
    recommendedModelId,
    efficientModelId,
    renderModelOptions,
    renderModelId,
    recommendationAgeMs,
  };
}
