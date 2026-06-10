import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/features/prompt-optimizer/context/PromptResultsActionsContext",
  () => ({
    usePromptResultsData: () => ({
      suggestionsData: null,
      i2vContext: null,
      motionIdeas: undefined,
      isMotionIdeasLoading: false,
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

import { CanvasWorkspace } from "../CanvasWorkspace";
import { dispatchContinueScene } from "../events";
import type {
  Generation,
  GenerationsPanelProps,
} from "@features/generations/types";

// Capture the prompt the runtime closure will see at submit time. The
// production wiring forwards `effectivePrompt` into useGenerationsRuntime so
// the chip suffixes ride along with handleDraft / handleRenderWithFaceSwap /
// handleStoryboard. The mock records that prop on each render.
let capturedRuntimePrompt: string | null = null;
const setStartFrameMock = vi.fn();

vi.mock("@features/generation-controls", () => ({
  useGenerationControlsStoreActions: () => ({
    setSelectedModel: vi.fn(),
    setVideoTier: vi.fn(),
    setCameraMotion: vi.fn(),
    setStartFrame: setStartFrameMock,
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

let mockRuntimeGenerations: Generation[] = [];
vi.mock("@features/generations", () => ({
  useGenerationsRuntime: ({ prompt }: { prompt: string }) => {
    capturedRuntimePrompt = prompt;
    return {
      heroGeneration: mockRuntimeGenerations[0] ?? null,
      generations: mockRuntimeGenerations,
      handleCancel: vi.fn(),
      handleRetry: vi.fn(),
    };
  },
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

const buildProps = (
  prompt = "a dancer",
): React.ComponentProps<typeof CanvasWorkspace> => ({
  generationsPanelProps: {
    prompt,
    versions: [],
    promptVersionId: "v-1",
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
  selectedSpanId: null,
  suggestionCount: 0,
  suggestionsListRef:
    React.createRef<HTMLDivElement>() as React.RefObject<HTMLDivElement>,
  inlineSuggestions: [],
  activeSuggestionIndex: 0,
  onActiveSuggestionChange: vi.fn(),
  interactionSourceRef: { current: "auto" },
  onSuggestionClick: vi.fn(),
  onCloseInlinePopover: vi.fn(),
  selectionLabel: "",
  onApplyActiveSuggestion: vi.fn(),
  isInlineLoading: false,
  isInlineError: false,
  inlineErrorMessage: "",
  isInlineEmpty: true,
  customRequest: "",
  onCustomRequestChange: vi.fn(),
  customRequestError: "",
  onCustomRequestErrorChange: vi.fn(),
  onCustomRequestSubmit: vi.fn(),
  isCustomRequestDisabled: true,
  isCustomLoading: false,
  onReuseGeneration: vi.fn(),
  onToggleGenerationFavorite: vi.fn(),
});

const completedVideoGeneration = (
  overrides: Partial<Generation> = {},
): Generation => ({
  id: "gen-source",
  tier: "render",
  status: "completed",
  model: "sora-2",
  prompt: "a dancer",
  promptVersionId: "v-1",
  createdAt: Date.now(),
  completedAt: Date.now(),
  mediaType: "video",
  mediaUrls: ["https://storage.example.com/users/u1/videos/clip.mp4"],
  thumbnailUrl: "https://storage.example.com/users/u1/previews/last-frame.webp",
  ...overrides,
});

beforeEach(() => {
  capturedRuntimePrompt = null;
  setStartFrameMock.mockReset();
  mockRuntimeGenerations = [];
});

describe("regression: tune chips reach the runtime submit closure", () => {
  // Selecting Tune chips must rewrite the prompt that handleDraft /
  // handleRenderWithFaceSwap / handleStoryboard close over inside
  // useGenerationsRuntime — those handlers take no prompt argument, so the
  // chip suffix has to ride in via the runtime prop. Without this wiring
  // the user picks "Handheld" + "Soft", clicks Generate, and the model
  // sees only "a dancer" with no taste cues.
  it("forwards the chip-suffixed prompt into useGenerationsRuntime", async () => {
    const props = buildProps("a dancer");
    render(<CanvasWorkspace {...props} />);

    // Baseline: with no chips, runtime prompt equals raw prompt verbatim.
    expect(capturedRuntimePrompt).toBe("a dancer");

    // Open the Tune drawer (the count badge is on the toggle button).
    const tuneToggle = screen.getByRole("button", { name: /^Tune/ });
    fireEvent.click(tuneToggle);

    // Toggle two chips. The labels are rendered inside the drawer; we
    // target by accessible name.
    fireEvent.click(screen.getByRole("button", { name: "Handheld" }));
    fireEvent.click(screen.getByRole("button", { name: "Soft" }));

    // After both toggles, the runtime should now see the suffixed prompt.
    expect(capturedRuntimePrompt).toBe(
      "a dancer, handheld camera, soft warm light",
    );
  });

  // The Tune toggle's count badge reflects the active chip count — proves
  // the chip state reached state-driven UI without leaking the suffix into
  // the editor surface's prop chain. (The editor body is uncontrolled
  // contenteditable so its visible text isn't asserted here.)
  it("surfaces the active chip count on the Tune toggle", () => {
    const props = buildProps("a dancer");
    render(<CanvasWorkspace {...props} />);

    expect(screen.getByRole("button", { name: "Tune" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tune" }));
    fireEvent.click(screen.getByRole("button", { name: "Handheld" }));
    fireEvent.click(screen.getByRole("button", { name: "Soft" }));

    expect(
      screen.getByRole("button", { name: /Tune · 2/ }),
    ).toBeInTheDocument();
  });
});

describe("regression: continue scene seeds the start frame", () => {
  // CONTINUE_SCENE fires from a featured tile; the orchestrator must resolve
  // the source generation and seed the start-frame popover so the next render
  // begins from that frame. The thumbnailUrl is the video's preview/poster
  // image and serves as the last-frame approximation today.
  it("calls setStartFrame with the source generation's thumbnail URL", () => {
    const source = completedVideoGeneration({ id: "gen-source" });
    mockRuntimeGenerations = [source];

    const props = buildProps("a dancer");
    render(<CanvasWorkspace {...props} />);

    dispatchContinueScene({ fromGenerationId: "gen-source" });

    expect(setStartFrameMock).toHaveBeenCalledTimes(1);
    expect(setStartFrameMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://storage.example.com/users/u1/previews/last-frame.webp",
        source: "generation",
        sourcePrompt: "a dancer",
      }),
    );
  });

  // Falls back to mediaUrls[0] when thumbnailUrl is absent (image-tier or
  // any generation whose thumbnail resolution returned null). Without this
  // path the start frame would silently fail to seed.
  it("falls back to mediaUrls[0] when thumbnailUrl is absent", () => {
    const source = completedVideoGeneration({
      id: "gen-source",
      thumbnailUrl: null,
      mediaUrls: ["https://storage.example.com/users/u1/images/frame.webp"],
    });
    mockRuntimeGenerations = [source];

    const props = buildProps("a dancer");
    render(<CanvasWorkspace {...props} />);

    dispatchContinueScene({ fromGenerationId: "gen-source" });

    expect(setStartFrameMock).toHaveBeenCalledTimes(1);
    expect(setStartFrameMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://storage.example.com/users/u1/images/frame.webp",
        source: "generation",
      }),
    );
  });

  // Unknown generation id is a no-op — the handler must not call
  // setStartFrame with garbage data, which would corrupt the start-frame
  // popover state.
  it("is a no-op when the generation id does not resolve", () => {
    mockRuntimeGenerations = [completedVideoGeneration({ id: "gen-other" })];

    const props = buildProps("a dancer");
    render(<CanvasWorkspace {...props} />);

    dispatchContinueScene({ fromGenerationId: "missing-gen-id" });

    expect(setStartFrameMock).not.toHaveBeenCalled();
  });
});
