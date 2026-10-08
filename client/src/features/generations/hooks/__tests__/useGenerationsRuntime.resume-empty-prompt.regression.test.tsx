/**
 * Regression: Pending-generation intent resume must fire even when the outer
 * `prompt` prop is transiently empty during the draft→persisted transition.
 *
 * Invariant: If a pending intent with a non-empty captured prompt exists and
 * the route sessionId matches, the execute function MUST dispatch the
 * generation using the intent's captured prompt — NOT silently drop because
 * the editor prop momentarily reported an empty string while the session
 * loader rehydrated.
 *
 * Bug captured: in Rerun #4, clicking Preview/Generate on a draft session
 * successfully created a persisted session and navigated to /session/<id>,
 * but no storyboard/draft render ever fired because:
 *   - the resume useEffect bailed out when outer `prompt` was empty, and
 *   - the executeStoryboardAction/executeDraftAction closures ignored the
 *     intent's captured prompt, using (empty) outer `prompt` instead.
 * User saw an empty session with span-labeled text and an empty gallery.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGenerationsRuntime } from "../useGenerationsRuntime";
import { clearPendingGenerationIntent } from "../../utils/pendingGenerationIntent";

const setControlsMock = vi.fn();
const generateDraftMock = vi.fn();
const generateRenderMock = vi.fn();
const generateStoryboardMock = vi.fn();
const saveToHistoryMock = vi.fn();
const navigateMock = vi.fn();
const setCurrentPromptDocIdMock = vi.fn();
const setCurrentPromptUuidMock = vi.fn();

let mockSessionId: string | undefined;
let mockCurrentPromptDocId: string | null;
let mockCurrentPromptUuid: string | null;
let mockPrompt = "A cinematic aerial shot of a lone astronaut";
let mockBalance = 100;

vi.mock("@/contexts/CreditBalanceContext", () => ({
  useCreditBalance: () => ({
    balance: mockBalance,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: () => ({ uid: "user-1" }),
}));

vi.mock("@components/Toast", () => ({
  useToast: () => ({
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("@/features/prompt-optimizer/context/PromptStateContext", () => ({
  usePromptNavigation: () => ({
    navigate: (...args: unknown[]) => navigateMock(...args),
    sessionId: mockSessionId,
  }),
  usePromptSession: () => ({
    currentPromptDocId: mockCurrentPromptDocId,
    currentPromptUuid: mockCurrentPromptUuid,
    setCurrentPromptDocId: (...args: unknown[]) =>
      setCurrentPromptDocIdMock(...args),
    setCurrentPromptUuid: (...args: unknown[]) =>
      setCurrentPromptUuidMock(...args),
  }),
  usePromptServices: () => ({
    promptHistory: {
      history: [
        {
          id: mockCurrentPromptDocId,
          uuid: mockCurrentPromptUuid,
          timestamp: new Date().toISOString(),
          title: null,
          input: mockPrompt,
          output: mockPrompt,
          score: null,
          mode: "video",
          targetModel: "sora-2",
          generationParams: null,
          keyframes: null,
          brainstormContext: null,
          highlightCache: null,
          versions: [],
        },
      ],
      saveToHistory: (...args: unknown[]) => saveToHistoryMock(...args),
    },
    promptOptimizer: {
      inputPrompt: mockPrompt,
      displayedPrompt: mockPrompt,
      optimizedPrompt: mockPrompt,
      qualityScore: null,
    },
  }),
}));

vi.mock("@/features/prompt-optimizer/context/WorkspaceSessionContext", () => ({
  useWorkspaceSession: () => ({
    session: null,
    isSequenceMode: false,
    hasActiveContinuityShot: false,
    isStartingSequence: false,
    startSequence: vi.fn(),
    currentShot: null,
    generateShot: vi.fn(),
    updateShot: vi.fn(),
  }),
}));

vi.mock(
  "@/features/prompt-optimizer/context/GenerationControlsContext",
  () => ({
    useGenerationControlsContext: () => ({
      setControls: setControlsMock,
      faceSwapPreview: null,
      onInsufficientCredits: null,
    }),
  }),
);

vi.mock("@features/generation-controls", () => ({
  useGenerationControlsStoreState: () => ({
    domain: {
      selectedModel: "sora-2",
      keyframes: [],
      startFrame: null,
      endFrame: null,
      videoReferenceImages: [],
      extendVideo: null,
      cameraMotion: null,
      subjectMotion: "",
    },
  }),
  useGenerationControlsStoreActions: () => ({
    setStartFrame: vi.fn(),
    clearStartFrame: vi.fn(),
    setExtendVideo: vi.fn(),
    clearExtendVideo: vi.fn(),
  }),
}));

vi.mock("@/features/prompt-optimizer/hooks/useCapabilities", () => ({
  useCapabilities: () => ({
    schema: {
      provider: "generic",
      model: "sora-2",
      version: "1",
      fields: {},
    },
    isLoading: false,
    error: null,
    target: { provider: "generic", model: "sora-2", label: "Sora 2" },
  }),
}));

vi.mock("@features/generations/hooks/useGenerationsState", () => ({
  useGenerationsState: () => ({
    generations: [],
    activeGenerationId: null,
    isGenerating: false,
    dispatch: vi.fn(),
    getLatestByTier: () => null,
    removeGeneration: vi.fn(),
    setActiveGeneration: vi.fn(),
    clearGenerations: vi.fn(),
  }),
}));

vi.mock("@features/generations/hooks/useGenerationActions", () => ({
  useGenerationActions: () => ({
    generateDraft: (...args: unknown[]) => generateDraftMock(...args),
    generateRender: (...args: unknown[]) => generateRenderMock(...args),
    generateStoryboard: (...args: unknown[]) => generateStoryboardMock(...args),
    retryGeneration: vi.fn(),
    cancelGeneration: vi.fn(),
    isSubmitting: false,
  }),
}));

vi.mock("@features/generations/hooks/useAssetReferenceImages", () => ({
  useAssetReferenceImages: () => ({ resolvedPrompt: null }),
}));

vi.mock("@features/generations/hooks/useGenerationMediaRefresh", () => ({
  useGenerationMediaRefresh: vi.fn(),
}));

vi.mock("@features/generations/hooks/useKeyframeWorkflow", () => ({
  useKeyframeWorkflow: () => ({
    keyframeStep: { isActive: false, character: null, pendingModel: null },
    selectedFrameUrl: null,
    handleRender: vi.fn(),
    handleApproveKeyframe: vi.fn(),
    handleSkipKeyframe: vi.fn(),
    handleSelectFrame: vi.fn(),
    handleClearSelectedFrame: vi.fn(),
  }),
}));

vi.mock("@features/generations/hooks/useGenerationsTimeline", () => ({
  useGenerationsTimeline: () => [],
}));

describe("regression: pending-intent resume survives transient empty prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPendingGenerationIntent();
    mockSessionId = undefined;
    mockCurrentPromptDocId = "draft-local";
    mockCurrentPromptUuid = "uuid-local";
    mockPrompt = "A cinematic aerial shot of a lone astronaut";
    mockBalance = 100;
    saveToHistoryMock.mockResolvedValue({
      id: "session-remote",
      uuid: "uuid-local",
    });
    navigateMock.mockImplementation((nextUrl: string) => {
      if (nextUrl === "/session/session-remote") {
        mockSessionId = "session-remote";
        mockCurrentPromptDocId = "session-remote";
      }
    });
    setCurrentPromptDocIdMock.mockImplementation((nextId: string) => {
      mockCurrentPromptDocId = nextId;
    });
    setCurrentPromptUuidMock.mockImplementation((nextUuid: string) => {
      mockCurrentPromptUuid = nextUuid;
    });
  });

  it("draft fires with the captured prompt when the editor prop briefly empties", async () => {
    const capturedPrompt = "A cinematic fox running through snow";
    mockPrompt = capturedPrompt;

    const { rerender } = renderHook(
      ({ prompt }) =>
        useGenerationsRuntime({
          prompt,
          promptVersionId: "version-1",
          aspectRatio: "16:9",
          duration: 8,
          versions: [],
          onCreateVersionIfNeeded: () => "version-1",
          presentation: "hero",
        }),
      { initialProps: { prompt: capturedPrompt } },
    );

    await waitFor(() => {
      expect(setControlsMock).toHaveBeenCalled();
    });

    const controlsPayload = setControlsMock.mock.calls.at(-1)?.[0] as
      | { onDraft?: (model: "wan-2.2") => void }
      | undefined;

    act(() => {
      controlsPayload?.onDraft?.("wan-2.2");
    });

    await waitFor(() => {
      expect(saveToHistoryMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith("/session/session-remote", {
        replace: true,
      });
    });

    // Editor transiently empty during session load.
    rerender({ prompt: "" });

    await waitFor(() => {
      expect(generateDraftMock).toHaveBeenCalledTimes(1);
    });

    // Draft MUST use the captured prompt from the intent, not the stale empty
    // outer prompt.
    expect(generateDraftMock).toHaveBeenCalledWith(
      "wan-2.2",
      capturedPrompt,
      expect.objectContaining({ promptVersionId: "version-1" }),
    );
  });
});
