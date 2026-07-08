import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

// This regression exercises the shots-grid gallery popovers — the pre-space
// layout, kept until the M6 deletion pass. Pin SPACE_LINEAGE off so the flip's
// new default (the space) doesn't hide the grid this test is about.
vi.mock("@/config/features.config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/config/features.config")>();
  return {
    ...actual,
    FEATURES: { ...actual.FEATURES, SPACE_LINEAGE: false },
  };
});

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

// WorkspaceTopBar pulls credit/auth contexts that the regression doesn't
// exercise — replace with a minimal landmark.
vi.mock("../components/WorkspaceTopBar", () => ({
  WorkspaceTopBar: () => <header role="banner">topbar</header>,
}));
vi.mock("@/components/navigation/NavRail", () => ({ NavRail: () => null }));

// CanvasSettingsRow depends on GenerationControlsContext + CreditBalanceContext
// which this gallery-selection regression doesn't provide; stub it.
vi.mock("../components/CanvasSettingsRow", () => ({
  CanvasSettingsRow: () => <div data-testid="canvas-settings-row" />,
}));

vi.mock("@/features/prompt-optimizer/components/GenerationPopover", () => ({
  GenerationPopover: ({ activeId }: { activeId: string }) => (
    <div data-testid="generation-popover">{activeId}</div>
  ),
}));

vi.mock("@/components/modals/CameraMotionModal", () => ({
  CameraMotionModal: () => null,
}));

const createGeneration = (overrides: Partial<Generation> = {}): Generation => ({
  id: "gen-1",
  tier: "render",
  status: "completed",
  model: "sora",
  prompt: "Prompt",
  promptVersionId: "version-1",
  createdAt: Date.now(),
  completedAt: Date.now(),
  mediaType: "video",
  mediaUrls: ["https://storage.example.com/users/u1/generations/video.mp4"],
  thumbnailUrl:
    "https://storage.example.com/users/u1/previews/images/thumb.webp",
  ...overrides,
});

const buildProps = (): React.ComponentProps<typeof CanvasWorkspace> => ({
  generationsPanelProps: {
    prompt: "baby driving a car",
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

describe("regression: canvas closes stale generation popovers when gallery items disappear", () => {
  beforeEach(() => {
    runtimeState = {
      heroGeneration: null,
      generations: [],
    };
  });

  it("clears the active popover when the selected gallery item is no longer browseable", async () => {
    const generation = createGeneration();
    runtimeState = {
      heroGeneration: generation,
      generations: [generation],
    };

    const user = userEvent.setup();
    const props = buildProps();
    const { container, rerender } = render(
      withSelectedSpan(<CanvasWorkspace {...props} />),
    );

    // The unified workspace renders gallery entries as <article
    // data-generation-id={id}> tiles inside ShotRow. Clicking a completed
    // tile sets viewingId, which mounts GenerationPopover. (This preserves
    // the legacy GalleryPanel.onSelectGeneration behavior contract.)
    const tile = container.querySelector(
      '[data-generation-id="gen-1"]',
    ) as HTMLElement | null;
    expect(tile).not.toBeNull();
    await user.click(tile!);
    expect(screen.getByTestId("generation-popover")).toHaveTextContent("gen-1");

    // Mutate the generation to "failed" + drop media. galleryGeneration
    // filtering removes it from the gallery → generationLookup no longer
    // contains gen-1 → effect clears viewingId → popover unmounts.
    runtimeState = {
      heroGeneration: {
        ...generation,
        status: "failed",
        mediaUrls: [],
        thumbnailUrl: null,
        error: "Not allowed by CORS",
      },
      generations: [
        {
          ...generation,
          status: "failed",
          mediaUrls: [],
          thumbnailUrl: null,
          error: "Not allowed by CORS",
        },
      ],
    };

    rerender(withSelectedSpan(<CanvasWorkspace {...props} />));

    await waitFor(() => {
      expect(
        screen.queryByTestId("generation-popover"),
      ).not.toBeInTheDocument();
    });
  });
});
