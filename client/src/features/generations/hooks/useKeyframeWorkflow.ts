import { useCallback, useEffect, useMemo, useState } from "react";
import type { Asset } from "@shared/types/asset";
import type { KeyframeTile } from "@features/generation-controls";
import type { GenerationParams } from "../types";
import type { GenerationOverrides } from "@features/generation-controls";

interface KeyframeStepState {
  isActive: boolean;
  character: Asset | null;
  pendingModel: string | null;
}

interface UseKeyframeWorkflowOptions {
  prompt: string;
  startFrame: KeyframeTile | null;
  setStartFrame: (frame: KeyframeTile | null) => void;
  clearStartFrame: () => void;
  detectedCharacter: Asset | null;
  onCreateVersionIfNeeded: () => string;
  generateRender: (
    model: string,
    prompt: string,
    params: GenerationParams,
  ) => void;
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

const hasExplicitRenderInputs = (overrides?: GenerationOverrides): boolean =>
  Boolean(
    overrides?.startImage ||
      overrides?.characterAssetId ||
      overrides?.faceSwapAlreadyApplied ||
      overrides?.endImage?.url ||
      (overrides?.referenceImages && overrides.referenceImages.length > 0) ||
      overrides?.extendVideoUrl,
  );

export function useKeyframeWorkflow({
  prompt,
  startFrame,
  setStartFrame,
  clearStartFrame,
  detectedCharacter,
  onCreateVersionIfNeeded,
  generateRender,
}: UseKeyframeWorkflowOptions) {
  const [keyframeStep, setKeyframeStep] = useState<KeyframeStepState>({
    isActive: false,
    character: null,
    pendingModel: null,
  });

  useEffect(() => {
    setKeyframeStep({
      isActive: false,
      character: null,
      pendingModel: null,
    });
  }, [prompt]);

  const runRender = useCallback(
    (model: string, overrides?: GenerationOverrides) => {
      if (!prompt.trim()) return;
      const versionId = onCreateVersionIfNeeded();
      const startImage =
        overrides?.startImage ?? (startFrame ? toStartImage(startFrame) : null);
      const resolvedCharacterAssetId =
        overrides?.characterAssetId ??
        (startImage?.source === "asset"
          ? startImage.assetId
          : detectedCharacter?.id);

      generateRender(model, prompt, {
        promptVersionId: versionId,
        startImage,
        ...(overrides?.endImage ? { endImage: overrides.endImage } : {}),
        ...(overrides?.referenceImages?.length
          ? { referenceImages: overrides.referenceImages }
          : {}),
        ...(overrides?.extendVideoUrl
          ? { extendVideoUrl: overrides.extendVideoUrl }
          : {}),
        ...(resolvedCharacterAssetId
          ? { characterAssetId: resolvedCharacterAssetId }
          : {}),
        ...(overrides?.faceSwapAlreadyApplied
          ? { faceSwapAlreadyApplied: true }
          : {}),
        ...(overrides?.faceSwapUrl
          ? { faceSwapUrl: overrides.faceSwapUrl }
          : {}),
        ...(overrides?.generationParams
          ? { generationParams: overrides.generationParams }
          : {}),
      });
      setKeyframeStep({
        isActive: false,
        character: null,
        pendingModel: null,
      });
    },
    [
      detectedCharacter?.id,
      generateRender,
      onCreateVersionIfNeeded,
      prompt,
      startFrame,
    ],
  );

  const handleRender = useCallback(
    (model: string, overrides?: GenerationOverrides) => {
      if (!prompt.trim()) return;
      if (hasExplicitRenderInputs(overrides)) {
        runRender(model, overrides);
        return;
      }
      if (startFrame) {
        runRender(model, { startImage: toStartImage(startFrame) });
        return;
      }
      if (keyframeStep.isActive) {
        setKeyframeStep((prev) => ({ ...prev, pendingModel: model }));
        return;
      }
      if (detectedCharacter) {
        setKeyframeStep({
          isActive: true,
          character: detectedCharacter,
          pendingModel: model,
        });
        return;
      }

      runRender(model, undefined);
    },
    [detectedCharacter, keyframeStep.isActive, prompt, runRender, startFrame],
  );

  const handleApproveKeyframe = useCallback(
    (keyframeUrl: string) => {
      const modelToUse = keyframeStep.pendingModel ?? "sora-2";
      runRender(modelToUse, {
        startImage: { url: keyframeUrl, source: "keyframe" },
      });
    },
    [keyframeStep.pendingModel, runRender],
  );

  const handleSkipKeyframe = useCallback(() => {
    const modelToUse = keyframeStep.pendingModel ?? "sora-2";
    runRender(modelToUse, undefined);
  }, [keyframeStep.pendingModel, runRender]);

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
    keyframeStep,
    selectedFrameUrl,
    handleRender,
    handleApproveKeyframe,
    handleSkipKeyframe,
    handleSelectFrame,
    handleClearSelectedFrame,
  };
}
