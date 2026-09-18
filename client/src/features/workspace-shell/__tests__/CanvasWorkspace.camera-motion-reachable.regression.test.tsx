import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type {
  Generation,
  GenerationsPanelProps,
} from "@features/generations/types";
import { CAMERA_PATHS, cameraMotionDirection } from "@shared/cameraMotion";
import { CanvasWorkspace } from "../CanvasWorkspace";
import { buildPromptEditorWiring } from "./__fixtures__/promptEditorWiring";
import { withSelectedSpan } from "@/features/prompt-optimizer/context/__tests__/selectedSpanTestHarness";

/**
 * Regression (ADR-0022 D7): the camera-motion picker existed but nothing
 * could open it. Its opener was defined in this component and passed to no
 * control — a repo-wide grep returned exactly one hit, the definition — and
 * the modal additionally sat behind the frozen convergence flag, whose
 * default is off. The picker was unreachable twice over.
 *
 * This renders the real settings row, so a control that stops being passed
 * the opener fails here rather than silently going quiet again.
 */

const PROMPT = "A clockmaker adjusts a brass clock in a dim workshop.";
const PUSH_IN = CAMERA_PATHS.find((path) => path.id === "push_in");

const spies = vi.hoisted(() => ({
  onComposerFill: vi.fn(),
  setCameraMotion: vi.fn(),
  onCreateVersionIfNeeded: vi.fn(() => "version-2"),
}));

const domainState = vi.hoisted(() => ({
  startFrame: null as { url: string; generationId?: string } | null,
}));

const highlightState = vi.hoisted(() => ({
  spans: [] as Array<{ start: number; end: number; category: string }>,
}));

vi.mock(
  "@/features/prompt-optimizer/context/PromptResultsActionsContext",
  () => ({
    usePromptResultsData: () => ({ suggestionsData: null, i2vContext: null }),
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
      onComposerFill: spies.onComposerFill,
    }),
  }),
);

vi.mock("@features/generation-controls", () => ({
  useGenerationControlsStoreActions: () => ({
    setSelectedModel: vi.fn(),
    setVideoTier: vi.fn(),
    setCameraMotion: spies.setCameraMotion,
  }),
  useGenerationControlsStoreState: () => ({
    domain: {
      generationParams: { duration_s: 5 },
      startFrame: domainState.startFrame,
      selectedModel: "sora-2",
      videoTier: "render",
      cameraMotion: null,
    },
  }),
}));

vi.mock("@/features/prompt-optimizer/context/PromptStateContext", () => ({
  useOptionalPromptHighlights: () => ({
    initialHighlights: null,
    latestHighlightRef: { current: { spans: highlightState.spans } },
  }),
  useOptionalPromptServices: () => null,
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

vi.mock("../hooks/useModelSelectionRecommendation", () => ({
  useModelSelectionRecommendation: () => ({
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

// Stands in for the picker: reports whether it is open, and offers the one
// choice this test makes.
vi.mock("@/components/modals/CameraMotionModal", () => ({
  CameraMotionModal: ({
    isOpen,
    onSelect,
    conflict,
  }: {
    isOpen: boolean;
    onSelect: (path: unknown) => void;
    conflict: { kind: string; text: string } | null;
  }) => (
    <div data-testid="camera-motion-modal" data-open={String(isOpen)}>
      <button type="button" onClick={() => onSelect(PUSH_IN)}>
        Choose push in
      </button>
      {conflict ? (
        <span data-testid="modal-conflict" data-kind={conflict.kind}>
          {conflict.text}
        </span>
      ) : null}
    </div>
  ),
}));

const buildProps = (
  prompt: string = PROMPT,
): React.ComponentProps<typeof CanvasWorkspace> => ({
  generationsPanelProps: {
    prompt,
    versions: [],
    promptVersionId: "version-1",
    onCreateVersionIfNeeded: spies.onCreateVersionIfNeeded,
  } as unknown as GenerationsPanelProps,
  editing: buildPromptEditorWiring(),
  onReuseGeneration: vi.fn((_generation: Generation) => undefined),
  onToggleGenerationFavorite: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  domainState.startFrame = {
    url: "https://example.test/frame.png",
    generationId: "gen-1",
  };
  highlightState.spans = [];
});

describe("regression: the camera-motion picker is reachable", () => {
  it("is not offered with no first frame armed", () => {
    domainState.startFrame = null;
    render(withSelectedSpan(<CanvasWorkspace {...buildProps()} />));

    expect(screen.queryByTestId("canvas-camera-motion-button")).toBeNull();
    expect(screen.queryByTestId("camera-motion-modal")).toBeNull();
  });

  it("opens from the armed first frame's controls", async () => {
    render(withSelectedSpan(<CanvasWorkspace {...buildProps()} />));

    // The modal is lazy — awaited so its closed state is observed, not raced.
    expect(await screen.findByTestId("camera-motion-modal")).toHaveAttribute(
      "data-open",
      "false",
    );

    fireEvent.click(screen.getByTestId("canvas-camera-motion-button"));

    expect(screen.getByTestId("camera-motion-modal")).toHaveAttribute(
      "data-open",
      "true",
    );
  });

  it("writes the choice into the creator's words", () => {
    render(withSelectedSpan(<CanvasWorkspace {...buildProps()} />));

    fireEvent.click(screen.getByTestId("canvas-camera-motion-button"));
    fireEvent.click(screen.getByRole("button", { name: "Choose push in" }));

    const direction = cameraMotionDirection("push_in");
    expect(spies.onComposerFill).toHaveBeenCalledWith(`${PROMPT} ${direction}`);
    expect(spies.setCameraMotion).toHaveBeenCalledWith(PUSH_IN);
  });

  it("surfaces a conflict instead of overwriting the creator's camera words", () => {
    const cameraQuote = "in a dim workshop";
    highlightState.spans = [
      {
        start: PROMPT.indexOf(cameraQuote),
        end: PROMPT.indexOf(cameraQuote) + cameraQuote.length,
        category: "camera.movement",
      },
    ];

    render(withSelectedSpan(<CanvasWorkspace {...buildProps()} />));

    fireEvent.click(screen.getByTestId("canvas-camera-motion-button"));
    fireEvent.click(screen.getByRole("button", { name: "Choose push in" }));

    const notice = screen.getByTestId("modal-conflict");
    expect(notice).toHaveAttribute("data-kind", "existing-camera-span");
    expect(notice).toHaveTextContent(cameraQuote);
    expect(spies.onComposerFill).not.toHaveBeenCalled();
    expect(spies.setCameraMotion).not.toHaveBeenCalled();
  });

  it("mints the words-version once the written direction reaches the editor", () => {
    const { rerender } = render(
      withSelectedSpan(<CanvasWorkspace {...buildProps()} />),
    );

    fireEvent.click(screen.getByTestId("canvas-camera-motion-button"));
    fireEvent.click(screen.getByRole("button", { name: "Choose push in" }));

    // The write rides the editor, so the new words arrive on a later render.
    // Minting before that would version the previous text.
    expect(spies.onCreateVersionIfNeeded).not.toHaveBeenCalled();

    const direction = cameraMotionDirection("push_in");
    rerender(
      withSelectedSpan(
        <CanvasWorkspace {...buildProps(`${PROMPT} ${direction}`)} />,
      ),
    );

    expect(spies.onCreateVersionIfNeeded).toHaveBeenCalledTimes(1);
  });
});
