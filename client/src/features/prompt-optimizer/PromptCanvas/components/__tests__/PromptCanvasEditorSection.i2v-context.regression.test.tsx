/**
 * Regression: the editor section must read the published i2v context instead of
 * calling useI2VContext a second time.
 *
 * useI2VContext owns an image-observation POST, and despite the name it has no
 * provider — it is plain per-call-site state. The workspace already calls it and
 * publishes the value on PromptResultsActionsContext; the editor section called
 * it again, so a single start frame was analysed twice.
 */

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  DEFAULT_GENERATION_CONTROLS_STATE,
  GenerationControlsStoreProvider,
  type GenerationControlsState,
} from "@features/generation-controls";
import { GenerationControlsProvider } from "@features/prompt-optimizer/context/GenerationControlsContext";
import { PromptResultsActionsProvider } from "@features/prompt-optimizer/context/PromptResultsActionsContext";
import {
  SelectedSpanProvider,
  type SelectedSpanContextValue,
} from "@features/prompt-optimizer/context/SelectedSpanContext";
import { observeImage } from "@features/prompt-optimizer/api/i2vApi";
import type { I2VContext } from "@features/prompt-optimizer/types/i2v";
import { PromptCanvasEditorSection } from "../PromptCanvasEditorSection";

vi.mock("@features/prompt-optimizer/api/i2vApi", () => ({
  observeImage: vi.fn(),
}));

vi.mock("@/services/media/MediaUrlResolver", () => ({
  resolveMediaUrl: vi.fn(async ({ url }: { url: string | null }) => ({ url })),
}));

const START_FRAME_URL = "https://example.com/start-frame.png";

const I2V_PLACEHOLDER =
  "Optional: add motion direction (or leave blank to animate the image)";

const buildState = (startFrame: unknown): GenerationControlsState => ({
  ...DEFAULT_GENERATION_CONTROLS_STATE,
  domain: {
    ...DEFAULT_GENERATION_CONTROLS_STATE.domain,
    startFrame: startFrame as GenerationControlsState["domain"]["startFrame"],
  },
});

const selectedSpanValue = {
  selectedSpanId: null,
  selectionLabel: "",
  isMotionSelection: false,
  suggestionCount: 0,
  suggestionsListRef: { current: null },
  inlineSuggestions: [],
  activeSuggestionIndex: 0,
  onActiveSuggestionChange: vi.fn(),
  interactionSourceRef: { current: "mouse" },
  onSuggestionClick: vi.fn(),
  onCloseInlinePopover: vi.fn(),
  onApplyActiveSuggestion: vi.fn(),
  customRequest: "",
  onCustomRequestChange: vi.fn(),
  customRequestError: "",
  onCustomRequestErrorChange: vi.fn(),
  onCustomRequestSubmit: vi.fn(),
  isCustomRequestDisabled: true,
  isCustomLoading: false,
  responseMetadata: null,
  isInlineLoading: false,
  isInlineError: false,
  inlineErrorMessage: "",
  isInlineEmpty: false,
} as unknown as SelectedSpanContextValue;

const editorSectionProps = {
  modelFormatValue: "auto",
  modelFormatLabel: "Auto (Generic)",
  modelFormatOptions: [],
  modelFormatDisabled: false,
  onModelFormatChange: vi.fn(),
  outlineOverlayActive: false,
  openOutlineOverlay: vi.fn(),
  onCopy: vi.fn(),
  copied: false,
  onUndo: vi.fn(),
  canUndo: false,
  onRedo: vi.fn(),
  canRedo: false,
  exportMenuRef: { current: null },
  showExportMenu: false,
  onToggleExportMenu: vi.fn(),
  onShowDiffChange: vi.fn(),
  onExport: vi.fn(),
  onShare: vi.fn(),
  isOutputLoading: false,
  editorWrapperRef: { current: null },
  editorRef: { current: null },
  onTextSelection: vi.fn(),
  onHighlightClick: vi.fn(),
  onHighlightMouseDown: vi.fn(),
  onHighlightMouseEnter: vi.fn(),
  onHighlightMouseLeave: vi.fn(),
  onCopyEvent: vi.fn(),
  onInput: vi.fn(),
  onEditorKeyDown: vi.fn(),
  onEditorBlur: vi.fn(),
  autocompleteOpen: false,
  autocompleteSuggestions: [],
  autocompleteSelectedIndex: 0,
  autocompletePosition: null,
  autocompleteLoading: false,
  onAutocompleteSelect: vi.fn(),
  onAutocompleteClose: vi.fn(),
  onAutocompleteIndexChange: vi.fn(),
  outputLocklineRef: { current: null },
  enableMLHighlighting: false,
  hoveredSpanId: null,
  lockButtonPosition: null,
  lockButtonRef: { current: null },
  onToggleLock: vi.fn(),
  onCancelHideLockButton: vi.fn(),
  onLockButtonMouseLeave: vi.fn(),
  isHoveredLocked: false,
} as unknown as React.ComponentProps<typeof PromptCanvasEditorSection>;

const renderEditorSection = ({
  startFrame,
  i2vContext,
}: {
  startFrame: unknown;
  i2vContext: I2VContext | null;
}): void => {
  const wrapper = ({
    children,
  }: {
    children: ReactNode;
  }): React.ReactElement => (
    <GenerationControlsStoreProvider initialState={buildState(startFrame)}>
      <GenerationControlsProvider>
        <PromptResultsActionsProvider
          currentPromptUuid={null}
          currentPromptDocId={null}
          displayedPrompt=""
          isApplyingHistoryRef={{ current: false }}
          handleDisplayedPromptChange={vi.fn()}
          updateEntryOutput={vi.fn(async () => undefined)}
          setOutputSaveState={vi.fn()}
          setOutputLastSavedAt={vi.fn()}
          user={null}
          onReoptimize={vi.fn(async () => undefined)}
          onFetchSuggestions={vi.fn()}
          onSuggestionClick={vi.fn()}
          onHighlightsPersist={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          stablePromptContext={null}
          suggestionsData={null}
          i2vContext={i2vContext}
        >
          <SelectedSpanProvider value={selectedSpanValue}>
            {children}
          </SelectedSpanProvider>
        </PromptResultsActionsProvider>
      </GenerationControlsProvider>
    </GenerationControlsStoreProvider>
  );

  render(<PromptCanvasEditorSection {...editorSectionProps} />, { wrapper });
};

describe("PromptCanvasEditorSection i2v context (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(observeImage).mockResolvedValue({
      success: true,
      cached: false,
      usedFastPath: false,
      durationMs: 1,
    });
  });

  it("does not issue its own image observation request for the start frame", async () => {
    renderEditorSection({
      startFrame: { id: "start", url: START_FRAME_URL, source: "upload" },
      i2vContext: null,
    });

    // The observation POST is fired from an effect behind an awaited URL
    // resolution, so drain the microtask queue before asserting it never ran.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(observeImage).not.toHaveBeenCalled();
  });

  it("takes i2v mode from the published context, not from its own hook", () => {
    renderEditorSection({
      // No start frame in the store — a self-owned useI2VContext would report
      // isI2VMode === false here.
      startFrame: null,
      i2vContext: {
        isI2VMode: true,
        startImageUrl: START_FRAME_URL,
        startImageSourcePrompt: null,
        observation: null,
        isAnalyzing: false,
        error: null,
        refreshObservation: vi.fn(async () => undefined),
      },
    });

    expect(screen.getByRole("textbox")).toHaveAttribute(
      "data-placeholder",
      I2V_PLACEHOLDER,
    );
  });
});
