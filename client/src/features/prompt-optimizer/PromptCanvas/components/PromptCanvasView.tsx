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
  editorRef,
  onCategorySpanHoverChange,
  showLegend,
  onCloseLegend,
  promptContext,
  isSuggestionsOpen,
  hasCanvasContent,
  editorColumnRef,
  editorWrapperRef,
  outputLocklineRef,
  lockButtonRef,
  onTextSelection,
  onHighlightClick,
  onHighlightMouseDown,
  onHighlightMouseEnter,
  onHighlightMouseLeave,
  onCopyEvent,
  onInput,
  onEditorKeyDown,
  onEditorBlur,
  autocompleteOpen,
  autocompleteSuggestions,
  autocompleteSelectedIndex,
  autocompletePosition,
  autocompleteLoading,
  onAutocompleteSelect,
  onAutocompleteClose,
  onAutocompleteIndexChange,
  enableMLHighlighting,
  hoveredSpanId,
  lockButtonPosition,
  isHoveredLocked,
  onToggleLock,
  onCancelHideLockButton,
  onLockButtonMouseLeave,
  isOutputLoading,
  coherenceIssues,
  isCoherenceChecking,
  isCoherencePanelExpanded,
  onToggleCoherencePanelExpanded,
  onDismissCoherenceIssue,
  onDismissAllCoherenceIssues,
  onApplyCoherenceFix,
  onScrollToCoherenceSpan,
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
  openOutlineOverlay,
  copied,
  onCopy,
  modelFormatValue,
  modelFormatLabel,
  modelFormatOptions,
  modelFormatDisabled,
  onModelFormatChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  exportMenuRef,
  showExportMenu,
  onToggleExportMenu,
  onExport,
  onShare,
}: PromptCanvasViewProps): React.ReactElement {
  if (FEATURES.CANVAS_FIRST_LAYOUT) {
    return (
      <CanvasWorkspace
        generationsPanelProps={generationsPanelProps}
        onReuseGeneration={onReuseGeneration}
        onToggleGenerationFavorite={onToggleGenerationFavorite}
        copied={copied}
        canUndo={canUndo}
        canRedo={canRedo}
        onCopy={onCopy}
        onShare={onShare}
        onUndo={onUndo}
        onRedo={onRedo}
        editorRef={editorRef as React.RefObject<HTMLDivElement>}
        onTextSelection={onTextSelection}
        onHighlightClick={onHighlightClick}
        onHighlightMouseDown={onHighlightMouseDown}
        onHighlightMouseEnter={onHighlightMouseEnter}
        onHighlightMouseLeave={onHighlightMouseLeave}
        onCopyEvent={onCopyEvent}
        onInput={onInput}
        onEditorKeyDown={onEditorKeyDown}
        onEditorBlur={onEditorBlur}
        autocompleteOpen={autocompleteOpen}
        autocompleteSuggestions={autocompleteSuggestions}
        autocompleteSelectedIndex={autocompleteSelectedIndex}
        autocompletePosition={autocompletePosition}
        autocompleteLoading={autocompleteLoading}
        onAutocompleteSelect={onAutocompleteSelect}
        onAutocompleteClose={onAutocompleteClose}
        onAutocompleteIndexChange={onAutocompleteIndexChange}
      />
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
                editorRef={editorRef as React.RefObject<HTMLElement>}
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
        {!hasCanvasContent ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <div className="max-w-md space-y-4">
              <h2 className="text-heading-24 text-foreground font-semibold">
                Describe your shot
              </h2>
              <p className="text-body text-muted">
                Enter a rough prompt in the bar above and we'll optimize it for
                cinematic video generation.
              </p>
              <div className="pt-4">
                <p className="text-label-sm text-faint">
                  Tip: Press{" "}
                  <kbd className="bg-surface-3 text-muted rounded px-1.5 py-0.5 font-mono text-xs">
                    ⌘
                  </kbd>{" "}
                  +{" "}
                  <kbd className="bg-surface-3 text-muted rounded px-1.5 py-0.5 font-mono text-xs">
                    Enter
                  </kbd>{" "}
                  to optimize
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="gap-ps-4 lg:gap-ps-5 flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="gap-ps-3 flex min-h-0 min-w-0 flex-1 flex-col self-stretch lg:min-w-80 lg:flex-[9]">
              <div
                ref={editorColumnRef}
                className={cn("flex min-h-0 min-w-0 flex-1 flex-col")}
              >
                <div className="flex min-h-[200px] flex-auto flex-col overflow-y-auto lg:min-h-[300px]">
                  <div className="pb-ps-card flex h-full min-h-0 w-full flex-1 flex-col gap-0 overflow-hidden px-0">
                    <PromptCanvasEditorSection
                      modelFormatValue={modelFormatValue}
                      modelFormatLabel={modelFormatLabel}
                      modelFormatOptions={modelFormatOptions}
                      modelFormatDisabled={modelFormatDisabled}
                      onModelFormatChange={onModelFormatChange}
                      outlineOverlayActive={outlineOverlayActive}
                      openOutlineOverlay={openOutlineOverlay}
                      onCopy={onCopy}
                      copied={copied}
                      onUndo={onUndo}
                      canUndo={canUndo}
                      onRedo={onRedo}
                      canRedo={canRedo}
                      exportMenuRef={exportMenuRef}
                      showExportMenu={showExportMenu}
                      onToggleExportMenu={onToggleExportMenu}
                      onShowDiffChange={onShowDiffChange}
                      onExport={onExport}
                      onShare={onShare}
                      isOutputLoading={isOutputLoading}
                      editorWrapperRef={editorWrapperRef}
                      editorRef={editorRef}
                      onTextSelection={onTextSelection}
                      onHighlightClick={onHighlightClick}
                      onHighlightMouseDown={onHighlightMouseDown}
                      onHighlightMouseEnter={onHighlightMouseEnter}
                      onHighlightMouseLeave={onHighlightMouseLeave}
                      onCopyEvent={onCopyEvent}
                      onInput={onInput}
                      onEditorKeyDown={onEditorKeyDown}
                      onEditorBlur={onEditorBlur}
                      autocompleteOpen={autocompleteOpen}
                      autocompleteSuggestions={autocompleteSuggestions}
                      autocompleteSelectedIndex={autocompleteSelectedIndex}
                      autocompletePosition={autocompletePosition}
                      autocompleteLoading={autocompleteLoading}
                      onAutocompleteSelect={onAutocompleteSelect}
                      onAutocompleteClose={onAutocompleteClose}
                      onAutocompleteIndexChange={onAutocompleteIndexChange}
                      outputLocklineRef={outputLocklineRef}
                      enableMLHighlighting={enableMLHighlighting}
                      hoveredSpanId={hoveredSpanId}
                      lockButtonPosition={lockButtonPosition}
                      lockButtonRef={lockButtonRef}
                      onToggleLock={onToggleLock}
                      onCancelHideLockButton={onCancelHideLockButton}
                      onLockButtonMouseLeave={onLockButtonMouseLeave}
                      isHoveredLocked={isHoveredLocked}
                    />
                  </div>
                </div>
              </div>
            </div>

            <CoherencePanel
              issues={coherenceIssues ?? []}
              isChecking={Boolean(isCoherenceChecking)}
              isExpanded={Boolean(isCoherencePanelExpanded)}
              onToggleExpanded={onToggleCoherencePanelExpanded ?? (() => {})}
              onDismissIssue={onDismissCoherenceIssue ?? (() => {})}
              onDismissAll={onDismissAllCoherenceIssues ?? (() => {})}
              onApplyFix={onApplyCoherenceFix ?? (() => {})}
              onScrollToSpan={onScrollToCoherenceSpan}
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
        )}

        <div
          className="bg-tool-rail-border hidden w-px self-stretch lg:block"
          aria-hidden="true"
        />

        <div className="lg:min-w-88 hidden min-h-0 flex-1 flex-col lg:flex lg:flex-[11]">
          <GenerationsPanel {...generationsPanelProps} />
        </div>
      </div>

      <PromptCanvasMobileGenerations
        hasCanvasContent={hasCanvasContent}
        generationsSheetOpen={generationsSheetOpen}
        onGenerationsSheetOpenChange={onGenerationsSheetOpenChange}
        generationsPanelProps={generationsPanelProps}
      />

      <PromptCanvasDiffDialog
        hasCanvasContent={hasCanvasContent}
        showDiff={showDiff}
        onShowDiffChange={onShowDiffChange}
        inputPrompt={inputPrompt}
        normalizedDisplayedPrompt={normalizedDisplayedPrompt}
      />
    </div>
  );
}
