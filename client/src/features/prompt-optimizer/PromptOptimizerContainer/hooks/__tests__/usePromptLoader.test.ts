import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePromptLoader } from "../usePromptLoader";

const mockGetById = vi.hoisted(() => vi.fn());
const mockGetPromptRepositoryForUser = vi.hoisted(() =>
  vi.fn(() => ({
    getById: mockGetById,
  })),
);

vi.mock("@repositories/index", () => ({
  getPromptRepositoryForUser: mockGetPromptRepositoryForUser,
}));

type LoaderOverrides = Partial<Parameters<typeof usePromptLoader>[0]>;

const buildParams = (overrides: LoaderOverrides = {}) => {
  const baseToast = {
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  };

  return {
    sessionId: null,
    navigate: vi.fn(),
    toast: baseToast,
    user: { uid: "user-1" },
    historyEntries: [],
    createDraftEntry: vi.fn(() => ({ uuid: "draft-uuid", id: "draft-123" })),
    selectedMode: "video",
    selectedModelValue: "model-a",
    generationParamsValue: {},
    promptOptimizer: {
      displayedPrompt: "",
      setInputPrompt: vi.fn(),
      setOptimizedPrompt: vi.fn(),
      setDisplayedPrompt: vi.fn(),
      setGenericOptimizedPrompt: vi.fn(),
      setPreviewPrompt: vi.fn(),
      setPreviewAspectRatio: vi.fn(),
    },
    setDisplayedPromptSilently: vi.fn(),
    applyInitialHighlightSnapshot: vi.fn(),
    resetEditStacks: vi.fn(),
    resetVersionEdits: vi.fn(),
    setCurrentPromptDocId: vi.fn(),
    setCurrentPromptUuid: vi.fn(),
    setShowResults: vi.fn(),
    setSelectedMode: vi.fn(),
    setSelectedModel: vi.fn(),
    setGenerationParams: vi.fn(),
    upsertHistoryEntry: vi.fn(),
    setSuggestionsData: vi.fn(),
    setConceptElements: vi.fn(),
    setPromptContext: vi.fn(),
    onLoadKeyframes: vi.fn(),
    skipLoadFromUrlRef: { current: false },
    ...overrides,
  };
};

describe("usePromptLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates draft routes from in-memory history without remote fetches", async () => {
    const params = buildParams({
      sessionId: "draft-123",
      historyEntries: [
        {
          id: "draft-123",
          uuid: "draft-uuid",
          input: "local input",
          output: "local output",
          mode: "video",
          targetModel: "model-a",
          generationParams: { duration: 8 },
          keyframes: [],
          brainstormContext: null,
          highlightCache: null,
          versions: [],
        },
      ],
    });

    const { result } = renderHook(() => usePromptLoader(params));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetPromptRepositoryForUser).not.toHaveBeenCalled();
    expect(params.setCurrentPromptUuid).toHaveBeenCalledWith("draft-uuid");
    expect(params.setCurrentPromptDocId).toHaveBeenCalledWith("draft-123");
    expect(params.setShowResults).toHaveBeenCalledWith(true);
    expect(params.navigate).not.toHaveBeenCalled();
    expect(params.toast.error).not.toHaveBeenCalled();
  });

  it("bootstraps a missing draft route locally without redirecting or toasting", async () => {
    mockGetById.mockResolvedValue(null);
    const params = buildParams({ sessionId: "draft-123" });

    const { result } = renderHook(() => usePromptLoader(params));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetPromptRepositoryForUser).toHaveBeenCalledWith(false);
    expect(mockGetById).toHaveBeenCalledWith("draft-123");
    expect(params.createDraftEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "draft-123",
        mode: "video",
        targetModel: "model-a",
        generationParams: {},
        persist: false,
      }),
    );
    expect(params.setCurrentPromptUuid).toHaveBeenCalledWith("draft-uuid");
    expect(params.setCurrentPromptDocId).toHaveBeenCalledWith("draft-123");
    expect(params.setShowResults).toHaveBeenCalledWith(false);
    expect(params.navigate).not.toHaveBeenCalled();
    expect(params.toast.error).not.toHaveBeenCalled();
  });

  it("dedupes failed fetch attempts for the same session key across rerenders", async () => {
    mockGetById.mockRejectedValue(new Error("Session not found"));
    const params = buildParams({ sessionId: "session-1" });
    let onLoadKeyframes = vi.fn();

    const { rerender } = renderHook(() =>
      usePromptLoader({
        ...params,
        onLoadKeyframes,
      }),
    );

    await waitFor(() => {
      expect(mockGetById).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(params.navigate).toHaveBeenCalledWith("/", { replace: true });
    });

    onLoadKeyframes = vi.fn();
    rerender();

    await waitFor(() => {
      expect(mockGetById).toHaveBeenCalledTimes(1);
    });
    expect(params.navigate).toHaveBeenCalledTimes(1);
  });

  it("hands the reopened session's persisted first-frame identity to the keyframe selection unchanged (issue #136)", async () => {
    // A handoff session, reopened after the URL on the accepted frame has
    // expired. The persisted keyframes[0] IS the accepted picture's identity
    // — generationId plus durable handle — and the loader's only job is to
    // pass it through to the selection step untouched.
    const persistedKeyframes = [
      {
        id: "take-accepted",
        url: "https://storage.example.com/asset-accepted?sig=expired",
        source: "generation",
        assetId: "asset-accepted",
        storagePath: "image-previews/user-1/asset-accepted",
        generationId: "take-accepted",
        sourcePrompt: "an ergonomic desk lamp glowing",
      },
    ];
    mockGetById.mockResolvedValue({
      id: "session-1",
      uuid: "uuid-1",
      input: "an ergonomic desk lamp glowing",
      output: "an ergonomic desk lamp glowing",
      keyframes: persistedKeyframes,
      versions: [
        {
          versionId: "v-root",
          prompt: "an ergonomic desk lamp glowing",
          timestamp: "2026-09-17T00:00:00.000Z",
          generations: [{ id: "take-accepted", mediaType: "image" }],
        },
      ],
    });
    const onLoadKeyframes = vi.fn();
    const params = buildParams({ sessionId: "session-1" });

    renderHook(() =>
      usePromptLoader({
        ...params,
        user: { uid: "user-1" },
        onLoadKeyframes,
      }),
    );

    await waitFor(() => {
      expect(onLoadKeyframes).toHaveBeenCalledWith(persistedKeyframes);
    });
  });
});
