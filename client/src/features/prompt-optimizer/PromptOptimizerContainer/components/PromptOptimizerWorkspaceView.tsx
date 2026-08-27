import React from "react";
import type { Asset, AssetType } from "@shared/types/asset";
import { AppShell } from "@components/navigation/AppShell";
import DebugButton from "@components/DebugButton";
import AssetEditor from "@features/assets/components/AssetEditor";
import type { PromptModalsProps } from "@features/prompt-optimizer/types";
import { PromptModals } from "@features/prompt-optimizer/components/PromptModals";
import { QuickCharacterCreate } from "@features/prompt-optimizer/components/QuickCharacterCreate";
import { DetectedAssets } from "@features/prompt-optimizer/components/DetectedAssets";
import { PromptResultsLayout } from "@features/prompt-optimizer/layouts/PromptResultsLayout";

interface QuickCreateState {
  isOpen: boolean;
  prefillTrigger?: string;
}

interface AssetEditorState {
  mode: "create" | "edit";
  asset?: Asset | null;
  preselectedType?: AssetType | null;
}

interface AssetEditorHandlers {
  onClose: () => void;
  onCreate: (data: {
    type: AssetType;
    trigger: string;
    name: string;
    textDefinition?: string;
    negativePrompt?: string;
  }) => Promise<Asset>;
  onUpdate: (
    assetId: string,
    data: {
      trigger?: string;
      name?: string;
      textDefinition?: string;
      negativePrompt?: string;
    },
  ) => Promise<Asset>;
  onAddImage: (
    assetId: string,
    file: File,
    metadata: Record<string, string | undefined>,
  ) => Promise<void>;
  onDeleteImage: (assetId: string, imageId: string) => Promise<void>;
  onSetPrimaryImage: (assetId: string, imageId: string) => Promise<void>;
}

interface DebugProps {
  enabled: boolean;
  inputPrompt: string;
  displayedPrompt: string;
  optimizedPrompt: string;
  selectedMode: string;
  promptContext: Record<string, unknown> | null;
}

interface PromptOptimizerWorkspaceViewProps {
  shouldShowLoading: boolean;
  promptModalsProps: PromptModalsProps;
  quickCreateState: QuickCreateState;
  onQuickCreateClose: () => void;
  onQuickCreateComplete: (asset: Asset) => void;
  assetEditorState: AssetEditorState | null;
  assetEditorHandlers: AssetEditorHandlers;
  detectedAssetsPrompt: string;
  detectedAssets: Asset[];
  onEditAsset: (assetId: string) => void;
  onCreateFromTrigger?: (trigger: string) => void;
  debugProps: DebugProps;
}

export function PromptOptimizerWorkspaceView({
  shouldShowLoading,
  promptModalsProps,
  quickCreateState,
  onQuickCreateClose,
  onQuickCreateComplete,
  assetEditorState,
  assetEditorHandlers,
  detectedAssetsPrompt,
  detectedAssets,
  onEditAsset,
  onCreateFromTrigger,
  debugProps,
}: PromptOptimizerWorkspaceViewProps): React.ReactElement {
  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col overflow-hidden font-sans text-foreground">
        <a href="#main-content" className="ps-skip-link">
          Skip to main content
        </a>

        <PromptModals {...promptModalsProps} />
        <QuickCharacterCreate
          isOpen={quickCreateState.isOpen}
          prefillTrigger={quickCreateState.prefillTrigger}
          onClose={onQuickCreateClose}
          onCreate={onQuickCreateComplete}
        />
        {assetEditorState && (
          <AssetEditor
            key={`${assetEditorState.mode}-${assetEditorState.preselectedType ?? "none"}-${assetEditorState.asset?.id ?? "new"}`}
            mode={assetEditorState.mode}
            asset={assetEditorState.asset || undefined}
            preselectedType={assetEditorState.preselectedType || undefined}
            onClose={assetEditorHandlers.onClose}
            onCreate={assetEditorHandlers.onCreate}
            onUpdate={assetEditorHandlers.onUpdate}
            onAddImage={assetEditorHandlers.onAddImage}
            onDeleteImage={assetEditorHandlers.onDeleteImage}
            onSetPrimaryImage={assetEditorHandlers.onSetPrimaryImage}
          />
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DetectedAssets
            prompt={detectedAssetsPrompt}
            assets={detectedAssets}
            onEditAsset={onEditAsset}
            {...(onCreateFromTrigger ? { onCreateFromTrigger } : {})}
          />

          {shouldShowLoading ? (
            <main
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
              id="main-content"
            >
              <div className="flex flex-1 items-center justify-center px-6 py-9 sm:px-8 sm:py-10">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-border-strong" />
                  <p className="text-body-sm text-muted">Loading prompt...</p>
                </div>
              </div>
            </main>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <PromptResultsLayout />
            </div>
          )}
        </div>

        {debugProps.enabled && (
          <DebugButton
            inputPrompt={debugProps.inputPrompt}
            displayedPrompt={debugProps.displayedPrompt}
            optimizedPrompt={debugProps.optimizedPrompt}
            selectedMode={debugProps.selectedMode}
            promptContext={debugProps.promptContext}
          />
        )}
      </div>
    </AppShell>
  );
}
