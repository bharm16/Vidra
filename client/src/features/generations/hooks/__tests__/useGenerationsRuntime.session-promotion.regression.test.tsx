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
let mockPrompt = "A cinematic fox running through snow";
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
          targetModel: "wan-2.2",
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
      selectedModel: "wan-2.2",
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
      model: "wan-2.2",
      version: "1",
      fields: {},
    },
    isLoading: false,
    error: null,
    target: { provider: "generic", model: "wan-2.2", label: "Wan 2.2" },
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
    keyframeStep: {
      isActive: false,
      character: null,
      pendingModel: null,
    },
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

describe("regression: signed-in generation session promotion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPendingGenerationIntent();
    mockSessionId = undefined;
    mockCurrentPromptDocId = "draft-local";
    mockCurrentPromptUuid = "uuid-local";
    mockPrompt = "A cinematic fox running through snow";
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

  it("promotes the local draft to a remote session before dispatching draft generation", async () => {
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
      { initialProps: { prompt: mockPrompt } },
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

    expect(generateDraftMock).not.toHaveBeenCalled();

    rerender({ prompt: mockPrompt });

    await waitFor(() => {
      expect(generateDraftMock).toHaveBeenCalledTimes(1);
    });

    expect(generateDraftMock).toHaveBeenCalledWith(
      "wan-2.2",
      mockPrompt,
      expect.objectContaining({
        promptVersionId: "version-1",
      }),
    );
    expect(saveToHistoryMock).toHaveBeenCalledTimes(1);
  });

  // Regression: the resume effect used to require exact prompt equality
  // between the editor and the pending intent. The optimize pipeline rewrites
  // the prompt during session load, so that check could never hold once
  // rewriting was enabled — leaving the draft silently dropped. The resume
  // must now fire on session-id match as long as the editor has ANY prompt.
  it("resumes the pending draft after session load even when the prompt was rewritten mid-flight", async () => {
    const initialPrompt = "cinematic dragon flight";
    const rewrittenPrompt =
      "cinematic dragon flight — extended cinematic sequence with neon lighting";
    mockPrompt = initialPrompt;

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
      { initialProps: { prompt: initialPrompt } },
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

    expect(generateDraftMock).not.toHaveBeenCalled();

    // Simulate the optimizer rewriting the prompt during session load —
    // the editor now shows a different, longer prompt than the intent stored.
    rerender({ prompt: rewrittenPrompt });

    await waitFor(() => {
      expect(generateDraftMock).toHaveBeenCalledTimes(1);
    });

    expect(generateDraftMock).toHaveBeenCalledWith(
      "wan-2.2",
      rewrittenPrompt,
      expect.objectContaining({
        promptVersionId: "version-1",
      }),
    );
  });
});
