/**
 * Regression: entering "/" without a session must clear the working
 * IDENTITY, not just the prompt text.
 *
 * The no-session branch cleared prompts, suggestions and generation state
 * (po:workspace-reset) but left currentPromptUuid/currentPromptDocId
 * pointing at the last session. Every identity-driven surface then kept
 * resolving that session: its versions fed the gallery, its lineage
 * rendered on the fresh canvas, and downstream code needed proxy guards
 * (e.g. "skip version entries while runtime is empty") that broke the
 * legitimate hydrated-session gallery as collateral.
 *
 * Invariant: no sessionId in the URL → the working identity is null.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePromptLoader } from "../usePromptLoader";

const mockGetById = vi.hoisted(() => vi.fn());
vi.mock("@repositories/index", () => ({
  getPromptRepositoryForUser: vi.fn(() => ({ getById: mockGetById })),
}));

type LoaderOverrides = Partial<Parameters<typeof usePromptLoader>[0]>;

const buildParams = (overrides: LoaderOverrides = {}) => ({
  sessionId: null,
  navigate: vi.fn(),
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
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
});

describe("regression: working identity is cleared on /", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("nulls currentPromptUuid and currentPromptDocId when no session is in the URL", async () => {
    const params = buildParams({ sessionId: null });

    renderHook(() =>
      usePromptLoader(params as Parameters<typeof usePromptLoader>[0]),
    );

    await waitFor(() => {
      expect(params.setCurrentPromptUuid).toHaveBeenCalledWith(null);
      expect(params.setCurrentPromptDocId).toHaveBeenCalledWith(null);
    });
  });
});
