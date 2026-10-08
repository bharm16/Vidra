import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type {
  Generation,
  GenerationsPanelProps,
} from "@features/generations/types";
import { CanvasWorkspace } from "../CanvasWorkspace";
import { buildPromptEditorWiring } from "./__fixtures__/promptEditorWiring";
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
  useOptionalPromptServices: () => null,
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

vi.mock("../hooks/useVideoModelSelection", () => ({
  useVideoModelSelection: () => ({
    recommendationMode: "t2v",
    modelRecommendation: null,
    recommendedModelId: undefined,
    efficientModelId: undefined,
    renderModelOptions: [{ id: "sora-2", label: "Sora" }],
    renderModelId: "sora-2",
    recommendationAgeMs: null,
  }),
}));

vi.mock("../components/WorkspaceTopBar", () => ({
  WorkspaceTopBar: () => <header role="banner">topbar</header>,
}));
vi.mock("@/components/navigation/NavRail", () => ({ NavRail: () => null }));

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
  editing: buildPromptEditorWiring(),
  onReuseGeneration: vi.fn((_generation: Generation) => undefined),
  onToggleGenerationFavorite: vi.fn(),
});

describe("regression: canvas empty-session shell wiring", () => {
  it("keeps one prompt textbox and its video settings in the empty-session shell", () => {
    // Before-first-generation uses the same live editor and settings actors.
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
    // Empty editor state still has the manual settings control.
    expect(screen.getByRole("region", { name: "Video composer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Video model" })).toBeInTheDocument();
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
    expect(screen.getByRole("region", { name: "Video composer" })).toBeInTheDocument();
  });
});
