import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { X } from "@promptstudio/system/components/ui";
import { Textarea } from "@promptstudio/system/components/ui/textarea";
import { MAX_REQUEST_LENGTH } from "@/components/SuggestionsPanel/config/panelConfig";
import { TriggerAutocomplete } from "@/features/assets/components/TriggerAutocomplete";
import type { AssetSuggestion } from "@/features/assets/hooks/useTriggerAutocomplete";
import { PromptEditor } from "@/features/prompt-optimizer/components/PromptEditor";
import { useSelectedSpan } from "@/features/prompt-optimizer/context/SelectedSpanContext";
import { addPromptFocusIntentListener } from "@features/workspace-shell/events";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";
import { cn } from "@/utils/cn";

export interface PromptEditorSurfaceProps {
  editorRef: React.RefObject<HTMLDivElement>;
  prompt: string;
  /** Visual variant — "empty" mirrors today's centered hero text styling; "active" mirrors the docked variant. */
  variant?: "empty" | "active";
  onTextSelection: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseEnter: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseLeave: (event: React.MouseEvent<HTMLDivElement>) => void;
  onCopyEvent: (event: React.ClipboardEvent<HTMLDivElement>) => void;
  onInput: (event: React.FormEvent<HTMLDivElement>) => void;
  onEditorKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onEditorBlur: (event: React.FocusEvent<HTMLDivElement>) => void;
  autocompleteOpen: boolean;
  autocompleteSuggestions: AssetSuggestion[];
  autocompleteSelectedIndex: number;
  autocompletePosition: { top: number; left: number };
  autocompleteLoading: boolean;
  onAutocompleteSelect: (asset: AssetSuggestion) => void;
  onAutocompleteClose: () => void;
  onAutocompleteIndexChange: (index: number) => void;
  /** When true, the editor shows an I2V-aware placeholder explaining that
   *  the prompt is optional once a start image is set. Defaults to false. */
  isI2VMode?: boolean;
}

export function PromptEditorSurface({
  editorRef,
  // `prompt` is part of the public surface for parity with future composer wrappers,
  // but the editor body itself is uncontrolled (managed via editorRef contenteditable).
  prompt: _prompt,
  variant = "active",
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
  isI2VMode = false,
}: PromptEditorSurfaceProps): React.ReactElement {
  const {
    selectedSpanId,
    suggestionCount,
    suggestionsListRef,
    inlineSuggestions,
    activeSuggestionIndex,
    onActiveSuggestionChange,
    interactionSourceRef,
    onSuggestionClick,
    onCloseInlinePopover,
    selectionLabel,
    onApplyActiveSuggestion,
    isInlineLoading,
    isInlineError,
    inlineErrorMessage,
    isInlineEmpty,
    customRequest,
    onCustomRequestChange,
    customRequestError,
    onCustomRequestErrorChange,
    onCustomRequestSubmit,
    isCustomRequestDisabled,
    isCustomLoading,
    responseMetadata,
    onCopyAllDebug,
    isBulkCopyLoading = false,
  } = useSelectedSpan();
  const isEmptyLayout = variant === "empty";
  const placeholderText = isI2VMode
    ? "Optional: add motion direction (or leave blank to animate the image)"
    : "Describe your shot…";
  const [, setIsFocused] = useState(false);
  const [isSuggestionTrayCollapsed, setIsSuggestionTrayCollapsed] =
    useState(false);
  const [isDebugCopied, setIsDebugCopied] = useState(false);
  const previousSelectedSpanIdRef = useRef<string | null>(null);
  const { shouldRender: shouldRenderAutocomplete, phase: autocompletePhase } =
    useAnimatedPresence(autocompleteOpen, { exitMs: 140 });
  const {
    shouldRender: shouldRenderSuggestionTray,
    phase: suggestionTrayPhase,
  } = useAnimatedPresence(Boolean(selectedSpanId), { exitMs: 180 });
  const debugPayload = useMemo(() => {
    if (!import.meta.env.DEV) {
      return null;
    }
    const candidate = responseMetadata?._debug;
    if (!candidate || typeof candidate !== "object") {
      return null;
    }
    return candidate as Record<string, unknown>;
  }, [responseMetadata]);

  const handleCopyDebug = useCallback(() => {
    if (
      !debugPayload ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }

    void navigator.clipboard
      .writeText(JSON.stringify(debugPayload, null, 2))
      .then(() => {
        setIsDebugCopied(true);
        window.setTimeout(() => setIsDebugCopied(false), 1200);
      });
  }, [debugPayload]);

  useEffect(() => {
    return addPromptFocusIntentListener(() => {
      editorRef.current?.focus();
    });
  }, [editorRef]);

  useEffect(() => {
    const previousSelectedSpanId = previousSelectedSpanIdRef.current;
    if (selectedSpanId && selectedSpanId !== previousSelectedSpanId) {
      setIsSuggestionTrayCollapsed(false);
    }
    previousSelectedSpanIdRef.current = selectedSpanId;
  }, [selectedSpanId]);

  return (
    <>
      <div className="relative">
        <PromptEditor
          ref={editorRef}
          className={cn(
            "ps-scrollbar-hide max-h-[180px] overflow-y-auto outline-none [&:empty]:min-h-[56px]",
            isEmptyLayout
              ? "text-foreground caret-foreground min-h-[56px] text-[15px] leading-[1.7]"
              : "text-tool-text-dim min-h-[56px] text-[15px] leading-[1.75]",
          )}
          placeholder={placeholderText}
          onTextSelection={onTextSelection}
          onHighlightClick={onHighlightClick}
          onHighlightMouseDown={onHighlightMouseDown}
          onHighlightMouseEnter={onHighlightMouseEnter}
          onHighlightMouseLeave={onHighlightMouseLeave}
          onCopyEvent={onCopyEvent}
          onInput={onInput}
          onKeyDown={onEditorKeyDown}
          onBlur={(event) => {
            setIsFocused(false);
            onEditorBlur(event);
          }}
          onFocus={() => setIsFocused(true)}
        />
        {shouldRenderAutocomplete ? (
          <TriggerAutocomplete
            isOpen={autocompleteOpen}
            suggestions={autocompleteSuggestions}
            selectedIndex={autocompleteSelectedIndex}
            position={autocompletePosition}
            isLoading={autocompleteLoading}
            onSelect={onAutocompleteSelect}
            onClose={onAutocompleteClose}
            setSelectedIndex={onAutocompleteIndexChange}
            motionPhase={autocompletePhase}
          />
        ) : null}
      </div>

      {shouldRenderSuggestionTray ? (
        <div
          className="motion-presence-panel border-tool-nav-active mt-2.5 border-t pt-2.5"
          data-motion-state={suggestionTrayPhase}
          data-testid="canvas-suggestion-tray"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-tool-text-dim truncate text-[10px] font-semibold tracking-[0.05em]">
                {selectionLabel
                  ? `Replace "${selectionLabel}"`
                  : "Replace selection"}
              </span>
              <span
                key={suggestionCount}
                className="motion-count-bump bg-tool-rail-border text-tool-text-subdued rounded-full px-2 py-0.5 text-[9px] font-semibold"
              >
                {suggestionCount}
              </span>
              {debugPayload ? (
                <button
                  type="button"
                  className="text-tool-text-subdued hover:bg-tool-rail-border hover:text-tool-text-dim rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCopyDebug();
                  }}
                >
                  {isDebugCopied ? "Copied!" : "Copy Debug"}
                </button>
              ) : null}
              {import.meta.env.DEV && onCopyAllDebug ? (
                <button
                  type="button"
                  className="text-tool-text-subdued hover:bg-tool-rail-border hover:text-tool-text-dim rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCopyAllDebug();
                  }}
                  disabled={isBulkCopyLoading}
                >
                  {isBulkCopyLoading ? "Copying All..." : "Copy All Debug"}
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="text-tool-text-subdued hover:bg-tool-rail-border hover:text-tool-text-dim rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsSuggestionTrayCollapsed((prev) => !prev);
                }}
              >
                {isSuggestionTrayCollapsed ? "Expand" : "Collapse"}
              </button>
              <button
                type="button"
                className="text-tool-text-label hover:bg-tool-rail-border hover:text-tool-text-dim flex h-6 w-6 items-center justify-center rounded-md transition-colors"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseInlinePopover();
                }}
                aria-label="Close suggestions"
              >
                <X size={10} weight="bold" aria-hidden="true" />
              </button>
            </div>
          </div>

          {!isSuggestionTrayCollapsed ? (
            <>
              <div
                className="border-tool-rail-border border-b pb-2"
                data-suggest-custom
              >
                <form
                  className="flex items-center gap-2"
                  onSubmit={onCustomRequestSubmit}
                >
                  <Textarea
                    id="inline-custom-request"
                    value={customRequest}
                    onChange={(event) => {
                      onCustomRequestChange(event.target.value);
                      if (customRequestError) {
                        onCustomRequestErrorChange("");
                      }
                    }}
                    placeholder="Add a specific change (e.g. football field)"
                    className="border-tool-nav-active bg-tool-surface-prompt-compact text-foreground placeholder:text-tool-text-subdued min-h-9 flex-1 resize-none rounded-lg border px-3 py-2 text-xs focus-visible:ring-2 focus-visible:ring-white/10 focus-visible:ring-offset-0"
                    maxLength={MAX_REQUEST_LENGTH}
                    rows={1}
                    aria-label="Custom suggestion request"
                  />
                  <button
                    type="submit"
                    className={cn(
                      "border-tool-accent-neutral/25 bg-tool-accent-neutral text-tool-surface-deep h-9 rounded-lg border px-3 text-xs font-semibold transition-opacity hover:opacity-90",
                      isCustomRequestDisabled && "opacity-50",
                    )}
                    disabled={isCustomRequestDisabled}
                    aria-busy={isCustomLoading}
                  >
                    {isCustomLoading ? "Applying..." : "Apply"}
                  </button>
                </form>
                {customRequestError ? (
                  <div
                    className="motion-shake-x mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
                    role="alert"
                  >
                    {customRequestError}
                  </div>
                ) : null}
              </div>

              {isInlineError ? (
                <div
                  className="motion-shake-x mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
                  role="alert"
                >
                  {inlineErrorMessage}
                </div>
              ) : null}

              {isInlineLoading ? (
                <div className="mt-2 flex gap-2">
                  <div className="bg-tool-rail-border h-8 w-24 animate-pulse rounded-lg" />
                  <div className="bg-tool-rail-border h-8 w-32 animate-pulse rounded-lg" />
                  <div className="bg-tool-rail-border h-8 w-20 animate-pulse rounded-lg" />
                </div>
              ) : null}

              {!isInlineLoading && !isInlineError && suggestionCount > 0 ? (
                <div
                  ref={suggestionsListRef}
                  className="mt-2 flex gap-2 overflow-x-auto pb-1"
                >
                  {inlineSuggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.key}
                      type="button"
                      data-index={index}
                      className={cn(
                        "flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-[transform,border-color,color,background-color] duration-[160ms] [transition-timing-function:var(--motion-ease-standard)]",
                        activeSuggestionIndex === index
                          ? "border-tool-accent-neutral/50 bg-tool-accent-neutral/10 text-foreground -translate-y-px"
                          : "border-tool-nav-active bg-tool-surface-prompt-compact text-tool-text-dim hover:border-tool-text-label hover:text-foreground hover:-translate-y-px",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => {
                        interactionSourceRef.current = "mouse";
                        onActiveSuggestionChange(index);
                      }}
                      onClick={() => {
                        onSuggestionClick(suggestion.item);
                        onCloseInlinePopover();
                      }}
                    >
                      {suggestion.text}
                      {index === 0 ? (
                        <span className="text-tool-accent-neutral ml-1.5 text-[9px] font-semibold">
                          Best
                        </span>
                      ) : suggestion.meta ? (
                        <span className="text-tool-text-subdued ml-1.5 text-[9px]">
                          {suggestion.meta}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}

              {isInlineEmpty ? (
                <div className="text-tool-text-subdued mt-2 text-xs">
                  No suggestions yet.
                </div>
              ) : null}

              <div className="border-tool-rail-border mt-2 flex items-center gap-2 border-t pt-2">
                <button
                  type="button"
                  className="border-tool-nav-active text-tool-text-dim hover:border-tool-text-label hover:text-foreground h-8 rounded-lg border bg-transparent px-3 text-xs font-semibold transition-colors"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseInlinePopover();
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className={cn(
                    "border-tool-accent-neutral/25 bg-tool-accent-neutral text-tool-surface-deep h-8 rounded-lg border px-3 text-xs font-semibold transition-opacity hover:opacity-90",
                    suggestionCount === 0 && "opacity-50",
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onApplyActiveSuggestion();
                    onCloseInlinePopover();
                  }}
                  disabled={suggestionCount === 0}
                >
                  Apply
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
