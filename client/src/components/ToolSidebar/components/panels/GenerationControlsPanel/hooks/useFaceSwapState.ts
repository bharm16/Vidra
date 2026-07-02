import { useCallback, useEffect, useMemo, useState } from "react";
import type { Asset } from "@shared/types/asset";
import type { VideoTier } from "@components/ToolSidebar/types";
import { getModelConfig } from "@features/generations/config/generationConfig";
import { faceSwapPreview as requestFaceSwapPreview } from "@/features/preview/api/previewApi";
import { logger } from "@/services/LoggingService";
import type { FaceSwapPreviewState } from "@/features/prompt-optimizer/context/GenerationControlsContext";

const log = logger.child("GenerationControlsPanel");
const FACE_SWAP_CREDIT_COST = 2;

export type FaceSwapMode = "direct" | "face-swap";

interface UseFaceSwapStateOptions {
  assets: Asset[];
  startFrameUrl: string | null;
  startFrameUrlHost: string | null;
  aspectRatio: string;
  draftModelId: string;
  renderModelId: string;
  tier: VideoTier;
  faceSwapPreviewState: FaceSwapPreviewState | null;
  setFaceSwapPreview: (preview: FaceSwapPreviewState | null) => void;
}

interface UseFaceSwapStateResult {
  faceSwap: {
    mode: FaceSwapMode;
    selectedCharacterId: string;
    characterOptions: Array<{ id: string; label: string }>;
    previewUrl: string | null;
    isPreviewReady: boolean;
    isLoading: boolean;
    error: string | null;
    isModalOpen: boolean;
    faceSwapCredits: number;
    videoCredits: number | null;
    totalCredits: number | null;
  };
  derived: {
    canPreviewFaceSwap: boolean;
    isFaceSwapPreviewDisabled: boolean;
  };
  actions: {
    setFaceSwapMode: (mode: FaceSwapMode) => void;
    setFaceSwapCharacterId: (assetId: string) => void;
    handleFaceSwapPreview: () => Promise<void>;
    handleOpenFaceSwapModal: () => void;
    handleCloseFaceSwapModal: () => void;
    handleFaceSwapTryDifferent: () => void;
  };
}

export function useFaceSwapState({
  assets,
  startFrameUrl,
  startFrameUrlHost,
  aspectRatio,
  draftModelId,
  renderModelId,
  tier,
  faceSwapPreviewState,
  setFaceSwapPreview,
}: UseFaceSwapStateOptions): UseFaceSwapStateResult {
  const [faceSwapMode, setFaceSwapMode] = useState<FaceSwapMode>("direct");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [faceSwapCreditsUsed, setFaceSwapCreditsUsed] = useState<number | null>(
    null,
  );
  const [faceSwapError, setFaceSwapError] = useState<string | null>(null);
  const [isFaceSwapLoading, setIsFaceSwapLoading] = useState(false);
  const [isFaceSwapModalOpen, setIsFaceSwapModalOpen] = useState(false);

  const characterOptions = useMemo(
    () =>
      assets
        .filter((asset) => asset.type === "character")
        .map((asset) => ({
          id: asset.id,
          label:
            asset.name || asset.trigger || `Character ${asset.id.slice(0, 6)}`,
        })),
    [assets],
  );

  useEffect(() => {
    if (!selectedCharacterId) return;
    const stillExists = characterOptions.some(
      (asset) => asset.id === selectedCharacterId,
    );
    if (!stillExists) {
      setSelectedCharacterId("");
    }
  }, [characterOptions, selectedCharacterId]);

  useEffect(() => {
    if (faceSwapMode !== "face-swap") return;
    if (selectedCharacterId || characterOptions.length !== 1) return;
    setSelectedCharacterId(characterOptions[0]?.id ?? "");
  }, [characterOptions, faceSwapMode, selectedCharacterId]);

  const resetFaceSwapPreview = useCallback(() => {
    setFaceSwapPreview(null);
    setFaceSwapCreditsUsed(null);
    setFaceSwapError(null);
    setIsFaceSwapLoading(false);
    setIsFaceSwapModalOpen(false);
  }, [setFaceSwapPreview]);

  useEffect(() => {
    if (!faceSwapPreviewState) return;
    if (faceSwapMode !== "face-swap") {
      resetFaceSwapPreview();
      return;
    }
    if (
      !selectedCharacterId ||
      faceSwapPreviewState.characterAssetId !== selectedCharacterId
    ) {
      resetFaceSwapPreview();
      return;
    }
    if (
      !startFrameUrl ||
      faceSwapPreviewState.targetImageUrl !== startFrameUrl
    ) {
      resetFaceSwapPreview();
    }
  }, [
    faceSwapMode,
    faceSwapPreviewState,
    selectedCharacterId,
    startFrameUrl,
    resetFaceSwapPreview,
  ]);

  const hasStartFrame = Boolean(startFrameUrl);
  const canPreviewFaceSwap =
    faceSwapMode === "face-swap" &&
    hasStartFrame &&
    Boolean(selectedCharacterId);
  const isFaceSwapPreviewDisabled = !canPreviewFaceSwap || isFaceSwapLoading;

  const videoCredits = useMemo(() => {
    const modelId = tier === "draft" ? draftModelId : renderModelId;
    return getModelConfig(modelId)?.credits ?? null;
  }, [draftModelId, renderModelId, tier]);
  const totalCredits =
    videoCredits !== null ? videoCredits + FACE_SWAP_CREDIT_COST : null;

  const handleFaceSwapPreview = useCallback(async () => {
    if (!canPreviewFaceSwap || !startFrameUrl) return;
    setIsFaceSwapModalOpen(true);
    setIsFaceSwapLoading(true);
    setFaceSwapError(null);
    setFaceSwapPreview(null);
    setFaceSwapCreditsUsed(null);
    try {
      const response = await requestFaceSwapPreview({
        characterAssetId: selectedCharacterId,
        targetImageUrl: startFrameUrl,
        ...(aspectRatio ? { aspectRatio } : {}),
      });
      if (!response.success) {
        throw new Error(
          response.error || response.message || "Failed to preview face swap",
        );
      }
      if (!response.data.faceSwapUrl) {
        throw new Error("Failed to preview face swap");
      }
      setFaceSwapPreview({
        url: response.data.faceSwapUrl,
        characterAssetId: selectedCharacterId,
        targetImageUrl: startFrameUrl,
        createdAt: Date.now(),
      });
      setFaceSwapCreditsUsed(
        response.data.creditsDeducted ?? FACE_SWAP_CREDIT_COST,
      );
      log.info("Face swap preview completed", {
        characterAssetId: selectedCharacterId,
        targetImageUrlHost: startFrameUrlHost,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFaceSwapError(message);
      log.error("Face swap preview failed", error as Error, {
        characterAssetId: selectedCharacterId,
        targetImageUrlHost: startFrameUrlHost,
      });
    } finally {
      setIsFaceSwapLoading(false);
    }
  }, [
    aspectRatio,
    canPreviewFaceSwap,
    startFrameUrl,
    startFrameUrlHost,
    selectedCharacterId,
    setFaceSwapPreview,
  ]);

  const handleOpenFaceSwapModal = useCallback(() => {
    if (!faceSwapPreviewState?.url) return;
    setIsFaceSwapModalOpen(true);
  }, [faceSwapPreviewState?.url]);

  const handleCloseFaceSwapModal = useCallback(() => {
    setIsFaceSwapModalOpen(false);
  }, []);

  const handleFaceSwapTryDifferent = useCallback(() => {
    resetFaceSwapPreview();
  }, [resetFaceSwapPreview]);

  return {
    faceSwap: {
      mode: faceSwapMode,
      selectedCharacterId,
      characterOptions,
      previewUrl: faceSwapPreviewState?.url ?? null,
      isPreviewReady: Boolean(faceSwapPreviewState?.url),
      isLoading: isFaceSwapLoading,
      error: faceSwapError,
      isModalOpen: isFaceSwapModalOpen,
      faceSwapCredits: faceSwapCreditsUsed ?? FACE_SWAP_CREDIT_COST,
      videoCredits,
      totalCredits,
    },
    derived: {
      canPreviewFaceSwap,
      isFaceSwapPreviewDisabled,
    },
    actions: {
      setFaceSwapMode,
      setFaceSwapCharacterId: setSelectedCharacterId,
      handleFaceSwapPreview,
      handleOpenFaceSwapModal,
      handleCloseFaceSwapModal,
      handleFaceSwapTryDifferent,
    },
  };
}
