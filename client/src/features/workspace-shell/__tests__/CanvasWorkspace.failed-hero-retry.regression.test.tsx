import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@/features/prompt-optimizer/context/PromptResultsActionsContext",
  () => ({
    usePromptResultsData: () => ({
      suggestionsData: null,
      i2vContext: null,
    }),
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

import { CanvasWorkspace } from "../CanvasWorkspace";
import { withSelectedSpan } from "@/features/prompt-optimizer/context/__tests__/selectedSpanTestHarness";
import type {
  Generation,
  GenerationsPanelProps,
} from "@features/generations/types";

let runtimeState: {
  heroGeneration: Generation | null;
  generations: Generation[];
} = {
  heroGeneration: null,
  generations: [],
};

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

vi.mock("@/features/prompt-optimizer/context/WorkspaceSessionContext", () => ({
  useWorkspaceSession: () => ({
    hasActiveContinuityShot: false,
    currentShot: null,
    updateShot: vi.fn(),
  }),
}));

vi.mock("@features/generations", () => ({
  useGenerationsRuntime: () => ({
    ...runtimeState,
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
vi.mock("@/components/navigation/NavRail", () => ({ NavRail: () => null }));

// CanvasSettingsRow depends on GenerationControlsContext + CreditBalanceContext
// which this hero-retry regression doesn't provide; stub it.
vi.mock("../components/CanvasSettingsRow", () => ({
  CanvasSettingsRow: () => <div data-testid="canvas-settings-row" />,
}));

vi.mock("@/features/prompt-optimizer/components/GenerationPopover", () => ({
  GenerationPopover: () => null,
}));

vi.mock("@/components/modals/CameraMotionModal", () => ({
  CameraMotionModal: () => null,
}));

const createGeneration = (overrides: Partial<Generation> = {}): Generation => ({
  id: "gen-failed",
  tier: "render",
  status: "failed",
  model: "sora",
  prompt: "A cinematic motorcycle ride through a rainy neon street.",
  promptVersionId: "version-1",
  createdAt: Date.now(),
  completedAt: Date.now(),
  mediaType: "video",
  mediaUrls: [],
  thumbnailUrl: null,
  error: "Timed out waiting for video generation",
  ...overrides,
});

const buildProps = (
  prompt: string,
): React.ComponentProps<typeof CanvasWorkspace> => ({
  generationsPanelProps: {
    prompt,
    versions: [],
    promptVersionId: "version-1",
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
  onReuseGeneration: vi.fn(),
  onToggleGenerationFavorite: vi.fn(),
});

describe("regression: failed hero does not linger while composing a retry", () => {
  it("never features a stale failed generation when the user has edited the prompt away from it", () => {
    // Seed runtime with a failed generation whose prompt matches the
    // ORIGINAL prompt the user submitted.
    runtimeState = {
      heroGeneration: createGeneration(),
      generations: [createGeneration()],
    };

    const editedPrompt =
      "A cinematic tracking shot of a motorcyclist crossing a rainy neon downtown avenue.";

    // Render with the EDITED prompt (the user already moved on from the
    // original phrasing). useFeaturedTile should detect prompt mismatch and
    // refuse to feature the failed tile. Because gallery filtering also
    // drops failed generations from the shot grid entirely, the failed
    // generation must not appear in the rendered DOM at all.
    const { container } = render(
      withSelectedSpan(<CanvasWorkspace {...buildProps(editedPrompt)} />),
    );

    expect(
      container.querySelector('[data-generation-id="gen-failed"]'),
    ).toBeNull();
  });
});
