import { forwardRef, useCallback } from "react";
import type { PromptEditorProps } from "../types";
import { cn } from "@/utils/cn";

/**
 * Prompt Editor Component
 * ContentEditable editor for the optimized prompt
 */
export const PromptEditor = forwardRef<HTMLDivElement, PromptEditorProps>(
  (
    {
      className,
      placeholder,
      onTextSelection,
      onHighlightClick,
      onHighlightMouseDown,
      onHighlightMouseEnter,
      onHighlightMouseLeave,
      onCopyEvent,
      onInput,
      onKeyDown,
      onFocus,
      onBlur,
    },
    ref,
  ): React.ReactElement => {
    // Use event delegation for hover detection
    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLDivElement>): void => {
        if (onHighlightMouseEnter) {
          onHighlightMouseEnter(e);
        }
      },
      [onHighlightMouseEnter],
    );

    return (
      <div
        ref={ref}
        onMouseUp={onTextSelection}
        onClick={onHighlightClick}
        onMouseDown={onHighlightMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={onHighlightMouseLeave}
        onCopy={onCopyEvent}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        contentEditable
        suppressContentEditableWarning
        className={cn("min-h-px w-full break-words", className)}
        data-placeholder={placeholder}
        role="textbox"
        aria-label="Shot description"
      />
    );
  },
);

PromptEditor.displayName = "PromptEditor";
