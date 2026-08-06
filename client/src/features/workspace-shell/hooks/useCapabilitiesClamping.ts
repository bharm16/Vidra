import { useEffect, useMemo } from "react";
import type {
  CapabilityValues,
  CapabilitiesSchema,
} from "@shared/capabilities";
import { useCapabilities } from "@features/prompt-optimizer/hooks/useCapabilities";
import { logger } from "@/services/LoggingService";
import { VIDEO_DRAFT_MODEL } from "@components/ToolSidebar/config/modelConfig";
import {
  DEFAULT_ASPECT_RATIOS,
  DEFAULT_DURATIONS,
  getFieldInfo,
  resolveNumberOptions,
  resolveStringOptions,
  type FieldInfo,
} from "../utils/capabilities";
import type { GenerationControlsTab } from "@/features/generation-controls";
import type { VideoTier } from "@components/ToolSidebar/types";

const log = logger.child("useCapabilitiesClamping");

interface UseCapabilitiesClampingOptions {
  activeTab: GenerationControlsTab;
  selectedModel: string;
  videoTier: VideoTier;
  renderModelId: string;
  aspectRatio: string;
  duration: number;
  setVideoTier: (tier: VideoTier) => void;
  onAspectRatioChange: (ratio: string) => void;
  onDurationChange: (duration: number) => void;
}

interface UseCapabilitiesClampingResult {
  schema: CapabilitiesSchema | null;
  aspectRatioInfo: FieldInfo | null;
  durationInfo: FieldInfo | null;
  aspectRatioOptions: string[];
  durationOptions: number[];
}

export function useCapabilitiesClamping({
  activeTab,
  selectedModel,
  videoTier,
  renderModelId,
  aspectRatio,
  duration,
  setVideoTier,
  onAspectRatioChange,
  onDurationChange,
}: UseCapabilitiesClampingOptions): UseCapabilitiesClampingResult {
  useEffect(() => {
    if (!selectedModel.trim()) return;
    const expectedTier: VideoTier =
      selectedModel === VIDEO_DRAFT_MODEL.id ? "draft" : "render";
    if (videoTier === expectedTier) return;
    setVideoTier(expectedTier);
  }, [selectedModel, setVideoTier, videoTier]);

  const capabilitiesModelId = useMemo(() => {
    if (activeTab === "video") {
      return videoTier === "draft" ? VIDEO_DRAFT_MODEL.id : renderModelId;
    }
    return renderModelId;
  }, [activeTab, renderModelId, videoTier]);

  const { schema } = useCapabilities(capabilitiesModelId);

  const currentParams = useMemo<CapabilityValues>(
    () => ({
      aspect_ratio: aspectRatio,
      duration_s: duration,
    }),
    [aspectRatio, duration],
  );

  const aspectRatioInfo = useMemo(
    () => getFieldInfo(schema, currentParams, "aspect_ratio"),
    [schema, currentParams],
  );

  const durationInfo = useMemo(
    () => getFieldInfo(schema, currentParams, "duration_s"),
    [schema, currentParams],
  );

  const aspectRatioOptions = useMemo(
    () =>
      resolveStringOptions(
        aspectRatioInfo?.allowedValues,
        DEFAULT_ASPECT_RATIOS,
      ),
    [aspectRatioInfo?.allowedValues],
  );

  const durationOptions = useMemo(
    () => resolveNumberOptions(durationInfo?.allowedValues, DEFAULT_DURATIONS),
    [durationInfo?.allowedValues],
  );

  useEffect(() => {
    if (!aspectRatioOptions.length) return;
    if (aspectRatioOptions.includes(aspectRatio)) return;
    const nextRatio = aspectRatioOptions[0];
    if (!nextRatio) return;
    log.info("Clamping aspect ratio to supported option", {
      previousAspectRatio: aspectRatio,
      nextAspectRatio: nextRatio,
      allowedAspectRatios: aspectRatioOptions,
    });
    onAspectRatioChange(nextRatio);
  }, [aspectRatioOptions, aspectRatio, onAspectRatioChange]);

  useEffect(() => {
    if (!durationOptions.length) return;
    if (durationOptions.includes(duration)) return;
    const closest = durationOptions.reduce((best, value) =>
      Math.abs(value - duration) < Math.abs(best - duration) ? value : best,
    );
    log.info("Clamping duration to supported option", {
      previousDuration: duration,
      nextDuration: closest,
      allowedDurations: durationOptions,
    });
    onDurationChange(closest);
  }, [durationOptions, duration, onDurationChange]);

  return {
    schema,
    aspectRatioInfo,
    durationInfo,
    aspectRatioOptions,
    durationOptions,
  };
}
