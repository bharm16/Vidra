import { act, renderHook } from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from "vitest";

import { useHighlightsPersistence } from "@features/prompt-optimizer/PromptOptimizerContainer/hooks/useHighlightsPersistence";
import type { SpanLabelingResult } from "@features/span-highlighting/hooks/types";
import type { Toast } from "@hooks/types";
import { getPromptRepository } from "@repositories/index";

const { logSpies } = vi.hoisted(() => ({
  logSpies: {
    warn: vi.fn(),
  },
}));

vi.mock("@repositories/index", () => ({
  getPromptRepository: vi.fn(),
}));

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => logSpies,
  },
}));

const mockGetPromptRepository = vi.mocked(getPromptRepository);

type UseHighlightsPersistenceParams = Parameters<
  typeof useHighlightsPersistence
>[0];

type ApplyInitialHighlightSnapshot =
  UseHighlightsPersistenceParams["applyInitialHighlightSnapshot"];

type UpdateEntryHighlight =
  UseHighlightsPersistenceParams["promptHistory"]["updateEntryHighlight"];

type PromptRepositoryInstance = ReturnType<typeof getPromptRepository>;
type UpdateHighlights = PromptRepositoryInstance["updateHighlights"];

const createToast = (): Toast => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
});

const createDefaults = (
  overrides: Partial<UseHighlightsPersistenceParams> = {},
): UseHighlightsPersistenceParams => {
  const applyInitialHighlightSnapshot: MockedFunction<ApplyInitialHighlightSnapshot> =
    vi.fn();
  const updateEntryHighlight: MockedFunction<UpdateEntryHighlight> = vi.fn();

  return {
    currentPromptUuid: "uuid-1",
    currentPromptDocId: "doc-1",
    user: { uid: "user-1" },
    toast: createToast(),
    applyInitialHighlightSnapshot,
    promptHistory: { updateEntryHighlight },
    latestHighlightRef: { current: null },
    persistedSignatureRef: { current: null },
    ...overrides,
  };
};

const createResult = (
  overrides: Partial<SpanLabelingResult> = {},
): SpanLabelingResult => ({
  spans: [{ start: 0, end: 3, category: "style", confidence: 0.9 }],
  meta: { source: "test" },
  text: "Prompt text",
  signature: "sig-default",
  cacheId: "uuid-1",
  source: "network",
  ...overrides,
});

describe("useHighlightsPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates local state and persists network highlights", async () => {
    const updateHighlights: MockedFunction<UpdateHighlights> = vi.fn();
    mockGetPromptRepository.mockReturnValue({
      updateHighlights,
    } as unknown as PromptRepositoryInstance);

    const params = createDefaults();

    const { result } = renderHook(() => useHighlightsPersistence(params));

    const input = createResult({
      signature: "sig-1",
      cacheId: "uuid-1",
    });

    await act(async () => {
      await result.current.handleHighlightsPersist(input);
    });

    expect(params.latestHighlightRef.current).toEqual(
      expect.objectContaining({
        signature: "sig-1",
        cacheId: "uuid-1",
      }),
    );

    expect(params.applyInitialHighlightSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ signature: "sig-1" }),
      { bumpVersion: false, markPersisted: false },
    );

    expect(params.promptHistory.updateEntryHighlight).toHaveBeenCalledWith(
      "uuid-1",
      expect.objectContaining({ signature: "sig-1" }),
    );
    expect(updateHighlights).toHaveBeenCalledWith("doc-1", {
      highlightCache: expect.objectContaining({ signature: "sig-1" }),
    });
    expect(params.persistedSignatureRef.current).toBe("sig-1");
  });

  it("skips remote persistence when signature is already saved", async () => {
    const updateHighlights: MockedFunction<UpdateHighlights> = vi.fn();
    mockGetPromptRepository.mockReturnValue({
      updateHighlights,
    } as unknown as PromptRepositoryInstance);

    const params = createDefaults({
      persistedSignatureRef: { current: "sig-2" },
    });

    const { result } = renderHook(() => useHighlightsPersistence(params));

    await act(async () => {
      await result.current.handleHighlightsPersist(
        createResult({
          spans: [{ start: 1, end: 2, category: "style", confidence: 0.7 }],
          text: "Prompt text",
          signature: "sig-2",
          source: "network",
        }),
      );
    });

    expect(params.promptHistory.updateEntryHighlight).toHaveBeenCalled();
    expect(updateHighlights).not.toHaveBeenCalled();
  });

  it("warns when persistence is denied", async () => {
    const updateHighlights: MockedFunction<UpdateHighlights> = vi.fn();

    const error = new Error("Permission denied") as Error & { code?: string };
    error.code = "permission-denied";

    updateHighlights.mockRejectedValue(error);

    mockGetPromptRepository.mockReturnValue({
      updateHighlights,
    } as unknown as PromptRepositoryInstance);

    const params = createDefaults();

    const { result } = renderHook(() => useHighlightsPersistence(params));

    await act(async () => {
      await result.current.handleHighlightsPersist(
        createResult({
          spans: [{ start: 0, end: 2, category: "style", confidence: 0.5 }],
          text: "Prompt text",
          signature: "sig-3",
          source: "network",
        }),
      );
    });

    expect(params.toast.warning).toHaveBeenCalledWith(
      "Unable to save highlights. You may need to sign in.",
    );
    expect(logSpies.warn).toHaveBeenCalled();
  });
});
