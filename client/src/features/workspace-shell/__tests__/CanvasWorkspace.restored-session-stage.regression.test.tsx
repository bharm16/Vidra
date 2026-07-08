import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Regression: restored sessions engage the FrameStage (canvas ownership).
 *
 * 1. Failure boundary: UI component — CanvasWorkspace's canvas-ownership
 *    branch (first-run hero vs FrameStage).
 * 2. Mock boundary: session-derived context inputs (PromptResultsActions
 *    data, generation-controls store, generations runtime). FrameStage
 *    itself renders for real.
 * 3. Invariant: for any session whose content includes an expanded prompt,
 *    the canvas shows the FrameStage (frame or its no-frame state), never
 *    the "What are you making?" hero — and hero visibility never changes
 *    with transient UI state such as the suggestion tray opening.
 */

// Mutable per-test session-content signal served through the mocked
// PromptResultsActions data context (the same seam the live provider fills
// from usePromptLoader's showResults + displayedPrompt).
const dataState: {
  hasExpandedPrompt: boolean;
} = {
  hasExpandedPrompt: false,
};

const onIdeaBoxRegenerate = vi.fn();

vi.mock(
  "@/features/prompt-optimizer/context/PromptResultsActionsContext",
  () => ({
    usePromptResultsData: () => ({
      suggestionsData: null,
      i2vContext: null,
      ideaBoxStage: { kind: "idle" },
      isExpanding: false,
      hasExpandedPrompt: dataState.hasExpandedPrompt,
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
      onIdeaBoxRegenerate,
    }),
  }),
);

import type {
  Generation,
  GenerationsPanelProps,
} from "@features/generations/types";

const runtimeState: {
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
    setStartFrame: vi.fn(),
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

vi.mock("../components/CanvasSettingsRow", () => ({
  CanvasSettingsRow: () => <div data-testid="canvas-settings-row" />,
}));

vi.mock("@/features/prompt-optimizer/components/GenerationPopover", () => ({
  GenerationPopover: () => null,
}));

vi.mock("@/components/modals/CameraMotionModal", () => ({
  CameraMotionModal: () => null,
}));

import { CanvasWorkspace } from "../CanvasWorkspace";
import { withSelectedSpan } from "@/features/prompt-optimizer/context/__tests__/selectedSpanTestHarness";

const EXPANDED_PROMPT =
  "A golden retriever sprinting across a dew-covered meadow at sunrise, low tracking shot, shallow depth of field.";

// The pre-work empty state's marker: a fill-only starter pill. It renders on
// the same isPreWork gate the (now-removed) "What are you making?" headline
// used, so it discriminates empty-state ownership from the FrameStage the same
// way (ADR-0014 rebuild).
const STARTER_PILL = "A product hero shot";

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

describe("regression: restored sessions engage the FrameStage", () => {
  it("a session with an expanded prompt and no frame shows the stage's no-frame state, not the hero", () => {
    dataState.hasExpandedPrompt = true;

    render(
      withSelectedSpan(<CanvasWorkspace {...buildProps(EXPANDED_PROMPT)} />),
    );

    expect(screen.queryByRole("button", { name: STARTER_PILL })).toBeNull();
    expect(screen.getByTestId("frame-stage")).toBeInTheDocument();
    expect(screen.getByTestId("frame-stage-notice")).toBeInTheDocument();
    expect(screen.getByText("No frame yet")).toBeInTheDocument();
  });

  it("the no-frame state offers a single frame-creation action wired to regeneration", () => {
    dataState.hasExpandedPrompt = true;
    onIdeaBoxRegenerate.mockClear();

    render(
      withSelectedSpan(<CanvasWorkspace {...buildProps(EXPANDED_PROMPT)} />),
    );

    const action = screen.getByRole("button", { name: "Create frame" });
    action.click();
    expect(onIdeaBoxRegenerate).toHaveBeenCalledTimes(1);
  });

  it("hero visibility does not change when the suggestion tray opens (expanded-prompt session)", () => {
    dataState.hasExpandedPrompt = true;

    const { rerender } = render(
      withSelectedSpan(<CanvasWorkspace {...buildProps(EXPANDED_PROMPT)} />),
    );
    expect(screen.queryByRole("button", { name: STARTER_PILL })).toBeNull();
    expect(screen.getByTestId("frame-stage")).toBeInTheDocument();

    // Open the suggestion tray (a span is selected). Canvas ownership must
    // not move: still the stage, still no hero.
    rerender(
      withSelectedSpan(<CanvasWorkspace {...buildProps(EXPANDED_PROMPT)} />, {
        selectedSpanId: "span-1",
        selectionLabel: "golden retriever",
      }),
    );
    expect(screen.queryByRole("button", { name: STARTER_PILL })).toBeNull();
    expect(screen.getByTestId("frame-stage")).toBeInTheDocument();
  });

  it("hero visibility does not change when the suggestion tray opens (truly-empty session)", () => {
    dataState.hasExpandedPrompt = false;

    const { rerender } = render(
      withSelectedSpan(<CanvasWorkspace {...buildProps("")} />),
    );
    expect(
      screen.getByRole("button", { name: STARTER_PILL }),
    ).toBeInTheDocument();

    rerender(
      withSelectedSpan(<CanvasWorkspace {...buildProps("")} />, {
        selectedSpanId: "span-1",
      }),
    );
    expect(
      screen.getByRole("button", { name: STARTER_PILL }),
    ).toBeInTheDocument();
  });

  it("the hero still owns the canvas for truly-empty sessions", () => {
    dataState.hasExpandedPrompt = false;

    render(withSelectedSpan(<CanvasWorkspace {...buildProps("")} />));

    expect(
      screen.getByRole("button", { name: STARTER_PILL }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("frame-stage")).toBeNull();
  });
});
