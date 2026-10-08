import { useCallback, useMemo } from "react";
import type { KeyframeTile } from "@features/generation-controls";
import type { GenerationParams } from "../types";
import type { GenerationOverrides } from "@features/generation-controls";

interface UseKeyframeWorkflowOptions {
  prompt: string;
  startFrame: KeyframeTile | null;
  setStartFrame: (frame: KeyframeTile | null) => void;
  clearStartFrame: () => void;
  onCreateVersionIfNeeded: () => string;
  generateRender: (
    model: string,
    prompt: string,
    params: GenerationParams,
  ) => void;
}

interface UseKeyframeWorkflowResult {
  selectedFrameUrl: string | null;
  handleRender: (
    model: string,
    overrides?: GenerationOverrides,
    promptOverride?: string,
  ) => void;
  handleSelectFrame: (
    url: string,
    frameIndex: number,
    generationId: string,
    storagePath?: string,
    sourcePrompt?: string,
  ) => void;
  handleClearSelectedFrame: () => void;
}

const createFrameSelectionId = (
  generationId: string,
  frameIndex: number,
): string => `frame-${generationId}-${frameIndex}`;

const toStartImage = (
  frame: KeyframeTile,
): NonNullable<GenerationOverrides["startImage"]> => ({
  url: frame.url,
  source: frame.source,
  ...(frame.assetId ? { assetId: frame.assetId } : {}),
  ...(frame.storagePath ? { storagePath: frame.storagePath } : {}),
  ...(frame.viewUrlExpiresAt
    ? { viewUrlExpiresAt: frame.viewUrlExpiresAt }
    : {}),
  ...(frame.generationId ? { generationId: frame.generationId } : {}),
});

export function useKeyframeWorkflow({
  prompt,
  startFrame,
  setStartFrame,
  clearStartFrame,
  onCreateVersionIfNeeded,
  generateRender,
}: UseKeyframeWorkflowOptions): UseKeyframeWorkflowResult {
  const runRender = useCallback(
    (
      model: string,
      overrides?: GenerationOverrides,
      promptOverride?: string,
    ) => {
      const effectivePrompt = prompt.trim() ? prompt : (promptOverride ?? "");
      if (!effectivePrompt.trim()) return;
      const versionId = onCreateVersionIfNeeded();
      const startImage =
        overrides?.startImage ?? (startFrame ? toStartImage(startFrame) : null);

      generateRender(model, effectivePrompt, {
        promptVersionId: versionId,
        startImage,
        ...(overrides?.endImage ? { endImage: overrides.endImage } : {}),
        ...(overrides?.referenceImages?.length
          ? { referenceImages: overrides.referenceImages }
          : {}),
        ...(overrides?.extendVideoUrl
          ? { extendVideoUrl: overrides.extendVideoUrl }
          : {}),
        ...(overrides?.generationParams
          ? { generationParams: overrides.generationParams }
          : {}),
      });
    },
    [generateRender, onCreateVersionIfNeeded, prompt, startFrame],
  );

  const handleSelectFrame = useCallback(
    (
      url: string,
      frameIndex: number,
      generationId: string,
      storagePath?: string,
      sourcePrompt?: string,
    ) => {
      setStartFrame({
        id: createFrameSelectionId(generationId, frameIndex),
        url,
        source: "generation",
        ...(sourcePrompt ? { sourcePrompt } : {}),
        ...(storagePath ? { storagePath } : {}),
      });
    },
    [setStartFrame],
  );

  const handleClearSelectedFrame = useCallback(() => {
    clearStartFrame();
  }, [clearStartFrame]);

  const selectedFrameUrl = useMemo(() => {
    if (!startFrame) return null;
    return startFrame.source === "generation" ? startFrame.url : null;
  }, [startFrame]);

  return {
    selectedFrameUrl,
    handleRender: runRender,
    handleSelectFrame,
    handleClearSelectedFrame,
  };
}
