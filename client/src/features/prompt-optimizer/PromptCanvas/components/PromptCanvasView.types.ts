import type { DrawerDisplayMode } from "@components/CollapsibleDrawer";
import type { PromptEditorWiring } from "@features/workspace-shell/components/PromptEditorSurface";
import type { PromptVersionEntry } from "@features/prompt-optimizer/types/domain/prompt-session";
import type { PromptContext } from "@utils/PromptContext/PromptContext";
import type { ExportFormat } from "@features/prompt-optimizer/types";
import type {
  Generation,
  GenerationsPanelProps,
} from "@features/generations/types";
import type { Span } from "@features/prompt-optimizer/SpanCategoryAccordion/components/types";
import type { CoherenceIssue } from "@features/prompt-optimizer/components/coherence/useCoherenceAnnotations";
import type { CoherenceRecommendation } from "@features/prompt-optimizer/types/coherence";

export interface VersionsDrawerState {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  displayMode: DrawerDisplayMode;
}

export interface VersionsPanelPropsBase {
  versions: PromptVersionEntry[];
  selectedVersionId: string;
  onSelectVersion: (versionId: string) => void;
  onCreateVersion: () => void;
}

/**
 * What the editor section needs beyond the editing wiring: the model-format
 * select, copy/undo/redo, the export menu, the lock affordance, and the
 * highlighting state the editor body reads.
 *
 * A remainder set rather than one concept, and named for that — its members
 * share a consumer, not a subject. Grouped because PromptCanvasView forwarded
 * all 28 verbatim to that single child, so the view's own interface carried the
 * editor section's contract and every added control had to be named in three
 * places. Only one component consumes it, so this is a pass-through fix, not a
 * seam: nothing varies across it.
 */
export interface EditorSectionOwnProps {
  editorWrapperRef: React.RefObject<HTMLDivElement>;
  outputLocklineRef: React.RefObject<HTMLDivElement>;
  lockButtonRef: React.RefObject<HTMLButtonElement>;
  enableMLHighlighting: boolean;
  hoveredSpanId: string | null;
  lockButtonPosition: { top: number; left: number } | null;
  isHoveredLocked: boolean;
  onToggleLock: () => void;
  onCancelHideLockButton: () => void;
  onLockButtonMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
  isOutputLoading: boolean;
  openOutlineOverlay: () => void;
  copied: boolean;
  onCopy: () => void;
  modelFormatValue: string;
  modelFormatLabel: string;
  modelFormatOptions: Array<{ id: string; label: string }>;
  modelFormatDisabled: boolean;
  onModelFormatChange: (nextModel: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  exportMenuRef: React.RefObject<HTMLDivElement>;
  showExportMenu: boolean;
  onToggleExportMenu: (open: boolean) => void;
  onExport: (format: ExportFormat) => void;
  onShare: () => void;
}

export interface PromptCanvasViewProps {
  /** Everything the editor section needs beyond the wiring. */
  editorSection: EditorSectionOwnProps;
  /** The editable node, its handlers, and autocomplete state. */
  editing: PromptEditorWiring;
  selectedMode: string;
  outlineOverlayActive: boolean;
  outlineOverlayState: "closed" | "opening" | "open" | "closing";
  outlineOverlayRef: React.RefObject<HTMLDivElement>;
  categorySpans: Span[];
  onCategorySpanHoverChange: (spanId: string | null) => void;
  showLegend: boolean;
  onCloseLegend: () => void;
  promptContext: PromptContext | null;
  isSuggestionsOpen: boolean;
  editorColumnRef: React.RefObject<HTMLDivElement>;
  coherenceIssues?: CoherenceIssue[] | undefined;
  isCoherenceChecking?: boolean | undefined;
  isCoherencePanelExpanded?: boolean | undefined;
  onToggleCoherencePanelExpanded?: (() => void) | undefined;
  onDismissCoherenceIssue?: ((issueId: string) => void) | undefined;
  onDismissAllCoherenceIssues?: (() => void) | undefined;
  onApplyCoherenceFix?:
    | ((issueId: string, recommendation: CoherenceRecommendation) => void)
    | undefined;
  onScrollToCoherenceSpan?: ((spanId: string) => void) | undefined;
  versionsDrawer: VersionsDrawerState;
  versionsPanelProps: VersionsPanelPropsBase;
  generationsPanelProps: GenerationsPanelProps;
  onReuseGeneration: (generation: Generation) => void;
  onToggleGenerationFavorite: (
    generationId: string,
    isFavorite: boolean,
  ) => void;
  generationsSheetOpen: boolean;
  onGenerationsSheetOpenChange: (open: boolean) => void;
  showDiff: boolean;
  onShowDiffChange: (open: boolean) => void;
  inputPrompt: string;
  normalizedDisplayedPrompt: string | null;
}
