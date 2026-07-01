import React, { useCallback, useMemo, useState } from "react";
import { Textarea } from "@promptstudio/system/components/ui/textarea";
import { MAX_REQUEST_LENGTH } from "@components/SuggestionsPanel/config/panelConfig";
import { cn } from "@/utils/cn";
import { useSelectedSpan } from "../../context/SelectedSpanContext";
import { CanvasButton } from "./PromptCanvasView.shared";

export function PromptCanvasSuggestionsPanel(): React.ReactElement | null {
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
    isInlineLoading,
    isInlineError,
    inlineErrorMessage,
    isInlineEmpty,
  } = useSelectedSpan();
  const [isDebugCopied, setIsDebugCopied] = useState(false);
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

  if (!selectedSpanId) {
    return null;
  }

  return (
    <aside
      className="border-border bg-surface-2 absolute bottom-0 right-0 top-0 z-20 flex w-80 min-w-0 flex-col overflow-hidden rounded-lg border shadow-lg"
      aria-label="Suggestions"
    >
      <div className="border-border flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="text-body-sm text-foreground flex items-center gap-2 font-semibold">
          Suggestions
          <span className="bg-surface-3 text-label-sm text-muted inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5">
            {suggestionCount}
          </span>
          {debugPayload && (
            <button
              type="button"
              className="text-label-sm text-muted hover:text-foreground transition-colors"
              onClick={handleCopyDebug}
            >
              {isDebugCopied ? "Copied!" : "Copy Debug"}
            </button>
          )}
          {import.meta.env.DEV && onCopyAllDebug && (
            <button
              type="button"
              className="text-label-sm text-muted hover:text-foreground transition-colors"
              onClick={onCopyAllDebug}
              disabled={isBulkCopyLoading}
            >
              {isBulkCopyLoading ? "Copying All..." : "Copy All Debug"}
            </button>
          )}
        </div>
        <div
          className="text-muted hidden items-center gap-1 sm:flex"
          aria-hidden="true"
        >
          <span className="border-border bg-surface-3 text-label-sm text-muted rounded-md border px-2 py-0.5 font-semibold">
            Up
          </span>
          <span className="border-border bg-surface-3 text-label-sm text-muted rounded-md border px-2 py-0.5 font-semibold">
            Down
          </span>
          <span className="border-border bg-surface-3 text-label-sm text-muted rounded-md border px-2 py-0.5 font-semibold">
            Enter
          </span>
          <span className="border-border bg-surface-3 text-label-sm text-muted rounded-md border px-2 py-0.5 font-semibold">
            Esc
          </span>
        </div>
      </div>

      <div className="border-border border-b px-3 py-2" data-suggest-custom>
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
            className="border-border bg-surface-2 text-body-sm text-foreground placeholder:text-faint focus-visible:ring-accent min-h-9 flex-1 resize-none rounded-lg border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-0"
            maxLength={MAX_REQUEST_LENGTH}
            rows={1}
            aria-label="Custom suggestion request"
          />
          <CanvasButton
            type="submit"
            className={cn(
              "border-accent bg-accent text-label-sm text-app h-9 rounded-lg border px-3 font-semibold shadow-sm transition hover:opacity-90",
              isCustomRequestDisabled && "opacity-50",
            )}
            disabled={isCustomRequestDisabled}
            aria-busy={isCustomLoading}
          >
            {isCustomLoading ? "Applying..." : "Apply"}
          </CanvasButton>
        </form>
        {customRequestError && (
          <div
            className="border-error/30 bg-error/10 text-label-sm text-error mt-2 rounded-lg border px-3 py-2"
            role="alert"
          >
            {customRequestError}
          </div>
        )}
      </div>

      {isInlineError && (
        <div
          className="border-error/30 bg-error/10 text-label-sm text-error mx-3 mt-2 rounded-lg border px-3 py-2"
          role="alert"
        >
          {inlineErrorMessage}
        </div>
      )}

      {isInlineLoading && (
        <div className="flex flex-1 flex-col gap-2 px-3 py-2">
          <div className="bg-surface-3 h-9 w-full animate-pulse rounded-lg" />
          <div className="bg-surface-3 h-9 w-full animate-pulse rounded-lg" />
          <div className="bg-surface-3 h-9 w-full animate-pulse rounded-lg" />
        </div>
      )}

      {!isInlineLoading && !isInlineError && suggestionCount > 0 && (
        <div
          className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-2"
          ref={suggestionsListRef}
        >
          {inlineSuggestions.map((suggestion, index) => (
            <div
              key={suggestion.key}
              data-index={index}
              data-selected={activeSuggestionIndex === index ? "true" : "false"}
              className={cn(
                "border-border bg-surface-2 text-body-sm text-foreground flex cursor-pointer items-start justify-between gap-3 rounded-lg border px-3 py-2 transition-colors",
                "hover:border-border-strong hover:bg-surface-3",
                activeSuggestionIndex === index &&
                  "border-accent/50 bg-accent/10",
              )}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => {
                interactionSourceRef.current = "mouse";
                onActiveSuggestionChange(index);
              }}
              onClick={() => {
                onSuggestionClick(suggestion.item);
                onCloseInlinePopover();
              }}
              role="button"
              tabIndex={0}
            >
              <div className="text-body-sm text-foreground min-w-0">
                {suggestion.text}
              </div>
              {index === 0 ? (
                <span className="bg-accent/10 text-label-sm text-accent inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 font-semibold">
                  Best match
                </span>
              ) : suggestion.meta ? (
                <div className="text-label-sm text-muted flex-shrink-0">
                  {suggestion.meta}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {isInlineEmpty && (
        <div className="text-label-sm text-muted flex flex-1 items-center px-3 py-2">
          No suggestions yet.
        </div>
      )}

      <div className="border-border border-t px-3 py-2">
        <div className="text-label-sm text-muted">
          {selectionLabel ? `Replace "${selectionLabel}"` : "Replace selection"}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <CanvasButton
            type="button"
            className="border-border bg-surface-3 text-label-sm text-muted hover:bg-surface-2 hover:text-foreground h-9 rounded-lg border px-3 font-semibold transition-colors"
            onClick={onCloseInlinePopover}
          >
            Clear
          </CanvasButton>
          <CanvasButton
            type="button"
            className={cn(
              "border-accent bg-accent text-label-sm text-app h-9 rounded-lg border px-3 font-semibold shadow-sm transition hover:opacity-90",
              !suggestionCount && "opacity-50",
            )}
            onClick={() => {
              onApplyActiveSuggestion();
              onCloseInlinePopover();
            }}
            disabled={!suggestionCount}
          >
            Apply
          </CanvasButton>
        </div>
      </div>
    </aside>
  );
}
