import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { NavigateOptions, To } from "react-router-dom";

import {
  usePromptOptimization,
  type UsePromptOptimizationParams,
} from "@features/prompt-optimizer/PromptOptimizerContainer/hooks/usePromptOptimization";
import { PromptContext } from "@/utils/PromptContext/PromptContext";
import type { CapabilityValues } from "@shared/capabilities";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import { createHighlightSignature } from "@features/span-highlighting";

vi.mock("@features/span-highlighting", () => ({
  createHighlightSignature: vi.fn(),
}));

const mockCreateHighlightSignature = vi.mocked(createHighlightSignature);

type PromptOptimizer = UsePromptOptimizationParams["promptOptimizer"] & {
  qualityScore?: number | null;
};
type PromptHistory = UsePromptOptimizationParams["promptHistory"];

type SetCurrentPromptUuid = UsePromptOptimizationParams["setCurrentPromptUuid"];
type SetCurrentPromptDocId =
  UsePromptOptimizationParams["setCurrentPromptDocId"];
type SetDisplayedPromptSilently =
  UsePromptOptimizationParams["setDisplayedPromptSilently"];
type SetShowResults = UsePromptOptimizationParams["setShowResults"];
type ApplyInitialHighlightSnapshot =
  UsePromptOptimizationParams["applyInitialHighlightSnapshot"];
type ResetEditStacks = UsePromptOptimizationParams["resetEditStacks"];
type Navigate = UsePromptOptimizationParams["navigate"];

type OptimizationResult = Awaited<ReturnType<PromptOptimizer["optimize"]>>;

type CompileResult = Awaited<ReturnType<PromptOptimizer["compile"]>>;

const createPromptOptimizer = (
  overrides: Partial<PromptOptimizer> = {},
): PromptOptimizer => {
  const optimize: MockedFunction<PromptOptimizer["optimize"]> = vi.fn();
  const compile: MockedFunction<PromptOptimizer["compile"]> = vi.fn();

  return {
    inputPrompt: "Original prompt",
    genericOptimizedPrompt: null,
    qualityScore: null,
    improvementContext: { source: "improvement" },
    optimize,
    compile,
    ...overrides,
  };
};

const createPromptHistory = (
  overrides: Partial<PromptHistory> = {},
): PromptHistory => {
  const saveToHistory: MockedFunction<PromptHistory["saveToHistory"]> = vi.fn();
  const updateEntryVersions: MockedFunction<
    PromptHistory["updateEntryVersions"]
  > = vi.fn();

  return {
    history: [],
    updateEntryVersions,
    saveToHistory,
    ...overrides,
  };
};

const createSetters = () => {
  const setCurrentPromptUuid: MockedFunction<SetCurrentPromptUuid> = vi.fn();
  const setCurrentPromptDocId: MockedFunction<SetCurrentPromptDocId> = vi.fn();
  const setDisplayedPromptSilently: MockedFunction<SetDisplayedPromptSilently> =
    vi.fn();
  const setShowResults: MockedFunction<SetShowResults> = vi.fn();
  const applyInitialHighlightSnapshot: MockedFunction<ApplyInitialHighlightSnapshot> =
    vi.fn();
  const resetEditStacks: MockedFunction<ResetEditStacks> = vi.fn();
  const navigateMock = vi.fn();
  const navigate: Navigate = (to: To | number, options?: NavigateOptions) => {
    if (typeof to === "number") {
      navigateMock(to);
      return;
    }
    navigateMock(to, options);
  };

  return {
    setCurrentPromptUuid,
    setCurrentPromptDocId,
    setDisplayedPromptSilently,
    setShowResults,
    applyInitialHighlightSnapshot,
    resetEditStacks,
    navigate,
    navigateMock,
  };
};

describe("usePromptOptimization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    mockCreateHighlightSignature.mockReturnValue("signature-new");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("optimizes prompt, saves history, and updates state", async () => {
    const promptOptimizer = createPromptOptimizer();
    const promptHistory = createPromptHistory();
    const generationParams: CapabilityValues = { steps: 12 };
    const promptContext = new PromptContext(
      { subject: "cat" },
      { format: "detailed" },
    );
    const serializedContext = promptContext.toJSON();
    const setters = createSetters();

    const optimizeResult: OptimizationResult = {
      optimized: "Shot description",
      score: 91,
    };

    const mockOptimize = promptOptimizer.optimize as MockedFunction<
      PromptOptimizer["optimize"]
    >;
    const mockSaveToHistory = promptHistory.saveToHistory as MockedFunction<
      PromptHistory["saveToHistory"]
    >;

    mockOptimize.mockResolvedValue(optimizeResult);
    mockSaveToHistory.mockResolvedValue({ uuid: "uuid-1", id: "doc-1" });

    const persistedSignatureRef = { current: "old-signature" };
    const skipLoadFromUrlRef = { current: false };

    const { result } = renderHook(() =>
      usePromptOptimization({
        promptOptimizer,
        promptHistory,
        promptContext,
        selectedMode: "video",
        selectedModel: "model-a",
        generationParams,
        currentPromptUuid: "existing-uuid",
        setCurrentPromptUuid: setters.setCurrentPromptUuid,
        setCurrentPromptDocId: setters.setCurrentPromptDocId,
        setDisplayedPromptSilently: setters.setDisplayedPromptSilently,
        setShowResults: setters.setShowResults,
        applyInitialHighlightSnapshot: setters.applyInitialHighlightSnapshot,
        resetEditStacks: setters.resetEditStacks,
        persistedSignatureRef,
        skipLoadFromUrlRef,
        navigate: setters.navigate,
      }),
    );

    await act(async () => {
      await result.current.handleOptimize();
    });

    expect(mockOptimize).toHaveBeenCalledWith(
      "Original prompt",
      { source: "improvement" },
      {
        elements: serializedContext.elements,
        metadata: serializedContext.metadata,
      },
      "model-a",
      expect.objectContaining({
        generationParams,
      }),
    );

    expect(mockSaveToHistory).toHaveBeenCalledWith(
      "Original prompt",
      "Shot description",
      91,
      "video",
      "model-a",
      generationParams,
      null,
      serializedContext,
      null,
      "existing-uuid",
    );

    expect(setters.setShowResults).toHaveBeenCalledWith(true);
    // The clear-before-set pattern moved into the reducer
    // (START_OPTIMIZATION now zeros displayedPrompt), so the setter is only
    // called once with the final optimized value.
    expect(setters.setDisplayedPromptSilently).toHaveBeenCalledWith(
      "Shot description",
    );
    expect(setters.applyInitialHighlightSnapshot).toHaveBeenCalledWith(null, {
      bumpVersion: true,
      markPersisted: false,
    });
    expect(setters.resetEditStacks).toHaveBeenCalled();
    expect(setters.setCurrentPromptUuid).toHaveBeenCalledWith("uuid-1");
    expect(setters.setCurrentPromptDocId).toHaveBeenCalledWith("doc-1");
    expect(setters.navigateMock).toHaveBeenCalledWith("/session/doc-1", {
      replace: true,
    });
    expect(skipLoadFromUrlRef.current).toBe(true);
    expect(persistedSignatureRef.current).toBeNull();
  });

  it("uses compile when compileOnly is set", async () => {
    const promptOptimizer = createPromptOptimizer({
      inputPrompt: "Original",
      genericOptimizedPrompt: "Generic compile prompt",
    });
    const promptHistory = createPromptHistory();
    const setters = createSetters();

    const compileResult: CompileResult = {
      optimized: "Compiled result",
      score: null,
    };

    const mockCompile = promptOptimizer.compile as MockedFunction<
      PromptOptimizer["compile"]
    >;
    const mockOptimize = promptOptimizer.optimize as MockedFunction<
      PromptOptimizer["optimize"]
    >;
    const mockSaveToHistory = promptHistory.saveToHistory as MockedFunction<
      PromptHistory["saveToHistory"]
    >;

    mockCompile.mockResolvedValue(compileResult);
    mockSaveToHistory.mockResolvedValue({ uuid: "uuid-2", id: "doc-2" });

    const persistedSignatureRef = { current: null };
    const skipLoadFromUrlRef = { current: false };

    const { result } = renderHook(() =>
      usePromptOptimization({
        promptOptimizer,
        promptHistory,
        promptContext: null,
        selectedMode: "video",
        selectedModel: "model-b",
        generationParams: {},
        currentPromptUuid: null,
        setCurrentPromptUuid: setters.setCurrentPromptUuid,
        setCurrentPromptDocId: setters.setCurrentPromptDocId,
        setDisplayedPromptSilently: setters.setDisplayedPromptSilently,
        setShowResults: setters.setShowResults,
        applyInitialHighlightSnapshot: setters.applyInitialHighlightSnapshot,
        resetEditStacks: setters.resetEditStacks,
        persistedSignatureRef,
        skipLoadFromUrlRef,
        navigate: setters.navigate,
      }),
    );

    await act(async () => {
      await result.current.handleOptimize(undefined, undefined, {
        compileOnly: true,
        targetModel: "model-b",
      });
    });

    expect(mockCompile).toHaveBeenCalledWith(
      "Generic compile prompt",
      "model-b",
      { source: "improvement" },
    );
    expect(mockOptimize).not.toHaveBeenCalled();
    expect(mockSaveToHistory).toHaveBeenCalledWith(
      "Original",
      "Compiled result",
      null,
      "video",
      "model-b",
      {},
      null,
      null,
      null,
      null,
    );
  });

  it("uses generic compile output when compileOnly has no target model", async () => {
    const promptOptimizer = createPromptOptimizer({
      inputPrompt: "Original",
      genericOptimizedPrompt: "Generic compile prompt",
      qualityScore: 88,
    });
    const promptHistory = createPromptHistory();
    const setters = createSetters();

    const mockCompile = promptOptimizer.compile as MockedFunction<
      PromptOptimizer["compile"]
    >;
    const mockOptimize = promptOptimizer.optimize as MockedFunction<
      PromptOptimizer["optimize"]
    >;
    const mockSaveToHistory = promptHistory.saveToHistory as MockedFunction<
      PromptHistory["saveToHistory"]
    >;
    mockSaveToHistory.mockResolvedValue({ uuid: "uuid-2b", id: "doc-2b" });

    const persistedSignatureRef = { current: null };
    const skipLoadFromUrlRef = { current: false };

    const { result } = renderHook(() =>
      usePromptOptimization({
        promptOptimizer,
        promptHistory,
        promptContext: null,
        selectedMode: "video",
        selectedModel: "veo",
        generationParams: {},
        currentPromptUuid: null,
        setCurrentPromptUuid: setters.setCurrentPromptUuid,
        setCurrentPromptDocId: setters.setCurrentPromptDocId,
        setDisplayedPromptSilently: setters.setDisplayedPromptSilently,
        setShowResults: setters.setShowResults,
        applyInitialHighlightSnapshot: setters.applyInitialHighlightSnapshot,
        resetEditStacks: setters.resetEditStacks,
        persistedSignatureRef,
        skipLoadFromUrlRef,
        navigate: setters.navigate,
      }),
    );

    await act(async () => {
      await result.current.handleOptimize(undefined, undefined, {
        compileOnly: true,
      });
    });

    expect(mockCompile).not.toHaveBeenCalled();
    expect(mockOptimize).not.toHaveBeenCalled();
    expect(mockSaveToHistory).toHaveBeenCalledWith(
      "Original",
      "Generic compile prompt",
      88,
      "video",
      null,
      {},
      null,
      null,
      null,
      null,
    );
    expect(setters.setDisplayedPromptSilently).toHaveBeenCalledWith(
      "Generic compile prompt",
    );
  });

  it("forces model-agnostic optimization when forceGenericTarget is enabled", async () => {
    const promptOptimizer = createPromptOptimizer({
      inputPrompt: "Original generic",
      improvementContext: { source: "ctx" },
    });
    const promptHistory = createPromptHistory();
    const setters = createSetters();

    const mockOptimize = promptOptimizer.optimize as MockedFunction<
      PromptOptimizer["optimize"]
    >;
    const mockSaveToHistory = promptHistory.saveToHistory as MockedFunction<
      PromptHistory["saveToHistory"]
    >;
    mockOptimize.mockResolvedValue({
      optimized: "Generic optimized output",
      score: 73,
    });
    mockSaveToHistory.mockResolvedValue({
      uuid: "uuid-generic",
      id: "doc-generic",
    });

    const { result } = renderHook(() =>
      usePromptOptimization({
        promptOptimizer,
        promptHistory,
        promptContext: null,
        selectedMode: "video",
        selectedModel: "veo-4",
        generationParams: {},
        currentPromptUuid: null,
        setCurrentPromptUuid: setters.setCurrentPromptUuid,
        setCurrentPromptDocId: setters.setCurrentPromptDocId,
        setDisplayedPromptSilently: setters.setDisplayedPromptSilently,
        setShowResults: setters.setShowResults,
        applyInitialHighlightSnapshot: setters.applyInitialHighlightSnapshot,
        resetEditStacks: setters.resetEditStacks,
        persistedSignatureRef: { current: null },
        skipLoadFromUrlRef: { current: false },
        navigate: setters.navigate,
      }),
    );

    await act(async () => {
      await result.current.handleOptimize(undefined, undefined, {
        forceGenericTarget: true,
      });
    });

    expect(mockOptimize).toHaveBeenCalledWith(
      "Original generic",
      { source: "ctx" },
      null,
      undefined,
      expect.any(Object),
    );
    expect(mockSaveToHistory).toHaveBeenCalledWith(
      "Original generic",
      "Generic optimized output",
      73,
      "video",
      null,
      {},
      null,
      null,
      null,
      null,
    );
  });

  it("accepts optimization options passed as the second argument", async () => {
    const promptOptimizer = createPromptOptimizer({
      inputPrompt: "Original",
      genericOptimizedPrompt: "Generic compile prompt",
    });
    const promptHistory = createPromptHistory();
    const setters = createSetters();

    const mockCompile = promptOptimizer.compile as MockedFunction<
      PromptOptimizer["compile"]
    >;
    const mockOptimize = promptOptimizer.optimize as MockedFunction<
      PromptOptimizer["optimize"]
    >;
    const mockSaveToHistory = promptHistory.saveToHistory as MockedFunction<
      PromptHistory["saveToHistory"]
    >;

    mockCompile.mockResolvedValue({
      optimized: "Runway compiled",
      score: null,
    });
    mockSaveToHistory.mockResolvedValue({
      uuid: "uuid-opts2",
      id: "doc-opts2",
    });

    const { result } = renderHook(() =>
      usePromptOptimization({
        promptOptimizer,
        promptHistory,
        promptContext: null,
        selectedMode: "video",
        selectedModel: "veo-4",
        generationParams: {},
        currentPromptUuid: null,
        setCurrentPromptUuid: setters.setCurrentPromptUuid,
        setCurrentPromptDocId: setters.setCurrentPromptDocId,
        setDisplayedPromptSilently: setters.setDisplayedPromptSilently,
        setShowResults: setters.setShowResults,
        applyInitialHighlightSnapshot: setters.applyInitialHighlightSnapshot,
        resetEditStacks: setters.resetEditStacks,
        persistedSignatureRef: { current: null },
        skipLoadFromUrlRef: { current: false },
        navigate: setters.navigate,
      }),
    );

    await act(async () => {
      await result.current.handleOptimize(undefined, {
        compileOnly: true,
        targetModel: "runway-gen45",
      });
    });

    expect(mockCompile).toHaveBeenCalledWith(
      "Generic compile prompt",
      "runway-gen45",
      { source: "improvement" },
    );
    expect(mockOptimize).not.toHaveBeenCalled();
  });

  it("creates a new version entry when requested", async () => {
    const existingVersions: PromptVersionEntry[] = [
      {
        versionId: "v-1",
        label: "v1",
        signature: "signature-old",
        prompt: "Old prompt",
        timestamp: "2023-01-01T00:00:00.000Z",
      },
    ];

    const historyEntry: PromptHistoryEntry = {
      uuid: "uuid-3",
      input: "Input",
      output: "Output",
      versions: existingVersions,
    };

    const promptOptimizer = createPromptOptimizer();
    const promptHistory = createPromptHistory({ history: [historyEntry] });
    const setters = createSetters();

    const mockOptimize = promptOptimizer.optimize as MockedFunction<
      PromptOptimizer["optimize"]
    >;
    const mockSaveToHistory = promptHistory.saveToHistory as MockedFunction<
      PromptHistory["saveToHistory"]
    >;
    const mockUpdateEntryVersions =
      promptHistory.updateEntryVersions as MockedFunction<
        PromptHistory["updateEntryVersions"]
      >;

    mockOptimize.mockResolvedValue({ optimized: "Next prompt", score: 77 });
    mockSaveToHistory.mockResolvedValue({ uuid: "uuid-3", id: "doc-3" });

    const { result } = renderHook(() =>
      usePromptOptimization({
        promptOptimizer,
        promptHistory,
        promptContext: null,
        selectedMode: "text",
        generationParams: {},
        currentPromptUuid: "uuid-3",
        setCurrentPromptUuid: setters.setCurrentPromptUuid,
        setCurrentPromptDocId: setters.setCurrentPromptDocId,
        setDisplayedPromptSilently: setters.setDisplayedPromptSilently,
        setShowResults: setters.setShowResults,
        applyInitialHighlightSnapshot: setters.applyInitialHighlightSnapshot,
        resetEditStacks: setters.resetEditStacks,
        persistedSignatureRef: { current: null },
        skipLoadFromUrlRef: { current: false },
        navigate: setters.navigate,
      }),
    );

    await act(async () => {
      await result.current.handleOptimize(undefined, undefined, {
        createVersion: true,
      });
    });

    expect(mockUpdateEntryVersions).toHaveBeenCalledWith(
      "uuid-3",
      "doc-3",
      expect.arrayContaining([
        existingVersions[0],
        expect.objectContaining({
          label: "v2",
          signature: "signature-new",
          prompt: "Next prompt",
          versionId: expect.stringMatching(/^v-1704067200000-/),
        }),
      ]),
    );
  });
});
