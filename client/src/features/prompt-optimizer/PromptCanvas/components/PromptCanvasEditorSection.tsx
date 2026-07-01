import React from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Check,
  Copy,
  DotsThree,
  GridFour,
  Icon,
  Lock,
  LockOpen,
  VideoCamera,
} from "@promptstudio/system/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@promptstudio/system/components/ui/select";
import { LoadingDots } from "@components/LoadingDots";
import { cn } from "@/utils/cn";
import { TriggerAutocomplete } from "@features/assets/components/TriggerAutocomplete";
import { PromptEditor } from "@features/prompt-optimizer/components/PromptEditor";
import { useI2VContext } from "@features/prompt-optimizer/hooks/useI2VContext";
import { MotionIdeasPanel } from "@features/prompt-optimizer/components/MotionIdeasPanel";
import {
  usePromptResultsActions,
  usePromptResultsData,
} from "@features/prompt-optimizer/context/PromptResultsActionsContext";
import type { PromptCanvasViewProps } from "./PromptCanvasView.types";
import { PromptCanvasSuggestionsPanel } from "./PromptCanvasSuggestionsPanel";
import { CanvasButton } from "./PromptCanvasView.shared";

type PromptCanvasEditorSectionProps = Pick<
  PromptCanvasViewProps,
  | "modelFormatValue"
  | "modelFormatLabel"
  | "modelFormatOptions"
  | "modelFormatDisabled"
  | "onModelFormatChange"
  | "outlineOverlayActive"
  | "openOutlineOverlay"
  | "onCopy"
  | "copied"
  | "onUndo"
  | "canUndo"
  | "onRedo"
  | "canRedo"
  | "exportMenuRef"
  | "showExportMenu"
  | "onToggleExportMenu"
  | "onShowDiffChange"
  | "onExport"
  | "onShare"
  | "isOutputLoading"
  | "editorWrapperRef"
  | "editorRef"
  | "onTextSelection"
  | "onHighlightClick"
  | "onHighlightMouseDown"
  | "onHighlightMouseEnter"
  | "onHighlightMouseLeave"
  | "onCopyEvent"
  | "onInput"
  | "onEditorKeyDown"
  | "onEditorBlur"
  | "autocompleteOpen"
  | "autocompleteSuggestions"
  | "autocompleteSelectedIndex"
  | "autocompletePosition"
  | "autocompleteLoading"
  | "onAutocompleteSelect"
  | "onAutocompleteClose"
  | "onAutocompleteIndexChange"
  | "outputLocklineRef"
  | "enableMLHighlighting"
  | "hoveredSpanId"
  | "lockButtonPosition"
  | "lockButtonRef"
  | "onToggleLock"
  | "onCancelHideLockButton"
  | "onLockButtonMouseLeave"
  | "isHoveredLocked"
>;

export function PromptCanvasEditorSection({
  modelFormatValue,
  modelFormatLabel,
  modelFormatOptions,
  modelFormatDisabled,
  onModelFormatChange,
  outlineOverlayActive,
  openOutlineOverlay,
  onCopy,
  copied,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  exportMenuRef,
  showExportMenu,
  onToggleExportMenu,
  onShowDiffChange,
  onExport,
  onShare,
  isOutputLoading,
  editorWrapperRef,
  editorRef,
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
  outputLocklineRef,
  enableMLHighlighting,
  hoveredSpanId,
  lockButtonPosition,
  lockButtonRef,
  onToggleLock,
  onCancelHideLockButton,
  onLockButtonMouseLeave,
  isHoveredLocked,
}: PromptCanvasEditorSectionProps): React.ReactElement {
  const { isI2VMode } = useI2VContext();
  const { motionIdeas, isMotionIdeasLoading } = usePromptResultsData();
  const { onMotionIdeaSelect, onMotionIdeasReroll } = usePromptResultsActions();
  const showMotionIdeas =
    isI2VMode && Boolean(onMotionIdeaSelect) && Boolean(onMotionIdeasReroll);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col transition-opacity",
        isOutputLoading && "opacity-80",
      )}
    >
      <div className="border-tool-rail-border flex h-11 items-center border-b px-3">
        <Select
          value={modelFormatValue}
          onValueChange={onModelFormatChange}
          disabled={modelFormatDisabled}
        >
          <SelectTrigger
            size="xs"
            variant="ghost"
            className="text-muted hover:bg-surface-2 hover:text-foreground h-7 min-w-24 max-w-40 justify-start rounded-md px-2 text-[11px] font-medium transition-colors [&>span]:!flex [&>span]:overflow-visible"
            aria-label={`Model format: ${modelFormatLabel}`}
            title={`Model format: ${modelFormatLabel}`}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon
                icon={VideoCamera}
                size="xs"
                weight="bold"
                aria-hidden="true"
              />
              <span className="truncate text-[11px]">{modelFormatLabel}</span>
            </span>
          </SelectTrigger>
          <SelectContent align="start" className="max-h-72">
            <SelectItem value="auto">Auto (Generic)</SelectItem>
            {modelFormatOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {!outlineOverlayActive && (
          <CanvasButton
            type="button"
            size="icon-sm"
            className="h-7 w-7 shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&_svg]:size-[14px]"
            onClick={openOutlineOverlay}
            aria-label="Prompt structure"
            title="Prompt structure"
          >
            <Icon icon={GridFour} size="sm" weight="bold" aria-hidden="true" />
          </CanvasButton>
        )}

        <div
          className="bg-tool-nav-active mx-1 h-3.5 w-px"
          aria-hidden="true"
        />

        <CanvasButton
          type="button"
          size="icon-sm"
          className="h-7 w-7 shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&_svg]:size-[14px]"
          onClick={onCopy}
          aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
          title={copied ? "Copied" : "Copy"}
        >
          {copied ? (
            <Icon icon={Check} size="sm" weight="bold" aria-hidden="true" />
          ) : (
            <Icon icon={Copy} size="sm" weight="bold" aria-hidden="true" />
          )}
        </CanvasButton>
        <CanvasButton
          type="button"
          size="icon-sm"
          className="h-7 w-7 shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&_svg]:size-[14px]"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
        >
          <Icon
            icon={ArrowCounterClockwise}
            size="sm"
            weight="bold"
            aria-hidden="true"
          />
        </CanvasButton>
        <CanvasButton
          type="button"
          size="icon-sm"
          className="h-7 w-7 shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&_svg]:size-[14px]"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo"
        >
          <Icon
            icon={ArrowClockwise}
            size="sm"
            weight="bold"
            aria-hidden="true"
          />
        </CanvasButton>

        <div className="relative" ref={exportMenuRef}>
          <CanvasButton
            type="button"
            size="icon-sm"
            className="h-7 w-7 shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&_svg]:size-[14px]"
            onClick={() => onToggleExportMenu(!showExportMenu)}
            aria-expanded={showExportMenu}
            aria-haspopup="menu"
            aria-label="More actions"
            title="More"
          >
            <Icon icon={DotsThree} size="sm" weight="bold" aria-hidden="true" />
          </CanvasButton>

          {showExportMenu && (
            <div
              className="border-tool-nav-active bg-tool-surface-card absolute right-0 top-full z-20 mt-1.5 w-52 rounded-lg border p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
              role="menu"
            >
              <CanvasButton
                type="button"
                onClick={() => {
                  onShowDiffChange(true);
                  onToggleExportMenu(false);
                }}
                role="menuitem"
                className="text-label-sm text-muted hover:bg-surface-2 hover:text-foreground w-full justify-start rounded-md px-2.5 py-1.5 transition-colors"
              >
                Compare versions
              </CanvasButton>
              <div
                className="bg-tool-nav-active my-1 h-px"
                aria-hidden="true"
              />
              <CanvasButton
                type="button"
                onClick={() => {
                  onExport("text");
                  onToggleExportMenu(false);
                }}
                role="menuitem"
                className="text-label-sm text-muted hover:bg-surface-2 hover:text-foreground w-full justify-start rounded-md px-2.5 py-1.5 transition-colors"
              >
                Export .txt
              </CanvasButton>
              <CanvasButton
                type="button"
                onClick={() => {
                  onExport("markdown");
                  onToggleExportMenu(false);
                }}
                role="menuitem"
                className="text-label-sm text-muted hover:bg-surface-2 hover:text-foreground w-full justify-start rounded-md px-2.5 py-1.5 transition-colors"
              >
                Export .md
              </CanvasButton>
              <CanvasButton
                type="button"
                onClick={() => {
                  onExport("json");
                  onToggleExportMenu(false);
                }}
                role="menuitem"
                className="text-label-sm text-muted hover:bg-surface-2 hover:text-foreground w-full justify-start rounded-md px-2.5 py-1.5 transition-colors"
              >
                Export .json
              </CanvasButton>
              <div
                className="bg-tool-nav-active my-1 h-px"
                aria-hidden="true"
              />
              <CanvasButton
                type="button"
                onClick={() => {
                  onShare();
                  onToggleExportMenu(false);
                }}
                role="menuitem"
                className="text-label-sm text-muted hover:bg-surface-2 hover:text-foreground w-full justify-start rounded-md px-2.5 py-1.5 transition-colors"
              >
                Share
              </CanvasButton>
            </div>
          )}
        </div>
      </div>

      <div className="px-ps-3 pb-ps-card pt-ps-4 flex min-h-0 flex-1 flex-col">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col"
            aria-busy={isOutputLoading}
            ref={editorWrapperRef}
          >
            <PromptEditor
              ref={editorRef as React.RefObject<HTMLDivElement>}
              className="px-ps-3 py-ps-4 text-body-xl text-foreground-warm min-h-0 min-h-44 w-full flex-1 overflow-y-auto whitespace-pre-wrap outline-none"
              {...(isI2VMode
                ? {
                    placeholder:
                      "Optional: add motion direction (or leave blank to animate the image)",
                  }
                : {})}
              onTextSelection={onTextSelection}
              onHighlightClick={onHighlightClick}
              onHighlightMouseDown={onHighlightMouseDown}
              onHighlightMouseEnter={onHighlightMouseEnter}
              onHighlightMouseLeave={onHighlightMouseLeave}
              onCopyEvent={onCopyEvent}
              onInput={onInput}
              onKeyDown={onEditorKeyDown}
              onBlur={onEditorBlur}
            />

            {autocompleteOpen && (
              <TriggerAutocomplete
                isOpen={autocompleteOpen}
                suggestions={autocompleteSuggestions}
                selectedIndex={autocompleteSelectedIndex}
                position={autocompletePosition}
                isLoading={autocompleteLoading}
                onSelect={onAutocompleteSelect}
                onClose={onAutocompleteClose}
                setSelectedIndex={onAutocompleteIndexChange}
              />
            )}

            <div
              ref={outputLocklineRef}
              className={cn(
                "bg-border mt-4 h-px w-full origin-left scale-x-0 transition-transform duration-300",
                isOutputLoading && "scale-x-100",
              )}
              aria-hidden="true"
            />

            {enableMLHighlighting &&
              !outlineOverlayActive &&
              hoveredSpanId &&
              lockButtonPosition &&
              !isOutputLoading && (
                <CanvasButton
                  ref={lockButtonRef}
                  type="button"
                  onClick={onToggleLock}
                  onMouseEnter={onCancelHideLockButton}
                  onMouseLeave={onLockButtonMouseLeave}
                  onMouseDown={(e) => e.preventDefault()}
                  className={cn(
                    "border-border bg-surface-2 text-muted absolute z-10 -mt-1.5 inline-flex h-9 w-9 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border shadow-md transition-colors",
                    "hover:border-border-strong hover:bg-surface-3 hover:text-foreground",
                    isHoveredLocked && "border-accent text-foreground",
                  )}
                  style={{
                    top: `${lockButtonPosition.top}px`,
                    left: `${lockButtonPosition.left}px`,
                  }}
                  data-locked={isHoveredLocked ? "true" : "false"}
                  aria-label={isHoveredLocked ? "Unlock span" : "Lock span"}
                  title={isHoveredLocked ? "Unlock span" : "Lock span"}
                  aria-pressed={isHoveredLocked}
                >
                  {isHoveredLocked ? (
                    <Icon
                      icon={LockOpen}
                      size="sm"
                      weight="bold"
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon
                      icon={Lock}
                      size="sm"
                      weight="bold"
                      aria-hidden="true"
                    />
                  )}
                </CanvasButton>
              )}

            {isOutputLoading && (
              <div
                className="bg-surface-3/80 p-ps-4 absolute inset-0 flex items-start justify-start backdrop-blur-sm"
                role="status"
                aria-live="polite"
                aria-label="Optimizing prompt"
              >
                <LoadingDots size={3} className="text-faint" />
              </div>
            )}
          </div>

          {showMotionIdeas && onMotionIdeaSelect && onMotionIdeasReroll ? (
            <MotionIdeasPanel
              ideas={[...(motionIdeas ?? [])]}
              isLoading={Boolean(isMotionIdeasLoading)}
              onChipClick={onMotionIdeaSelect}
              onReroll={onMotionIdeasReroll}
            />
          ) : null}

          <PromptCanvasSuggestionsPanel />
        </div>
      </div>
    </div>
  );
}
