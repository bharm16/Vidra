import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import PromptOptimizerWorkspace from "../PromptOptimizerWorkspace";

/**
 * Regression (UX rule 1 / ADR-0012): a composer fill — take-restore node
 * click, "Your words" chip, starter pill — is a deliberate edit, so it must
 * ride the editor's undoable change path. Routing it through the silent
 * history-application setter erased the previous working words with no
 * restore point: unversioned edits (applied suggestions) became
 * irrecoverable after one click on a words node.
 */

const capturedActionsProps = vi.hoisted(() => ({ current: null as any }));
const undoSpies = vi.hoisted(() => ({
  handleDisplayedPromptChange: vi.fn(),
}));
const promptStateSetters = vi.hoisted(() => ({
  setShowResults: vi.fn(),
  setDisplayedPromptSilently: vi.fn(),
}));
const promptOptimizerState = vi.hoisted(() => ({
  inputPrompt: "input prompt",
  displayedPrompt: "a clockmaker adjusts a brass clock",
  optimizedPrompt: "a clockmaker adjusts a brass clock",
  genericOptimizedPrompt: null,
  isProcessing: false,
  setInputPrompt: vi.fn(),
}));

vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: () => null,
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useLocation: () => ({ pathname: "/", search: "", hash: "" }),
    useParams: () => ({}),
  };
});

vi.mock("@components/KeyboardShortcuts", () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock("@components/Toast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock("../../components/AssetsSidebar", () => ({
  useAssetsSidebar: () => ({
    assets: [],
    byType: { character: [], style: [], location: [], object: [] },
    isLoading: false,
    refresh: vi.fn(async () => undefined),
  }),
}));

vi.mock("../../context/PromptStateContext", () => ({
  PromptStateProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  usePromptConfig: () => ({
    selectedMode: "video",
    selectedModel: "wan-2.2",
    setSelectedMode: vi.fn(),
    setSelectedModel: vi.fn(),
    generationParams: {},
    setGenerationParams: vi.fn(),
    modes: [],
    currentMode: {
      id: "video",
      name: "Video Prompt",
      icon: () => null,
      description: "",
    },
    videoTier: "standard",
    setVideoTier: vi.fn(),
  }),
  usePromptUIStateContext: () => ({
    showResults: true,
    showSettings: false,
    setShowSettings: vi.fn(),
    showShortcuts: false,
    setShowShortcuts: vi.fn(),
    showHistory: false,
    setShowHistory: vi.fn(),
    showImprover: false,
    setShowImprover: vi.fn(),
    showBrainstorm: false,
    setShowBrainstorm: vi.fn(),
    setShowResults: promptStateSetters.setShowResults,
    currentAIIndex: 0,
    setCurrentAIIndex: vi.fn(),
    outputSaveState: "idle",
    setOutputSaveState: vi.fn(),
    outputLastSavedAt: null,
    setOutputLastSavedAt: vi.fn(),
  }),
  usePromptSession: () => ({
    suggestionsData: null,
    setSuggestionsData: vi.fn(),
    conceptElements: null,
    setConceptElements: vi.fn(),
    promptContext: null,
    setPromptContext: vi.fn(),
    currentPromptUuid: "uuid-1",
    currentPromptDocId: "doc-1",
    setCurrentPromptUuid: vi.fn(),
    setCurrentPromptDocId: vi.fn(),
    activeVersionId: null,
    setActiveVersionId: vi.fn(),
  }),
  usePromptHighlights: () => ({
    initialHighlights: null,
    setInitialHighlights: vi.fn(),
    initialHighlightsVersion: 0,
    setInitialHighlightsVersion: vi.fn(),
    canUndo: false,
    setCanUndo: vi.fn(),
    canRedo: false,
    setCanRedo: vi.fn(),
    latestHighlightRef: { current: null },
    persistedSignatureRef: { current: null },
    versionEditCountRef: { current: 0 },
    versionEditsRef: { current: [] },
    undoStackRef: { current: [] },
    redoStackRef: { current: [] },
    isApplyingHistoryRef: { current: false },
    skipLoadFromUrlRef: { current: false },
  }),
  usePromptServices: () => ({
    promptOptimizer: promptOptimizerState,
    promptHistory: {
      history: [],
      filteredHistory: [],
      isLoadingHistory: false,
      searchQuery: "",
      setSearchQuery: vi.fn(),
      deleteFromHistory: vi.fn(),
      updateEntryOutput: vi.fn(),
    },
  }),
  usePromptActions: () => ({
    applyInitialHighlightSnapshot: vi.fn(),
    resetEditStacks: vi.fn(),
    registerPromptEdit: vi.fn(),
    resetVersionEdits: vi.fn(),
    setDisplayedPromptSilently: promptStateSetters.setDisplayedPromptSilently,
    handleCreateNew: vi.fn(),
    loadFromHistory: vi.fn(),
  }),
  usePromptNavigation: () => ({
    navigate: vi.fn(),
    sessionId: null,
  }),
}));

vi.mock("@features/generation-controls", () => ({
  useGenerationControlsStoreState: () => ({
    domain: {
      keyframes: [],
      startFrame: null,
      cameraMotion: null,
      subjectMotion: "",
    },
  }),
  useGenerationControlsStoreActions: () => ({
    setKeyframes: vi.fn(),
    addKeyframe: vi.fn(),
    setStartFrame: vi.fn(),
    clearStartFrame: vi.fn(),
    setCameraMotion: vi.fn(),
    setSubjectMotion: vi.fn(),
  }),
}));

vi.mock("../../context/WorkspaceSessionContext", () => ({
  WorkspaceSessionProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useWorkspaceSession: () => ({
    hasActiveContinuityShot: false,
    currentShotId: null,
    currentShot: null,
    updateShot: vi.fn(),
  }),
}));

vi.mock("../../hooks/useI2VContext", () => ({
  useI2VContext: () => ({
    startImageUrl: null,
    startImageSourcePrompt: null,
  }),
}));

vi.mock("../hooks", async () => {
  const actual = await vi.importActual<typeof import("../hooks")>("../hooks");
  return {
    ...actual,
    usePromptLoader: () => ({ isLoading: false }),
    useHighlightsPersistence: () => ({ handleHighlightsPersist: vi.fn() }),
    useUndoRedo: () => ({
      handleUndo: vi.fn(),
      handleRedo: vi.fn(),
      handleDisplayedPromptChange: undoSpies.handleDisplayedPromptChange,
    }),
    usePromptOptimization: () => ({
      handleOptimize: vi.fn(async () => undefined),
    }),
    useImprovementFlow: () => ({
      handleImproveFirst: vi.fn(),
      handleImprovementComplete: vi.fn(),
    }),
    useConceptBrainstorm: () => ({
      handleConceptComplete: vi.fn(),
      handleSkipBrainstorm: vi.fn(),
    }),
    useEnhancementSuggestions: () => ({
      fetchEnhancementSuggestions: vi.fn(),
      handleSuggestionClick: vi.fn(),
    }),
    usePromptKeyframesSync: () => ({
      serializedKeyframes: [],
      onLoadKeyframes: vi.fn(),
    }),
    useStablePromptContext: () => null,
    usePromptCoherence: () => ({
      issues: [],
      isChecking: false,
      isPanelExpanded: false,
      setIsPanelExpanded: vi.fn(),
      affectedSpanIds: new Set<string>(),
      spanIssueMap: new Map<string, "conflict" | "harmonization">(),
      runCheck: vi.fn(),
      dismissIssue: vi.fn(),
      dismissAll: vi.fn(),
      applyFix: vi.fn(),
    }),
    useAssetManagement: () => ({
      assetEditorState: null,
      quickCreateState: { isOpen: false },
      handlers: {
        onEditAsset: vi.fn(),
        onCreateAsset: vi.fn(),
        onCreateFromTrigger: vi.fn(),
        onCloseAssetEditor: vi.fn(),
        onCloseQuickCreate: vi.fn(),
        onQuickCreateComplete: vi.fn(async () => undefined),
        onCreate: vi.fn(async () => ({})),
        onUpdate: vi.fn(async () => ({})),
        onAddImage: vi.fn(async () => undefined),
        onDeleteImage: vi.fn(async () => undefined),
        onSetPrimaryImage: vi.fn(async () => undefined),
      },
    }),
    useEditorShotPromptBinding: vi.fn(),
  };
});

vi.mock("../../context/PromptResultsActionsContext", () => ({
  PromptResultsActionsProvider: (props: {
    children: ReactNode;
    onComposerFill?: (text: string) => void;
  }) => {
    capturedActionsProps.current = props;
    return <>{props.children}</>;
  },
}));

vi.mock("../providers/sidebar", () => ({
  SidebarDataProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("../components/PromptOptimizerWorkspaceView", () => ({
  PromptOptimizerWorkspaceView: () => <div data-testid="workspace-view" />,
}));

describe("regression: a composer fill is an undoable edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedActionsProps.current = null;
  });

  it("fill routes through the editor change path, never the silent history setter", () => {
    render(<PromptOptimizerWorkspace />);

    expect(capturedActionsProps.current?.onComposerFill).toBeTypeOf("function");
    capturedActionsProps.current.onComposerFill(
      "a clockmaker winds a brass clock",
    );

    // The undoable path received the fill — the previous working words get
    // an undo point…
    expect(undoSpies.handleDisplayedPromptChange).toHaveBeenCalledWith(
      "a clockmaker winds a brass clock",
    );
    // …and the silent setter (which suppresses undo capture) stayed out of it.
    expect(
      promptStateSetters.setDisplayedPromptSilently,
    ).not.toHaveBeenCalledWith("a clockmaker winds a brass clock");
    // The anchor input still updates so the editor surface re-renders.
    expect(promptOptimizerState.setInputPrompt).toHaveBeenCalledWith(
      "a clockmaker winds a brass clock",
    );
  });
});
