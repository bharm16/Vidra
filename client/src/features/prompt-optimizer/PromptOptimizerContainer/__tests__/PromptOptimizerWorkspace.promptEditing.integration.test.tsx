import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import PromptOptimizerWorkspace from "../PromptOptimizerWorkspace";

const capturedViewProps = vi.hoisted(() => ({ current: null as any }));
const promptStateSetters = vi.hoisted(() => ({
  setShowResults: vi.fn(),
  setDisplayedPromptSilently: vi.fn(),
}));
const promptOptimizerState = vi.hoisted(() => ({
  inputPrompt: "input prompt",
  displayedPrompt: "optimized output",
  optimizedPrompt: "optimized output",
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
      name: "Video",
      icon: () => null,
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
    promptIdentityRef: { current: { uuid: "uuid-1", docId: "doc-1" } },
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
      handleDisplayedPromptChange: vi.fn(),
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
  PromptResultsActionsProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("../providers/sidebar", () => ({
  SidebarDataProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("../components/PromptOptimizerWorkspaceView", () => ({
  PromptOptimizerWorkspaceView: (props: unknown) => {
    capturedViewProps.current = props;
    return <div data-testid="workspace-view" />;
  },
}));

describe("PromptOptimizerWorkspace prompt interaction integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptOptimizerState.inputPrompt = "input prompt";
    promptOptimizerState.displayedPrompt = "optimized output";
  });

  it("does not pass legacy sequence workspace props to the view", () => {
    render(<PromptOptimizerWorkspace />);

    expect(capturedViewProps.current).toBeTruthy();
    expect(capturedViewProps.current.sequenceWorkspaceProps).toBeUndefined();
  });
});
