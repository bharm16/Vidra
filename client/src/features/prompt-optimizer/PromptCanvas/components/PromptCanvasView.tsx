import React from "react";
import { CollapsibleDrawer } from "@components/CollapsibleDrawer";
import { FEATURES } from "@/config/features.config";
import { cn } from "@/utils/cn";
import { CategoryLegend } from "@features/prompt-optimizer/components/CategoryLegend";
import { VersionsPanel } from "@features/prompt-optimizer/components/VersionsPanel";
import { GenerationsPanel } from "@features/generations";
import { SpanCategoryAccordion } from "@features/prompt-optimizer/SpanCategoryAccordion/SpanCategoryAccordion";
import { HighlightingErrorBoundary } from "@features/span-highlighting/components/HighlightingErrorBoundary";
import { CoherencePanel } from "@features/prompt-optimizer/components/coherence/CoherencePanel";
import { CoherenceMarkPopover } from "./CoherenceMarkPopover";
import { useCoherence } from "@features/prompt-optimizer/context/CoherenceContext";
import { CanvasWorkspace } from "@features/workspace-shell";
import type { PromptCanvasViewProps } from "./PromptCanvasView.types";
import { PromptCanvasEditorSection } from "./PromptCanvasEditorSection";
import { PromptCanvasMobileGenerations } from "./PromptCanvasMobileGenerations";
import { PromptCanvasDiffDialog } from "./PromptCanvasDiffDialog";

export function PromptCanvasView({
  selectedMode,
  outlineOverlayActive,
  outlineOverlayState,
  outlineOverlayRef,
  categorySpans,
  onCategorySpanHoverChange,
  showLegend,
  onCloseLegend,
  promptContext,
  isSuggestionsOpen,
  editorColumnRef,
  versionsDrawer,
  versionsPanelProps,
  generationsPanelProps,
  onReuseGeneration,
  onToggleGenerationFavorite,
  generationsSheetOpen,
  onGenerationsSheetOpenChange,
  showDiff,
  onShowDiffChange,
  inputPrompt,
  normalizedDisplayedPrompt,
  editing,
  editorSection,
}: PromptCanvasViewProps): React.ReactElement {
  const coherence = useCoherence();
  if (FEATURES.CANVAS_FIRST_LAYOUT) {
    return (
      <>
        <CanvasWorkspace
          generationsPanelProps={generationsPanelProps}
          onReuseGeneration={onReuseGeneration}
          onToggleGenerationFavorite={onToggleGenerationFavorite}
          editing={editing}
        />
        {/*
          The canvas-first layout has no coherence panel (the handoff specifies
          none — see CoherenceContextValue), so the mark itself is the surface:
          hovering an underlined span opens the explanation and the fix.
        */}
        <CoherenceMarkPopover editorRef={editing.editorRef} />
      </>
    );
  }

  return (
    <div
      className={cn("relative flex min-h-0 flex-1 flex-col pb-20 lg:pb-0")}
      data-mode={selectedMode}
      data-outline-open={outlineOverlayActive ? "true" : "false"}
    >
      <CategoryLegend
        show={showLegend}
        onClose={onCloseLegend}
        hasContext={promptContext?.hasContext() ?? false}
        isSuggestionsOpen={isSuggestionsOpen}
      />

      {outlineOverlayActive && (
        <div
          ref={outlineOverlayRef}
          className={cn(
            "z-modal border-border bg-surface-1 absolute bottom-6 left-6 top-6 flex w-96 flex-col overflow-hidden rounded-xl border shadow-lg",
            "ps-animate-scale-in",
          )}
          data-state={outlineOverlayState}
          role="dialog"
          aria-label="Prompt structure"
        >
          <div className="border-border border-b p-4">
            <div className="text-body-lg text-foreground font-semibold">
              Prompt Structure
            </div>
            <div className="text-meta text-muted mt-1">
              Semantic breakdown used for generation
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <HighlightingErrorBoundary>
              <SpanCategoryAccordion
                spans={categorySpans}
                editorRef={editing.editorRef as React.RefObject<HTMLElement>}
                onSpanHoverChange={onCategorySpanHoverChange}
              />
            </HighlightingErrorBoundary>
          </div>
          <div className="border-border p-ps-3 text-meta text-muted border-t">
            Hover a token to locate it in the prompt
          </div>
        </div>
      )}

      <div
        className={cn(
          "gap-ps-3 p-ps-3 bg-tool-panel-inner relative flex min-h-0 flex-1 flex-col",
          outlineOverlayActive && "pointer-events-none opacity-60",
        )}
      >
        <div className="gap-ps-4 lg:gap-ps-5 flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="gap-ps-3 flex min-h-0 min-w-0 flex-1 flex-col self-stretch lg:min-w-80 lg:flex-[9]">
            <div
              ref={editorColumnRef}
              className={cn("flex min-h-0 min-w-0 flex-1 flex-col")}
            >
              <div className="flex min-h-[200px] flex-auto flex-col overflow-y-auto lg:min-h-[300px]">
                <div className="pb-ps-card flex h-full min-h-0 w-full flex-1 flex-col gap-0 overflow-hidden px-0">
                  <PromptCanvasEditorSection
                    {...editorSection}
                    {...editing}
                    outlineOverlayActive={outlineOverlayActive}
                    onShowDiffChange={onShowDiffChange}
                  />
                </div>
              </div>
            </div>
          </div>

          {/*
            Unreachable while CANVAS_FIRST_LAYOUT is on (it defaults to true):
            this is below the early return above, so only the legacy layout
            renders it. The shipping layout explains marks with
            CoherenceMarkPopover instead. Kept rather than moved or deleted;
            see CoherenceContextValue for the decisions that settle it.
          */}
          <CoherencePanel
            issues={coherence.issues}
            isChecking={coherence.isChecking}
            isExpanded={coherence.isPanelExpanded}
            onToggleExpanded={coherence.onTogglePanelExpanded}
            onDismissIssue={coherence.onDismissIssue}
            onDismissAll={coherence.onDismissAll}
            onApplyFix={coherence.onApplyFix}
            onScrollToSpan={coherence.onScrollToSpan}
          />

          <CollapsibleDrawer
            isOpen={versionsDrawer.isOpen}
            onToggle={versionsDrawer.toggle}
            height="132px"
            collapsedHeight="36px"
            position="bottom"
            displayMode={versionsDrawer.displayMode}
            showToggle={false}
          >
            <VersionsPanel
              versions={versionsPanelProps.versions}
              selectedVersionId={versionsPanelProps.selectedVersionId}
              onSelectVersion={versionsPanelProps.onSelectVersion}
              onCreateVersion={versionsPanelProps.onCreateVersion}
              isCompact={!versionsDrawer.isOpen}
              onExpandDrawer={versionsDrawer.open}
              onCollapseDrawer={versionsDrawer.close}
              layout="horizontal"
            />
          </CollapsibleDrawer>
        </div>

        <div
          className="bg-tool-rail-border hidden w-px self-stretch lg:block"
          aria-hidden="true"
        />

        <div className="lg:min-w-88 hidden min-h-0 flex-1 flex-col lg:flex lg:flex-[11]">
          <GenerationsPanel {...generationsPanelProps} />
        </div>
      </div>

      <PromptCanvasMobileGenerations
        generationsSheetOpen={generationsSheetOpen}
        onGenerationsSheetOpenChange={onGenerationsSheetOpenChange}
        generationsPanelProps={generationsPanelProps}
      />

      <PromptCanvasDiffDialog
        showDiff={showDiff}
        onShowDiffChange={onShowDiffChange}
        inputPrompt={inputPrompt}
        normalizedDisplayedPrompt={normalizedDisplayedPrompt}
      />
    </div>
  );
}
