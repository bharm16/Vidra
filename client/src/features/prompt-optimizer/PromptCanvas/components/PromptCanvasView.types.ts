import type { DrawerDisplayMode } from "@components/CollapsibleDrawer";
import type { AssetSuggestion } from "@features/assets/hooks/useTriggerAutocomplete";
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

export interface PromptCanvasViewProps {
  selectedMode: string;
  outlineOverlayActive: boolean;
  outlineOverlayState: "closed" | "opening" | "open" | "closing";
  outlineOverlayRef: React.RefObject<HTMLDivElement>;
  categorySpans: Span[];
  editorRef: React.RefObject<HTMLDivElement>;
  onCategorySpanHoverChange: (spanId: string | null) => void;
  showLegend: boolean;
  onCloseLegend: () => void;
  promptContext: PromptContext | null;
  isSuggestionsOpen: boolean;
  hasCanvasContent: boolean;
  editorColumnRef: React.RefObject<HTMLDivElement>;
  editorWrapperRef: React.RefObject<HTMLDivElement>;
  outputLocklineRef: React.RefObject<HTMLDivElement>;
  lockButtonRef: React.RefObject<HTMLButtonElement>;
  onTextSelection: (e: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => void;
  onHighlightMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => void;
  onCopyEvent: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onInput: (e: React.FormEvent<HTMLDivElement>) => void;
  onEditorKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onEditorBlur: (event: React.FocusEvent<HTMLDivElement>) => void;
  autocompleteOpen: boolean;
  autocompleteSuggestions: AssetSuggestion[];
  autocompleteSelectedIndex: number;
  autocompletePosition: { top: number; left: number };
  autocompleteLoading: boolean;
  onAutocompleteSelect: (asset: AssetSuggestion) => void;
  onAutocompleteClose: () => void;
  onAutocompleteIndexChange: (index: number) => void;
  enableMLHighlighting: boolean;
  hoveredSpanId: string | null;
  lockButtonPosition: { top: number; left: number } | null;
  isHoveredLocked: boolean;
  onToggleLock: () => void;
  onCancelHideLockButton: () => void;
  onLockButtonMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
  isOutputLoading: boolean;
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
