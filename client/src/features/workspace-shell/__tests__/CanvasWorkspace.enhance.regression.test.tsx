import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type {
  Generation,
  GenerationsPanelProps,
} from "@features/generations/types";
import { CanvasWorkspace } from "../CanvasWorkspace";
import { withSelectedSpan } from "@/features/prompt-optimizer/context/__tests__/selectedSpanTestHarness";

vi.mock(
  "@/features/prompt-optimizer/context/PromptResultsActionsContext",
  () => ({
    usePromptResultsData: () => ({
      suggestionsData: null,
      i2vContext: null,
    }),
    usePromptResultsActionsOptional: () => null,
    usePromptResultsActions: () => ({
      user: null,
      onDisplayedPromptChange: () => {},
      onReoptimize: async () => {},
      onFetchSuggestions: () => {},
      onSuggestionClick: () => {},
      onHighlightsPersist: () => {},
      onUndo: () => {},
      onRedo: () => {},
      stablePromptContext: null,
    }),
  }),
);

vi.mock("@features/generation-controls", () => ({
  useGenerationControlsStoreActions: () => ({
    setSelectedModel: vi.fn(),
    setVideoTier: vi.fn(),
    setCameraMotion: vi.fn(),
  }),
  useGenerationControlsStoreState: () => ({
    domain: {
      generationParams: { duration_s: 5 },
      startFrame: null,
      selectedModel: "sora-2",
      videoTier: "render",
      cameraMotion: null,
    },
  }),
}));

vi.mock("@/features/prompt-optimizer/context/PromptStateContext", () => ({
  useOptionalPromptHighlights: () => null,
}));

// CanvasSettingsRow consumes GenerationControlsContext for its Preview /
// Generate / Enhance gating; the regression doesn't exercise those branches,
// but the hook throws when no provider is mounted, so stub it inline.
vi.mock(
  "@/features/prompt-optimizer/context/GenerationControlsContext",
  () => ({
    useGenerationControlsContext: () => ({
      controls: null,
      setControls: vi.fn(),
      onStoryboard: null,
      onInsufficientCredits: null,
      setOnInsufficientCredits: vi.fn(),
      faceSwapPreview: null,
      setFaceSwapPreview: vi.fn(),
    }),
  }),
);

vi.mock("@/features/prompt-optimizer/context/WorkspaceSessionContext", () => ({
  useWorkspaceSession: () => ({
    hasActiveContinuityShot: false,
    currentShot: null,
    updateShot: vi.fn(),
  }),
}));

vi.mock("@features/generations", () => ({
  useGenerationsRuntime: () => ({
    heroGeneration: null,
    generations: [],
    handleCancel: vi.fn(),
    handleRetry: vi.fn(),
  }),
}));

vi.mock("@/components/ToolSidebar/context", () => ({
  useSidebarGenerationDomain: () => null,
}));

vi.mock(
  "@/components/ToolSidebar/components/panels/GenerationControlsPanel/hooks/useModelSelectionRecommendation",
  () => ({
    useModelSelectionRecommendation: () => ({
      recommendationMode: "t2v",
      modelRecommendation: null,
      recommendedModelId: undefined,
      efficientModelId: undefined,
      renderModelOptions: [{ id: "sora-2", label: "Sora" }],
      renderModelId: "sora-2",
      recommendationAgeMs: null,
    }),
  }),
);

vi.mock("../components/WorkspaceTopBar", () => ({
  WorkspaceTopBar: () => <header role="banner">topbar</header>,
}));

vi.mock("@/features/prompt-optimizer/components/GenerationPopover", () => ({
  GenerationPopover: () => null,
}));

vi.mock("@/components/modals/CameraMotionModal", () => ({
  CameraMotionModal: () => null,
}));

const buildProps = (): React.ComponentProps<typeof CanvasWorkspace> => ({
  generationsPanelProps: {
    prompt: "baby driving a car",
    versions: [],
    promptVersionId: "",
  } as unknown as GenerationsPanelProps,
  copied: false,
  canUndo: false,
  canRedo: false,
  onCopy: vi.fn(),
  onShare: vi.fn(),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  editorRef:
    React.createRef<HTMLDivElement>() as React.RefObject<HTMLDivElement>,
  onTextSelection: vi.fn(),
  onHighlightClick: vi.fn(),
  onHighlightMouseDown: vi.fn(),
  onHighlightMouseEnter: vi.fn(),
  onHighlightMouseLeave: vi.fn(),
  onCopyEvent: vi.fn(),
  onInput: vi.fn(),
  onEditorKeyDown: vi.fn(),
  onEditorBlur: vi.fn(),
  autocompleteOpen: false,
  autocompleteSuggestions: [],
  autocompleteSelectedIndex: 0,
  autocompletePosition: { top: 0, left: 0 },
  autocompleteLoading: false,
  onAutocompleteSelect: vi.fn(),
  onAutocompleteClose: vi.fn(),
  onAutocompleteIndexChange: vi.fn(),
  onReuseGeneration: vi.fn((_generation: Generation) => undefined),
  onToggleGenerationFavorite: vi.fn(),
});

describe("regression: canvas empty-session shell wiring", () => {
  it("keeps a single prompt textbox and the minimal sheet controls in the empty-session shell", () => {
    // Empty session = no prompt, no shots. Under the unified path the
    // floating composer always mounts; the prompt textbox lives there. The
    // pre-work sheet shows only the two inline selectors (16:9 · duration) +
    // a circular submit — the model picker / frame chrome belongs to the
    // working composer (ADR-0014 + rulings), so it is deliberately absent.
    const props = buildProps();
    render(
      withSelectedSpan(
        <CanvasWorkspace
          {...props}
          generationsPanelProps={{
            ...(props.generationsPanelProps as GenerationsPanelProps),
            prompt: "",
          }}
        />,
      ),
    );

    expect(
      screen.getAllByRole("textbox", { name: "Shot description" }),
    ).toHaveLength(1);
    // Minimal sheet: the settings row mounts, the model picker does not.
    expect(screen.getByTestId("canvas-settings-row")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Video model/i })).toBeNull();
  });

  it("does not lock the user into empty state when prompt content exists, even without a prompt version id", () => {
    // The legacy implementation could erroneously remain in empty-state
    // chrome when promptVersionId was missing despite a hydrated prompt.
    // The invariant is that the editor stays present and interactive; a
    // missing version id must not wedge the shell.
    const props = buildProps();
    render(
      withSelectedSpan(
        <CanvasWorkspace
          {...props}
          generationsPanelProps={{
            ...(props.generationsPanelProps as GenerationsPanelProps),
            prompt: "The camera tracks a subject through warm golden light.",
            promptVersionId: "",
          }}
        />,
      ),
    );

    expect(
      screen.getByRole("textbox", { name: "Shot description" }),
    ).toBeInTheDocument();
    // The composer chrome stays wired (the settings row mounts with the
    // editor); the shell is not wedged into a dead empty state.
    expect(screen.getByTestId("canvas-settings-row")).toBeInTheDocument();
  });
});
