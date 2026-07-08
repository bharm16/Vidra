import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type {
  Generation,
  GenerationsPanelProps,
} from "@features/generations/types";
import { CanvasWorkspace } from "../CanvasWorkspace";
import { withSelectedSpan } from "@/features/prompt-optimizer/context/__tests__/selectedSpanTestHarness";

// ADR-0010 / M3 (differentiator reachability — kill the I2V box-repurposing):
// a start frame (I2V mode) must NOT repurpose the composer's text box into a
// motion-direction input. The input is the description in every stage, so its
// placeholder stays "Describe your shot…" — never "Optional: add motion
// direction…". The repurposed placeholder tells the user the box is no longer
// the editable description where click-to-enhance lives; that is one of the
// box-repurposing surfaces this slice removes.
//
// I2V is on here: the generation-controls domain carries a startFrame url
// (CanvasWorkspace derives isI2VMode = Boolean(domain.startFrame?.url)).

vi.mock(
  "@/features/prompt-optimizer/context/PromptResultsActionsContext",
  () => ({
    usePromptResultsData: () => ({
      suggestionsData: null,
      i2vContext: { isI2VMode: true },
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
      startFrame: { url: "https://example.test/frame.png" },
      selectedModel: "sora-2",
      videoTier: "render",
      cameraMotion: null,
    },
  }),
}));

vi.mock("@/features/prompt-optimizer/context/PromptStateContext", () => ({
  useOptionalPromptHighlights: () => null,
}));

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
    prompt: "",
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

describe("regression: the input is the description in every stage (M3)", () => {
  it("keeps the shot-description placeholder when a start frame is active (no I2V box-repurposing)", () => {
    const props = buildProps();
    render(withSelectedSpan(<CanvasWorkspace {...props} />));

    const editor = screen.getByRole("textbox", { name: "Shot description" });
    expect(editor).toHaveAttribute("data-placeholder", "Describe your shot…");
  });
});
