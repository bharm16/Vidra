import React, {
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { Textarea } from "@promptstudio/system/components/ui/textarea";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@promptstudio/system/components/ui/popover";
import closeIcon from "@/assets/design-system/phrase-suggestions-close.svg";
import loadingIcon from "@/assets/design-system/phrase-suggestions-loading.svg";
import "./phrase-suggestions.css";
import { MAX_REQUEST_LENGTH } from "@/components/SuggestionsPanel/config/panelConfig";
import { PromptEditor } from "@/features/prompt-optimizer/components/PromptEditor";
import { MOTION_GOLD_HEX } from "@/features/prompt-optimizer/config/categoryColors";
import { useSelectedSpan } from "@/features/prompt-optimizer/context/SelectedSpanContext";
import { addPromptFocusIntentListener } from "@features/workspace-shell/events";
import { cn } from "@/utils/cn";

/** Shared editor wiring. The editable node remains mounted while its span panel opens or closes. */
export interface PromptEditorWiring {
  editorRef: React.RefObject<HTMLDivElement>;
  /** Managed words decide emptiness even when contenteditable retains a BR. */
  isEmpty?: boolean | undefined;
  onTextSelection: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseEnter: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseLeave: (event: React.MouseEvent<HTMLDivElement>) => void;
  onCopyEvent: (event: React.ClipboardEvent<HTMLDivElement>) => void;
  onInput: (event: React.FormEvent<HTMLDivElement>) => void;
}

export interface PromptEditorSurfaceProps extends PromptEditorWiring {
  /** Visual slot in the new or ongoing Video composer. */
  variant?: "empty" | "active" | "composer";
}

export function PromptEditorSurface({
  editorRef,
  isEmpty,
  variant = "active",
  onTextSelection,
  onHighlightClick,
  onHighlightMouseDown,
  onHighlightMouseEnter,
  onHighlightMouseLeave,
  onCopyEvent,
  onInput,
}: PromptEditorSurfaceProps): React.ReactElement {
  const {
    selectedSpanId,
    suggestionsListRef,
    inlineSuggestions,
    activeSuggestionIndex,
    onActiveSuggestionChange,
    interactionSourceRef,
    onSuggestionClick,
    onCloseInlinePopover,
    selectionLabel,
    isMotionSelection,
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
  const placeholderText = "Describe the video you want to create…";
  const [isDebugCopied, setIsDebugCopied] = useState(false);
  const customRequestRef = useRef<HTMLTextAreaElement>(null);
  const initialLoading = isInlineLoading && !isCustomLoading;
  const showOptions =
    inlineSuggestions.length > 0 &&
    (!isInlineLoading || isCustomLoading) &&
    (!isInlineError || isCustomLoading);
  const phraseState = isCustomLoading
    ? "Custom loading"
    : initialLoading
      ? "Loading"
      : isInlineError
        ? "Error"
        : isInlineEmpty || !inlineSuggestions.length
          ? "Empty"
          : customRequest.trim()
            ? "Custom request"
            : "Ready";
  useLayoutEffect(() => {
    const input = customRequestRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${input.scrollHeight}px`;
  }, [customRequest, initialLoading]);
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

  return (
    <div
      className={cn(
        "vidra-prompt-editor px-4 pb-2.5 pt-3",
        (isEmptyLayout || variant === "composer") && "p-0",
      )}
      style={
        isEmptyLayout || variant === "composer"
          ? // Feed the global [contenteditable] !important sizing the display
            // triple rather than out-specifying it — the rule reads these vars.
            // Display type tightens: the base default is +0.01em, which at this
            // size read as a visible +0.26px of loosening on the largest text
            // on the page.
            ({
              "--editor-font-size": "var(--text-body)",
              "--editor-line-height": "var(--text-body-lh)",
              "--editor-letter-spacing": "var(--text-body-ls)",
              "--editor-padding-y": "0px",
              "--editor-padding-x": "0px",
            } as React.CSSProperties)
          : undefined
      }
    >
      <Popover
        open={Boolean(selectedSpanId)}
        onOpenChange={(open) => {
          if (!open) onCloseInlinePopover();
        }}
      >
        <PopoverAnchor asChild>
          <div className="relative">
            <PromptEditor
              ref={editorRef}
              {...(isEmpty === undefined ? {} : { isEmpty })}
              className={cn(
                // ps-scrollbar-thin (not -hide): long expanded prompts overflow
                // this 180px window — the scrollbar is the visible affordance
                // that there is more prompt below the fold.
                "ps-scrollbar-thin max-h-[180px] overflow-y-auto outline-none",
                isEmptyLayout
                  ? "text-foreground caret-foreground min-h-[104px] [&:empty]:min-h-[104px]"
                  : variant === "composer"
                    ? "text-foreground min-h-[96px] leading-6"
                    : "text-tool-text-dim text-ui min-h-[56px] leading-[1.75] [&:empty]:min-h-[56px]",
              )}
              placeholder={placeholderText}
              onTextSelection={onTextSelection}
              onHighlightClick={onHighlightClick}
              onHighlightMouseDown={onHighlightMouseDown}
              onHighlightMouseEnter={onHighlightMouseEnter}
              onHighlightMouseLeave={onHighlightMouseLeave}
              onCopyEvent={onCopyEvent}
              onInput={onInput}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="vidra-phrase-suggestions ps-scrollbar-thin"
          align="start"
          side="bottom"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Phrase suggestions"
          data-testid="canvas-suggestion-tray"
          data-phrase-state={phraseState}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            const target = event.target;
            if (target instanceof Node && editorRef.current?.contains(target))
              event.preventDefault();
          }}
          onKeyDown={(event) => {
            const focusedOption =
              event.target instanceof Element
                ? event.target.closest<HTMLButtonElement>("button[data-index]")
                : null;
            if (
              focusedOption &&
              inlineSuggestions.length > 0 &&
              (event.key === "ArrowDown" || event.key === "ArrowUp")
            ) {
              event.preventDefault();
              event.stopPropagation();
              const delta = event.key === "ArrowDown" ? 1 : -1;
              const nextIndex =
                (Number(focusedOption.dataset.index) +
                  delta +
                  inlineSuggestions.length) %
                inlineSuggestions.length;
              interactionSourceRef.current = "keyboard";
              onActiveSuggestionChange(nextIndex);
              suggestionsListRef.current
                ?.querySelector<HTMLButtonElement>(
                  `button[data-index="${nextIndex}"]`,
                )
                ?.focus();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCloseInlinePopover();
            } else if (
              event.key === "Enter" &&
              event.target instanceof Element &&
              event.target.closest("button")
            ) {
              // Native buttons handle their own activation; the existing span
              // keyboard controller still owns Up/Down/Enter in the editor.
              event.stopPropagation();
            }
          }}
        >
          <div className="vidra-phrase-suggestions__header">
            <div className="vidra-phrase-suggestions__selection">
              <p className="vidra-phrase-suggestions__replace">Replace</p>
              <p className="vidra-phrase-suggestions__phrase">
                {selectionLabel || "Selection"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="vidra-phrase-suggestions__close"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onCloseInlinePopover}
              aria-label="Close suggestions"
            >
              <img src={closeIcon} alt="" aria-hidden="true" />
            </Button>
          </div>
          {isMotionSelection ? (
            <div
              data-testid="motion-not-in-picture-note"
              className="vidra-phrase-suggestions__motion"
              style={{ color: MOTION_GOLD_HEX }}
            >
              Not in the picture — this drives the video
            </div>
          ) : null}
          {initialLoading ? (
            <div
              className="vidra-phrase-suggestions__status vidra-phrase-suggestions__status--loading"
              role="status"
            >
              <span className="vidra-phrase-suggestions__loading-icon">
                <img
                  src={loadingIcon}
                  alt=""
                  aria-hidden="true"
                  className="animate-spin"
                />
              </span>
              <span>Finding alternatives…</span>
            </div>
          ) : null}
          {showOptions ? (
            <div
              ref={suggestionsListRef}
              className="vidra-phrase-suggestions__options"
            >
              {inlineSuggestions.map((suggestion, index) => (
                <Button
                  key={suggestion.key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-index={index}
                  data-active={activeSuggestionIndex === index || undefined}
                  aria-pressed={activeSuggestionIndex === index}
                  className="vidra-phrase-suggestions__option"
                  title={suggestion.text}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    interactionSourceRef.current = "mouse";
                    onActiveSuggestionChange(index);
                  }}
                  onFocus={() => {
                    interactionSourceRef.current = "keyboard";
                    onActiveSuggestionChange(index);
                  }}
                  onClick={() => {
                    onSuggestionClick(suggestion.item);
                    onCloseInlinePopover();
                  }}
                >
                  <span>{suggestion.text}</span>
                </Button>
              ))}
            </div>
          ) : null}
          {!initialLoading && isInlineError && !isCustomLoading ? (
            <div
              className="vidra-phrase-suggestions__status"
              role="alert"
              title={inlineErrorMessage}
            >
              Couldn’t load suggestions.
            </div>
          ) : null}
          {!initialLoading && !isInlineError && !showOptions ? (
            <div className="vidra-phrase-suggestions__status" role="status">
              No alternatives found.
            </div>
          ) : null}
          {!initialLoading ? (
            <form
              className="vidra-phrase-suggestions__custom"
              data-suggest-custom
              onSubmit={onCustomRequestSubmit}
            >
              <Textarea
                ref={customRequestRef}
                id="inline-custom-request"
                value={customRequest}
                onChange={(event) => {
                  onCustomRequestChange(event.target.value);
                  if (customRequestError) onCustomRequestErrorChange("");
                }}
                placeholder="Describe a change…"
                className="vidra-phrase-suggestions__input ps-scrollbar-thin"
                maxLength={MAX_REQUEST_LENGTH}
                rows={1}
                aria-label="Custom suggestion request"
                aria-invalid={Boolean(customRequestError)}
              />
              <Button
                type="submit"
                variant={customRequest.trim() ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "vidra-phrase-suggestions__suggest",
                  isCustomLoading &&
                    "vidra-phrase-suggestions__suggest--loading",
                )}
                data-empty={!customRequest.trim() || undefined}
                disabled={isCustomRequestDisabled || isCustomLoading}
                aria-busy={isCustomLoading || undefined}
                aria-label={
                  isCustomLoading ? "Requesting alternatives" : "Suggest"
                }
              >
                {isCustomLoading ? (
                  <span className="vidra-phrase-suggestions__loading-icon">
                    <img
                      src={loadingIcon}
                      alt=""
                      aria-hidden="true"
                      className="animate-spin"
                    />
                  </span>
                ) : (
                  "Suggest"
                )}
              </Button>
            </form>
          ) : null}
          {customRequestError ? (
            <div className="vidra-phrase-suggestions__error" role="alert">
              {customRequestError}
            </div>
          ) : null}
          {import.meta.env.DEV && (debugPayload || onCopyAllDebug) ? (
            <div className="vidra-phrase-suggestions__debug">
              {debugPayload ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleCopyDebug}
                >
                  {isDebugCopied ? "Copied!" : "Copy Debug"}
                </Button>
              ) : null}
              {onCopyAllDebug ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={isBulkCopyLoading}
                  onClick={onCopyAllDebug}
                >
                  {isBulkCopyLoading ? "Copying All..." : "Copy All Debug"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
