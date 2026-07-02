import React, {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Badge, type BadgeProps } from "@promptstudio/system/components/ui";
import { useModelRecommendation } from "../../hooks/useModelRecommendation";
import { useModelComparison } from "../../hooks/useModelComparison";
import {
  getModelLabel,
  normalizeModelIdForSelection,
} from "../../utils/modelLabels";
import type { ModelRecommendationProps } from "./types";
import { ModelScoreCard } from "./ModelScoreCard";
import { ModelComparison } from "../ModelComparison/ModelComparison";
import { cn } from "@/utils/cn";
import { trackModelRecommendationEvent } from "../../api";

const confidenceVariants: Record<string, NonNullable<BadgeProps["variant"]>> = {
  high: "success",
  medium: "warning",
  low: "neutral",
};

const confidenceLabels: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const reasonLabels: Record<string, string> = {
  missing_credentials: "Missing credentials",
  unsupported_model: "Unsupported",
  image_input_unsupported: "No image input",
  insufficient_credits: "Insufficient credits",
  not_entitled: "Not entitled",
  video_generation_unavailable: "Unavailable",
  unavailable: "Unavailable",
  unknown_availability: "Availability unknown",
};

const formatReason = (reason: string): string =>
  reasonLabels[reason] ?? "Unavailable";
const EMPTY_FILTERED_OUT: Array<{ modelId: string; reason: string }> = [];

export function ModelRecommendation({
  prompt,
  mode = "t2v",
  durationSeconds,
  onSelectModel,
  onCompareModels,
  className,
  recommendation: recommendationOverride,
  isLoading: isLoadingOverride,
  error: errorOverride,
}: ModelRecommendationProps): ReactElement | null {
  const hasExternal =
    recommendationOverride !== undefined ||
    isLoadingOverride !== undefined ||
    errorOverride !== undefined;

  const recommendationOptions = useMemo(
    () => ({
      mode,
      enabled: !hasExternal && Boolean(prompt && prompt.trim().length > 0),
      ...(typeof durationSeconds === "number" ? { durationSeconds } : {}),
    }),
    [durationSeconds, hasExternal, mode, prompt],
  );

  const {
    recommendation: fetchedRecommendation,
    isLoading: fetchedLoading,
    error: fetchedError,
  } = useModelRecommendation(prompt, recommendationOptions);

  const recommendation = hasExternal
    ? (recommendationOverride ?? null)
    : fetchedRecommendation;
  const isLoading = hasExternal ? Boolean(isLoadingOverride) : fetchedLoading;
  const error = hasExternal ? (errorOverride ?? null) : fetchedError;

  const summary = recommendation?.recommended;
  const efficient = recommendation?.alsoConsider;
  const filteredOut = recommendation?.filteredOut ?? EMPTY_FILTERED_OUT;
  const comparisonModels = recommendation?.suggestComparison
    ? recommendation?.comparisonModels
    : undefined;
  const comparisonOptions = useMemo(
    () => ({
      ...(recommendation?.recommendations
        ? { recommendations: recommendation.recommendations }
        : {}),
      ...(comparisonModels ? { comparisonModels } : {}),
    }),
    [comparisonModels, recommendation?.recommendations],
  );

  const { comparison, isOpen, openComparison, closeComparison } =
    useModelComparison(comparisonOptions);

  const lastTrackedRecommendationRef = useRef<string | null>(null);

  useEffect(() => {
    const recommendationId = recommendation?.promptId;
    if (!recommendationId) return;
    if (lastTrackedRecommendationRef.current === recommendationId) return;
    lastTrackedRecommendationRef.current = recommendationId;
    void trackModelRecommendationEvent({
      event: "recommendation_viewed",
      recommendationId,
      promptId: recommendationId,
      ...(recommendation?.recommended?.modelId
        ? { recommendedModelId: recommendation.recommended.modelId }
        : {}),
      mode,
      ...(typeof durationSeconds === "number" ? { durationSeconds } : {}),
    });
  }, [
    durationSeconds,
    mode,
    recommendation?.promptId,
    recommendation?.recommended?.modelId,
  ]);

  const handleSelectModel = useCallback(
    (modelId: string) => {
      void trackModelRecommendationEvent({
        event: "model_selected",
        ...(recommendation?.promptId
          ? {
              recommendationId: recommendation.promptId,
              promptId: recommendation.promptId,
            }
          : {}),
        ...(recommendation?.recommended?.modelId
          ? { recommendedModelId: recommendation.recommended.modelId }
          : {}),
        selectedModelId: modelId,
        mode,
        ...(typeof durationSeconds === "number" ? { durationSeconds } : {}),
      });
      onSelectModel(normalizeModelIdForSelection(modelId));
    },
    [
      durationSeconds,
      mode,
      onSelectModel,
      recommendation?.promptId,
      recommendation?.recommended?.modelId,
    ],
  );

  const bestLabel = useMemo(
    () => (summary ? getModelLabel(summary.modelId) : ""),
    [summary],
  );

  const efficientLabel = useMemo(
    () => (efficient ? getModelLabel(efficient.modelId) : ""),
    [efficient],
  );

  const recommendedScore = useMemo(() => {
    if (!summary || !recommendation?.recommendations.length) return null;
    return (
      recommendation.recommendations.find(
        (score) => score.modelId === summary.modelId,
      ) ?? recommendation.recommendations[0]
    );
  }, [recommendation, summary]);

  const efficientScore = useMemo(() => {
    if (!efficient || !recommendation?.recommendations.length) return null;
    return (
      recommendation.recommendations.find(
        (score) => score.modelId === efficient.modelId,
      ) ?? null
    );
  }, [efficient, recommendation]);

  const requirementSummary = useMemo(() => {
    const req = recommendation?.requirements;
    if (req) {
      const labels: string[] = [];
      if (
        req.physics.hasComplexPhysics ||
        req.physics.physicsComplexity === "complex"
      ) {
        labels.push("Complex physics");
      }
      if (req.physics.hasParticleSystems) {
        labels.push("Particle effects");
      }
      if (req.character.requiresFacialPerformance) {
        labels.push("Facial performance");
      }
      if (req.environment.hasUrbanElements) {
        labels.push("Urban environment");
      }
      if (req.environment.hasNature) {
        labels.push("Natural environment");
      }
      if (req.lighting.requiresAtmospherics) {
        labels.push("Atmospherics");
      }
      if (req.style.isStylized) {
        labels.push("Stylized look");
      }
      if (req.motion.hasMorphing) {
        labels.push("Morphing");
      }
      if (labels.length) {
        return labels.slice(0, 2).join(", ");
      }
    }

    const topFactors = recommendation?.recommendations?.[0]?.factorScores ?? [];
    if (!topFactors.length) return null;
    const sorted = [...topFactors].sort(
      (a, b) => b.contribution - a.contribution,
    );
    const labels = sorted.slice(0, 2).map((factor) => factor.label);
    return labels.length ? labels.join(", ") : null;
  }, [recommendation]);

  const canCompare = useMemo(() => {
    if (!comparisonModels || !recommendation?.recommendations?.length)
      return false;
    const [leftId, rightId] = comparisonModels;
    const left = recommendation.recommendations.find(
      (score) => score.modelId === leftId,
    );
    const right = recommendation.recommendations.find(
      (score) => score.modelId === rightId,
    );
    return Boolean(left && right);
  }, [comparisonModels, recommendation]);

  const filteredSummary = useMemo(() => {
    if (!filteredOut.length) return null;
    const maxItems = 2;
    const entries = filteredOut.slice(0, maxItems).map((entry) => {
      const label = getModelLabel(entry.modelId);
      const reason = formatReason(entry.reason);
      return `${label} (${reason})`;
    });
    const extraCount = filteredOut.length - maxItems;
    const suffix = extraCount > 0 ? ` +${extraCount} more` : "";
    return `Unavailable: ${entries.join(", ")}${suffix}`;
  }, [filteredOut]);

  if (isLoading) {
    return (
      <div
        className={cn(
          "border-tool-border-dark bg-tool-nav-active rounded-lg border p-3",
          className,
        )}
      >
        <div className="bg-surface-2 h-3 w-32 animate-pulse rounded" />
        <div className="bg-surface-2 mt-2 h-6 w-full animate-pulse rounded" />
      </div>
    );
  }

  if (error || !recommendation || !summary) {
    return null;
  }

  const confidenceKey = summary.confidence ?? "low";
  const confidenceVariant =
    confidenceVariants[confidenceKey] ?? confidenceVariants["low"] ?? "neutral";
  const confidenceLabel =
    confidenceLabels[confidenceKey] ?? confidenceLabels["low"];

  return (
    <div
      className={cn(
        "border-tool-border-dark bg-tool-nav-active rounded-lg border p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-ghost text-xs font-semibold">
          Model Recommendation
        </span>
        <Badge variant={confidenceVariant} size="xs" className="px-2">
          {confidenceLabel}
        </Badge>
      </div>

      {requirementSummary && (
        <div className="text-tool-text-dim mt-1 text-[11px]">
          Prompt requires: {requirementSummary}
        </div>
      )}
      {summary.reasoning && (
        <div className="text-ghost mt-1 text-[11px]">{summary.reasoning}</div>
      )}

      {recommendedScore && (
        <div className="mt-3">
          <ModelScoreCard
            score={recommendedScore}
            label={`Best Match: ${bestLabel}`}
            variant="primary"
            onSelect={handleSelectModel}
          />
        </div>
      )}

      {efficientScore && efficient && efficient.modelId !== summary.modelId && (
        <div className="mt-2">
          {efficient.reasoning && (
            <div className="text-tool-text-dim mb-1 text-[11px]">
              {efficient.reasoning}
            </div>
          )}
          <ModelScoreCard
            score={efficientScore}
            label={`Efficient Option: ${efficientLabel}`}
            variant="secondary"
            onSelect={handleSelectModel}
          />
        </div>
      )}

      {comparisonModels && canCompare && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="text-tool-text-dim text-[11px]">
            Compare {getModelLabel(comparisonModels[0])} vs{" "}
            {getModelLabel(comparisonModels[1])}
          </div>
          <button
            type="button"
            onClick={() => {
              void trackModelRecommendationEvent({
                event: "compare_opened",
                ...(recommendation?.promptId
                  ? {
                      recommendationId: recommendation.promptId,
                      promptId: recommendation.promptId,
                    }
                  : {}),
                ...(recommendation?.recommended?.modelId
                  ? { recommendedModelId: recommendation.recommended.modelId }
                  : {}),
                mode,
                ...(typeof durationSeconds === "number"
                  ? { durationSeconds }
                  : {}),
              });
              onCompareModels?.(comparisonModels);
              openComparison(comparisonModels);
            }}
            className="border-tool-border-dark text-ghost hover:bg-surface-1 h-7 rounded-md border px-2 text-xs font-semibold"
          >
            {isOpen ? "Hide" : "Compare Both"}
          </button>
        </div>
      )}

      {isOpen && comparison && (
        <div className="mt-3">
          <ModelComparison
            left={comparison.left}
            right={comparison.right}
            onSelectModel={handleSelectModel}
            onClose={closeComparison}
          />
        </div>
      )}

      {filteredSummary && (
        <div className="text-tool-text-dim mt-2 text-[11px]">
          {filteredSummary}
        </div>
      )}
    </div>
  );
}
