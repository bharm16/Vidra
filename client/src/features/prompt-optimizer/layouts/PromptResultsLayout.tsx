import React from "react";
import { useToast } from "@components/Toast";
import { FEATURES } from "@/config/features.config";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useBillingStatus } from "@/features/billing/hooks/useBillingStatus";
import { CreditOnboardingBanner } from "@/features/billing/components/CreditOnboardingBanner";
import { useCreditBalance } from "@/contexts/CreditBalanceContext";
import type { ContinuityShot } from "@/features/continuity/types";
import { PromptResultsSection } from "../components/PromptResultsSection";
import { useWorkspaceSession } from "../context/WorkspaceSessionContext";
import {
  ContinuityIntentPicker,
  PipelineStatus,
  PreviousShotContext,
  SceneProxyPreviewPanel,
  ShotVisualStrip,
} from "@features/sequence-editor/components";

/**
 * PromptResultsLayout - Results/Canvas View Layout
 *
 * Main content layout for the results/canvas view (PromptCanvas via PromptResultsSection).
 *
 * App shell (history sidebar + top bar) lives in PromptOptimizerWorkspace.
 */
export const PromptResultsLayout = (): React.ReactElement => {
  const toast = useToast();
  const user = useAuthUser();
  const { status } = useBillingStatus();
  const { balance: currentCreditBalance } = useCreditBalance();
  const {
    session,
    isSequenceMode,
    shots,
    currentShotId,
    currentShot,
    currentShotIndex,
    setCurrentShotId,
    addShot,
    updateShot,
    previewSceneProxy,
    isPreviewingSceneProxy,
  } = useWorkspaceSession();

  const orderedShots = React.useMemo(
    () => [...shots].sort((a, b) => a.sequenceIndex - b.sequenceIndex),
    [shots],
  );

  const previousShot = React.useMemo(
    () =>
      currentShotIndex > 0
        ? (orderedShots[currentShotIndex - 1] ?? null)
        : null,
    [currentShotIndex, orderedShots],
  );

  const handleAddShot = React.useCallback(async (): Promise<void> => {
    try {
      const shot = await addShot({ prompt: " " });
      setCurrentShotId(shot.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add shot",
      );
    }
  }, [addShot, setCurrentShotId, toast]);

  const handleModeChange = React.useCallback(
    (mode: ContinuityShot["continuityMode"]): void => {
      if (!currentShot) return;
      void updateShot(currentShot.id, { continuityMode: mode });
    },
    [currentShot, updateShot],
  );

  const handleStrengthChange = React.useCallback(
    (strength: number): void => {
      if (!currentShot) return;
      void updateShot(currentShot.id, { styleStrength: strength });
    },
    [currentShot, updateShot],
  );

  const shouldShowSceneProxyPreview =
    isSequenceMode &&
    Boolean(currentShot) &&
    currentShotIndex > 0 &&
    currentShot?.continuityMode === "style-match";

  const sceneProxyReferenceFrameUrl =
    typeof session?.continuity?.sceneProxy?.referenceFrameUrl === "string"
      ? session.continuity.sceneProxy.referenceFrameUrl
      : null;
  const sceneProxyStatus = session?.continuity?.sceneProxy?.status ?? null;
  const isSceneProxyReady = sceneProxyStatus === "ready";

  const normalizeRef = React.useCallback(
    (value: string | null | undefined): string | null => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    },
    [],
  );

  const resolveShotReferenceImage = React.useCallback(
    (shot: ContinuityShot | null): string | null =>
      normalizeRef(
        shot?.frameBridge?.frameUrl ??
          shot?.styleReference?.frameUrl ??
          shot?.generatedKeyframeUrl ??
          null,
      ),
    [normalizeRef],
  );

  const buildImageCandidates = React.useCallback(
    (...values: Array<string | null | undefined>): string[] => {
      const normalized = values
        .map((value) => normalizeRef(value))
        .filter((value): value is string => Boolean(value));
      return [...new Set(normalized)];
    },
    [normalizeRef],
  );

  const previewImageCandidates = React.useMemo(
    () =>
      buildImageCandidates(
        currentShot?.sceneProxyRenderUrl ?? null,
        sceneProxyReferenceFrameUrl,
        resolveShotReferenceImage(currentShot),
        resolveShotReferenceImage(previousShot),
      ),
    [
      buildImageCandidates,
      currentShot,
      previousShot,
      resolveShotReferenceImage,
      sceneProxyReferenceFrameUrl,
    ],
  );
  const previewImageCandidateKey = previewImageCandidates.join("|");
  const [previewImageIndex, setPreviewImageIndex] = React.useState(0);
  React.useEffect(() => {
    setPreviewImageIndex(0);
  }, [previewImageCandidateKey]);
  const previewImageUrl =
    previewImageIndex >= 0 && previewImageIndex < previewImageCandidates.length
      ? (previewImageCandidates[previewImageIndex] ?? null)
      : null;
  const handlePreviewImageError = React.useCallback((): void => {
    setPreviewImageIndex((current) => {
      const next = current + 1;
      return next < previewImageCandidates.length
        ? next
        : previewImageCandidates.length;
    });
  }, [previewImageCandidates.length]);

  const normalizeCameraInput = React.useCallback(
    (
      camera: ContinuityShot["camera"] | null | undefined,
    ): {
      yaw?: number;
      pitch?: number;
      roll?: number;
      dolly?: number;
    } | null => {
      if (!camera) return null;
      const normalized = {
        ...(typeof camera.yaw === "number" ? { yaw: camera.yaw } : {}),
        ...(typeof camera.pitch === "number" ? { pitch: camera.pitch } : {}),
        ...(typeof camera.roll === "number" ? { roll: camera.roll } : {}),
        ...(typeof camera.dolly === "number" ? { dolly: camera.dolly } : {}),
      };
      return Object.keys(normalized).length > 0 ? normalized : null;
    },
    [],
  );
  const previewCamera = normalizeCameraInput(currentShot?.camera ?? null);

  const handlePreviewSceneProxy = React.useCallback(async (): Promise<void> => {
    if (!currentShot) return;
    if (!previewCamera) {
      toast.warning("Select camera motion before previewing an angle.");
      return;
    }

    try {
      await previewSceneProxy(currentShot.id, previewCamera);
      toast.success("Angle preview updated");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to render scene proxy preview",
      );
    }
  }, [currentShot, previewCamera, previewSceneProxy, toast]);

  const isGeneratingShot = Boolean(
    currentShot &&
      (currentShot.status === "generating-keyframe" ||
        currentShot.status === "generating-video"),
  );

  return (
    <main
      id="main-content"
      className="bg-app relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-colors duration-300"
    >
      {FEATURES.BILLING_UI ? (
        <CreditOnboardingBanner
          userId={user?.uid ?? null}
          starterGrantCredits={status?.starterGrantCredits ?? null}
          currentBalance={currentCreditBalance}
        />
      ) : null}

      {FEATURES.SEQUENCE_EDITOR_UI &&
        isSequenceMode &&
        orderedShots.length > 1 && (
          <ShotVisualStrip
            shots={orderedShots}
            currentShotId={currentShotId}
            onShotSelect={setCurrentShotId}
            onAddShot={() => void handleAddShot()}
          />
        )}

      {FEATURES.SEQUENCE_EDITOR_UI &&
        isSequenceMode &&
        currentShot &&
        currentShotIndex > 0 && (
          <div className="border-border bg-surface-1 border-b px-3 py-3">
            <div className="space-y-3">
              {previousShot && (
                <PreviousShotContext
                  previousShot={previousShot}
                  continuityMode={currentShot.continuityMode}
                />
              )}

              <ContinuityIntentPicker
                mode={currentShot.continuityMode}
                onModeChange={handleModeChange}
                strength={currentShot.styleStrength ?? 0.6}
                onStrengthChange={handleStrengthChange}
              />

              {shouldShowSceneProxyPreview && (
                <SceneProxyPreviewPanel
                  previewImageUrl={previewImageUrl}
                  onPreviewImageError={handlePreviewImageError}
                  isSceneProxyReady={isSceneProxyReady}
                  isPreviewingSceneProxy={isPreviewingSceneProxy}
                  onPreviewSceneProxy={() => void handlePreviewSceneProxy()}
                  previewCamera={previewCamera}
                />
              )}
            </div>
          </div>
        )}

      <PromptResultsSection />
      {FEATURES.SEQUENCE_EDITOR_UI ? (
        <div className="bg-app px-3 py-2">
          <PipelineStatus shot={currentShot} isGenerating={isGeneratingShot} />
        </div>
      ) : null}
    </main>
  );
};
