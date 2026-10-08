import { useMemo } from "react";
import {
  VIDEO_DRAFT_MODEL,
  VIDEO_DRAFT_MODELS,
  VIDEO_RENDER_MODELS,
} from "@components/ToolSidebar/config/modelConfig";
import type { VideoTier } from "@features/generation-controls";

interface VideoModelSelectionOptions {
  selectedModel: string;
  videoTier: VideoTier;
}
interface VideoModelSelection {
  renderModelOptions: Array<{ id: string; label: string }>;
  renderModelId: string;
}

/** Manual supported-model selection; the recommendation workflow is dormant. */
export function useVideoModelSelection({
  selectedModel,
  videoTier,
}: VideoModelSelectionOptions): VideoModelSelection {
  return useMemo(() => {
    const models = [...VIDEO_DRAFT_MODELS, ...VIDEO_RENDER_MODELS];
    const selected = models.find((model) => model.id === selectedModel);
    return {
      renderModelOptions: models.map(({ id, label }) => ({ id, label })),
      renderModelId:
        selected?.id ??
        (videoTier === "draft"
          ? VIDEO_DRAFT_MODEL.id
          : (VIDEO_RENDER_MODELS[0]?.id ?? VIDEO_DRAFT_MODEL.id)),
    };
  }, [selectedModel, videoTier]);
}
