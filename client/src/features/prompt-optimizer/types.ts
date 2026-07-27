import type { User } from "@features/prompt-optimizer/types/domain/prompt-session";
import type { FormData } from "@/PromptImprovementForm";
import type { CapabilityValues } from "@shared/capabilities";

/**
 * Props for CategoryLegend component
 */
export interface CategoryLegendProps {
  show: boolean;
  onClose: () => void;
  hasContext?: boolean;
  isSuggestionsOpen?: boolean;
}

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

/**
 * Props for LoadingSkeleton component
 */
/**
 * Props for PromptModals component
 */
export interface PromptModalsProps {
  onImprovementComplete?: (enhancedPrompt: string, formData: FormData) => void;
  onConceptComplete?: (
    finalConcept: string,
    elements: Record<string, unknown>,
    metadata: Record<string, unknown>,
  ) => void;
  onSkipBrainstorm?: () => void;
}

// Re-export User type for convenience
export type { User };
