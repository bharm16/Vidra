import type { User } from "@features/prompt-optimizer/types/domain/prompt-session";
import type { CapabilityValues } from "@shared/capabilities";

/**
 * Props for CategoryLegend component
 */


/**
 * Export format type
 */
export type ExportFormat = "text" | "markdown" | "json";

export interface OptimizationOptions {
  skipCache?: boolean;
  generationParams?: CapabilityValues;
  compileOnly?: boolean;
  compilePrompt?: string;
  targetModel?: string;
  forceGenericTarget?: boolean;
  createVersion?: boolean;
  startImage?: string;
  sourcePrompt?: string;
  preserveSessionView?: boolean;
}

export interface LockedSpan {
  id: string;
  text: string;
  leftCtx?: string;
  rightCtx?: string;
  category?: string;
  source?: string;
  confidence?: number;
}

/**
 * Props for PromptEditor component
 */
export interface PromptEditorProps {
  isEmpty?: boolean | undefined;
  className?: string;
  placeholder?: string;
  onTextSelection: (e: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onCopyEvent: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onInput: (e: React.FormEvent<HTMLDivElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLDivElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void;
}

// Re-export User type for convenience
export type { User };
