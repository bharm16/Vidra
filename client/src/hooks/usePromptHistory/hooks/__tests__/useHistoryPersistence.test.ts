import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
  Toast,
  User,
} from "@hooks/usePromptHistory/types";

const {
  mockLoadFromFirestore,
  mockLoadFromLocalStorage,
  mockSyncToLocalStorage,
  mockSaveEntry,
  mockUpdateHighlights,
  mockUpdateOutput,
  mockUpdateVersions,
  mockUpdatePrompt,
  mockDeleteEntry,
  mockClearAll,
  mockUuid,
  mockEnforceImmutableKeyframes,
  mockEnforceImmutableVersions,
} = vi.hoisted(() => ({
  mockLoadFromFirestore: vi.fn(),
  mockLoadFromLocalStorage: vi.fn(),
  mockSyncToLocalStorage: vi.fn(),
  mockSaveEntry: vi.fn(),
  mockUpdateHighlights: vi.fn(),
  mockUpdateOutput: vi.fn(),
  mockUpdateVersions: vi.fn(),
  mockUpdatePrompt: vi.fn(),
  mockDeleteEntry: vi.fn(),
  mockClearAll: vi.fn(),
  mockUuid: vi.fn().mockReturnValue("generated-uuid-1"),
  mockEnforceImmutableKeyframes: vi
    .fn()
    .mockImplementation((_existing, next) => ({
      keyframes: next,
      warnings: [],
    })),
  mockEnforceImmutableVersions: vi
    .fn()
    .mockImplementation((_existing, next) => ({
      versions: next,
      warnings: [],
    })),
}));

vi.mock("../../api", () => ({
  loadFromFirestore: mockLoadFromFirestore,
  loadFromLocalStorage: mockLoadFromLocalStorage,
  syncToLocalStorage: mockSyncToLocalStorage,
  saveEntry: mockSaveEntry,
  updateHighlights: mockUpdateHighlights,
  updateOutput: mockUpdateOutput,
  updateVersions: mockUpdateVersions,
  updatePrompt: mockUpdatePrompt,
  deleteEntry: mockDeleteEntry,
  clearAll: mockClearAll,
}));

vi.mock("uuid", () => ({
  v4: mockUuid,
}));

vi.mock("../../utils/immutableMedia", () => ({
  enforceImmutableKeyframes: mockEnforceImmutableKeyframes,
  enforceImmutableVersions: mockEnforceImmutableVersions,
}));

vi.mock("../../../../services/LoggingService", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { useHistoryPersistence } from "../useHistoryPersistence";

const baseEntry: PromptHistoryEntry = {
  id: "doc-1",
  uuid: "uuid-1",
  timestamp: "2025-01-01T00:00:00.000Z",
  title: null,
  input: "input",
  output: "output",
  score: null,
  mode: "video",
  targetModel: null,
  generationParams: null,
  keyframes: null,
  brainstormContext: null,
  highlightCache: null,
  versions: [],
};

const createToast = (): Toast => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
});

function createHookOptions(
  overrides: Partial<Parameters<typeof useHistoryPersistence>[0]> = {},
) {
  const toast = createToast();

  return {
    user: null as User | null,
    history: [] as PromptHistoryEntry[],
    isLoadingHistory: false,
    setHistory: vi.fn(),
    addEntry: vi.fn(),
    updateEntry: vi.fn(),
    removeEntry: vi.fn(),
    clearEntries: vi.fn(),
    setIsLoadingHistory: vi.fn(),
    toast,
    ...overrides,
  };
}

describe("useHistoryPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockLoadFromLocalStorage.mockResolvedValue([]);
    mockSyncToLocalStorage.mockReturnValue({ success: true, trimmed: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads firestore history, syncs local storage, and warns on trim", async () => {
    const toast = createToast();
    const setHistory = vi.fn();
    const setIsLoadingHistory = vi.fn();

    mockLoadFromFirestore.mockResolvedValue([baseEntry]);
    mockSyncToLocalStorage.mockReturnValue({ success: true, trimmed: true });

    const { result } = renderHook(() =>
      useHistoryPersistence(
        createHookOptions({
          user: { uid: "user-1" },
          toast,
          setHistory,
          setIsLoadingHistory,
        }),
      ),
    );

    await act(async () => {
      await result.current.loadHistoryFromFirestore("user-1");
    });

    expect(setIsLoadingHistory).toHaveBeenNthCalledWith(1, true);
    expect(setHistory).toHaveBeenCalledWith([baseEntry]);
    expect(mockSyncToLocalStorage).toHaveBeenCalledWith([baseEntry]);
    expect(toast.warning).toHaveBeenCalledWith(
      "Storage limit reached. Keeping only recent 50 items.",
    );
    expect(setIsLoadingHistory).toHaveBeenLastCalledWith(false);
  });

  it("merges remote history with local draft-only entries and collapses promoted duplicates by uuid", async () => {
    const setHistory = vi.fn();
    const remoteEntry: PromptHistoryEntry = {
      ...baseEntry,
      id: "session-remote",
      uuid: "uuid-shared",
      timestamp: "2025-01-02T00:00:00.000Z",
      input: "",
      generationParams: null,
      keyframes: null,
      brainstormContext: null,
      highlightCache: null,
      versions: [],
    };
    const localPromotedDraft: PromptHistoryEntry = {
      ...baseEntry,
      id: "draft-1",
      uuid: "uuid-shared",
      timestamp: "2025-01-03T00:00:00.000Z",
      input: "local draft input",
      generationParams: { duration: 8 },
      keyframes: [{ id: "kf-1", url: "https://example.com/frame.png" }],
      brainstormContext: { topic: "city" },
      highlightCache: { signature: "sig-local" },
      versions: [
        {
          versionId: "v1",
          signature: "sig-v1",
          prompt: "prompt",
          timestamp: "2025-01-03T00:00:00.000Z",
        },
      ],
    };
    const localOnlyDraft: PromptHistoryEntry = {
      ...baseEntry,
      id: "draft-2",
      uuid: "uuid-local-only",
      timestamp: "2025-01-04T00:00:00.000Z",
      input: "keep me local",
      output: "",
    };

    mockLoadFromFirestore.mockResolvedValue([remoteEntry]);
    mockLoadFromLocalStorage.mockResolvedValue([
      localPromotedDraft,
      localOnlyDraft,
    ]);

    const { result } = renderHook(() =>
      useHistoryPersistence(
        createHookOptions({
          user: { uid: "user-1" },
          setHistory,
        }),
      ),
    );

    await act(async () => {
      await result.current.loadHistoryFromFirestore("user-1");
    });

    const mergedEntries = setHistory.mock.calls.at(
      -1,
    )?.[0] as PromptHistoryEntry[];
    expect(mergedEntries).toHaveLength(2);
    expect(mergedEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "session-remote",
          uuid: "uuid-shared",
          input: "local draft input",
          generationParams: { duration: 8 },
          keyframes: [{ id: "kf-1", url: "https://example.com/frame.png" }],
          brainstormContext: { topic: "city" },
          highlightCache: { signature: "sig-local" },
          versions: [
            expect.objectContaining({
              versionId: "v1",
              signature: "sig-v1",
            }),
          ],
        }),
        expect.objectContaining({
          id: "draft-2",
          uuid: "uuid-local-only",
          input: "keep me local",
        }),
      ]),
    );
    expect(
      mergedEntries.find((entry) => entry.id === "draft-1"),
    ).toBeUndefined();
    expect(mockSyncToLocalStorage).toHaveBeenCalledWith(mergedEntries);
  });

  it("falls back to localStorage when firestore load fails", async () => {
    const setHistory = vi.fn();
    const setIsLoadingHistory = vi.fn();
    const localEntries = [{ ...baseEntry, id: "local-1", uuid: "local-uuid" }];

    mockLoadFromFirestore.mockRejectedValue(new Error("firestore down"));
    mockLoadFromLocalStorage.mockResolvedValue(localEntries);

    const { result } = renderHook(() =>
      useHistoryPersistence(
        createHookOptions({
          user: { uid: "user-1" },
          setHistory,
          setIsLoadingHistory,
        }),
      ),
    );

    await act(async () => {
      await result.current.loadHistoryFromFirestore("user-1");
    });

    expect(setHistory).toHaveBeenCalledWith(localEntries);
    expect(setIsLoadingHistory).toHaveBeenLastCalledWith(false);
  });

  it("persists draft entries to local storage when requested", () => {
    const addEntry = vi.fn();

    const { result } = renderHook(() =>
      useHistoryPersistence(
        createHookOptions({
          addEntry,
        }),
      ),
    );

    act(() => {
      result.current.createDraft({
        id: "draft-persisted",
        mode: "video",
        targetModel: "kling",
        generationParams: { duration: 8 },
        input: "persist me",
        persist: true,
      });
    });

    expect(mockSyncToLocalStorage).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "draft-persisted",
        uuid: "generated-uuid-1",
        input: "persist me",
      }),
    ]);
  });

  it("saveToHistory updates existing entry by uuid and reports failures via toast", async () => {
    const updateEntry = vi.fn();
    const addEntry = vi.fn();
    const toast = createToast();

    mockSaveEntry.mockResolvedValue({ id: "doc-9", uuid: "uuid-9" });

    const { result, rerender } = renderHook(
      ({ history }: { history: PromptHistoryEntry[] }) =>
        useHistoryPersistence(
          createHookOptions({
            user: { uid: "user-9" },
            history,
            toast,
            updateEntry,
            addEntry,
          }),
        ),
      {
        initialProps: {
          history: [{ ...baseEntry, uuid: "uuid-9" }],
        },
      },
    );

    await act(async () => {
      const saveResult = await result.current.saveToHistory(
        "new input",
        "new output",
        88,
        "video",
        "  model-x  ",
        { steps: 20 },
        null,
        { topic: "science" },
        { highlights: true },
        "uuid-9",
        "Session title",
      );
      expect(saveResult).toEqual({ id: "doc-9", uuid: "uuid-9" });
    });

    expect(mockSaveEntry).toHaveBeenCalledWith(
      "user-9",
      expect.objectContaining({
        uuid: "uuid-9",
        title: "Session title",
        targetModel: "model-x",
        generationParams: { steps: 20 },
      }),
    );
    expect(updateEntry).toHaveBeenCalledWith(
      "uuid-9",
      expect.objectContaining({
        id: "doc-9",
        uuid: "uuid-9",
        input: "new input",
        output: "new output",
        score: 88,
      }),
    );
    expect(addEntry).not.toHaveBeenCalled();

    mockSaveEntry.mockRejectedValueOnce(new Error("save failed"));
    rerender({ history: [] });

    await act(async () => {
      const failedResult = await result.current.saveToHistory(
        "a",
        "b",
        null,
        "video",
      );
      expect(failedResult).toBeNull();
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to save to cloud");
  });

  it("updateEntryPersisted persists remotely and updates local fields", async () => {
    const updateEntry = vi.fn();

    const { result } = renderHook(() =>
      useHistoryPersistence(
        createHookOptions({
          user: { uid: "user-1" },
          history: [baseEntry],
          updateEntry,
        }),
      ),
    );

    act(() => {
      result.current.updateEntryPersisted("uuid-1", "doc-1", {
        input: "changed input",
        title: "Changed title",
        targetModel: "model-z",
      });
    });

    expect(mockUpdatePrompt).toHaveBeenCalledWith("user-1", "uuid-1", "doc-1", {
      input: "changed input",
      title: "Changed title",
      targetModel: "model-z",
    });
    expect(updateEntry).toHaveBeenCalledWith("uuid-1", {
      input: "changed input",
      title: "Changed title",
      targetModel: "model-z",
    });
  });

  it("persists draft prompt updates locally without calling the remote repository", async () => {
    vi.useFakeTimers();
    const updateEntry = vi.fn();

    const { result } = renderHook(() =>
      useHistoryPersistence(
        createHookOptions({
          user: { uid: "user-1" },
          history: [{ ...baseEntry, id: "draft-1" }],
          updateEntry,
        }),
      ),
    );

    act(() => {
      result.current.updateEntryPersisted("uuid-1", "draft-1", {
        input: "changed input",
        title: "Changed title",
        targetModel: "model-z",
      });
    });

    // Local-storage snapshot is debounced; advance past the 5s window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(mockUpdatePrompt).not.toHaveBeenCalled();
    expect(updateEntry).toHaveBeenCalledWith(
      "uuid-1",
      expect.objectContaining({
        id: "draft-1",
        input: "changed input",
        title: "Changed title",
        targetModel: "model-z",
      }),
    );
    expect(mockSyncToLocalStorage).toHaveBeenCalled();
  });

  it("flushes only the requested owned version and waits for actual write completion", async () => {
    vi.useFakeTimers();
    const versions: PromptVersionEntry[] = [
      {
        versionId: "v1",
        signature: "s1",
        prompt: "A city",
        timestamp: "2026-10-03T00:00:00Z",
      },
    ];
    let finish!: () => void;
    const pendingWrite = new Promise<void>((resolve) => {
      finish = resolve;
    });
    mockUpdateVersions.mockReturnValueOnce(pendingWrite);
    const { result } = renderHook(() =>
      useHistoryPersistence(
        createHookOptions({ user: { uid: "user-1" }, history: [baseEntry] }),
      ),
    );
    await act(async () => {
      await result.current.loadHistoryFromLocalStorage();
    });
    act(() => {
      result.current.updateEntryVersions("uuid-1", "doc-1", versions);
    });
    let settled = false;
    let flush: Promise<void>;
    await act(async () => {
      flush = result.current
        .flushVersionWrites("uuid-1", "doc-1", "v1")
        .then(() => {
          settled = true;
        });
      await Promise.resolve();
    });
    expect(mockUpdateVersions).toHaveBeenCalledWith(
      "user-1",
      "uuid-1",
      "doc-1",
      versions,
      { requireSuccess: true },
    );
    expect(settled).toBe(false);
    await act(async () => {
      finish();
      await flush!;
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(settled).toBe(true);
    expect(mockUpdateVersions).toHaveBeenCalledTimes(1);
  });
  it("waits for an already-running older version write before flushing the selected newer words", async () => {
    vi.useFakeTimers();
    const older: PromptVersionEntry[] = [
      {
        versionId: "v1",
        signature: "s1",
        prompt: "Older words",
        timestamp: "2026-10-03T00:00:00Z",
      },
    ];
    const newer: PromptVersionEntry[] = [
      ...older,
      {
        versionId: "v2",
        signature: "s2",
        prompt: "New words",
        timestamp: "2026-10-03T00:00:01Z",
      },
    ];
    let finish!: () => void;
    mockUpdateVersions
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() =>
      useHistoryPersistence(
        createHookOptions({ user: { uid: "user-1" }, history: [baseEntry] }),
      ),
    );
    await act(async () => {
      await result.current.loadHistoryFromLocalStorage();
    });
    act(() => {
      result.current.updateEntryVersions("uuid-1", "doc-1", older);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mockUpdateVersions).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.updateEntryVersions("uuid-1", "doc-1", newer);
    });
    let flush: Promise<void>;
    act(() => {
      flush = result.current.flushVersionWrites("uuid-1", "doc-1", "v2");
    });
    expect(mockUpdateVersions).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await flush!;
    });
    expect(mockUpdateVersions).toHaveBeenNthCalledWith(
      2,
      "user-1",
      "uuid-1",
      "doc-1",
      newer,
      { requireSuccess: true },
    );
  });
  it("strict version flush refuses a missing version without dispatch and exposes repository failure", async () => {
    const versions: PromptVersionEntry[] = [
      {
        versionId: "v1",
        signature: "s1",
        prompt: "A city",
        timestamp: "2026-10-03T00:00:00Z",
      },
    ];
    const { result } = renderHook(() =>
      useHistoryPersistence(
        createHookOptions({ user: { uid: "user-1" }, history: [baseEntry] }),
      ),
    );
    await act(async () => {
      await result.current.loadHistoryFromLocalStorage();
    });
    act(() => {
      result.current.updateEntryVersions("uuid-1", "doc-1", versions);
    });
    await expect(
      result.current.flushVersionWrites("uuid-1", "doc-1", "missing"),
    ).rejects.toThrow("Save associated words");
    expect(mockUpdateVersions).not.toHaveBeenCalled();
    mockUpdateVersions.mockRejectedValueOnce(new Error("Write refused"));
    await expect(
      result.current.flushVersionWrites("uuid-1", "doc-1", "v1"),
    ).rejects.toThrow("Write refused");
  });
  it("debounces version writes and persists only latest payload after initial load", async () => {
    vi.useFakeTimers();
    const updateEntry = vi.fn();
    const user = { uid: "user-2" };

    const versionsA: PromptVersionEntry[] = [
      {
        versionId: "v1",
        signature: "sig-1",
        prompt: "prompt-1",
        timestamp: "2025-01-01T00:00:00.000Z",
      },
    ];
    const versionsB: PromptVersionEntry[] = [
      {
        versionId: "v2",
        signature: "sig-2",
        prompt: "prompt-2",
        timestamp: "2025-01-01T00:00:01.000Z",
      },
    ];

    const { result } = renderHook(() =>
      useHistoryPersistence(
        createHookOptions({
          user,
          history: [baseEntry],
          updateEntry,
        }),
      ),
    );

    await act(async () => {
      await result.current.loadHistoryFromLocalStorage();
    });

    act(() => {
      result.current.updateEntryVersions("uuid-1", "doc-1", versionsA);
      result.current.updateEntryVersions("uuid-1", "doc-1", versionsB);
    });

    expect(updateEntry).toHaveBeenNthCalledWith(1, "uuid-1", {
      versions: versionsA,
    });
    expect(updateEntry).toHaveBeenNthCalledWith(2, "uuid-1", {
      versions: versionsB,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockUpdateVersions).toHaveBeenCalledTimes(1);
    expect(mockUpdateVersions).toHaveBeenCalledWith(
      "user-2",
      "uuid-1",
      "doc-1",
      versionsB,
    );
  });

  it("persists draft version updates locally without remote promotion", async () => {
    vi.useFakeTimers();
    const updateEntry = vi.fn();
    const versions: PromptVersionEntry[] = [
      {
        versionId: "v1",
        signature: "sig-1",
        prompt: "prompt-1",
        timestamp: "2025-01-01T00:00:00.000Z",
      },
    ];

    const { result } = renderHook(() =>
      useHistoryPersistence(
        createHookOptions({
          user: { uid: "user-1" },
          history: [{ ...baseEntry, id: "draft-1" }],
          updateEntry,
        }),
      ),
    );

    act(() => {
      result.current.updateEntryVersions("uuid-1", "draft-1", versions);
    });

    // Local-storage snapshot is debounced; advance past the 5s window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(mockUpdateVersions).not.toHaveBeenCalled();
    expect(updateEntry).toHaveBeenCalledWith(
      "uuid-1",
      expect.objectContaining({
        id: "draft-1",
        versions,
      }),
    );
    expect(mockSyncToLocalStorage).toHaveBeenCalled();
  });

  it("deleteFromHistory reloads and shows error toast when delete fails", async () => {
    const removeEntry = vi.fn();
    const toast = createToast();

    mockDeleteEntry.mockRejectedValue(new Error("delete failed"));
    mockLoadFromFirestore.mockResolvedValue([baseEntry]);

    const { result } = renderHook(() =>
      useHistoryPersistence(
        createHookOptions({
          user: { uid: "user-3" },
          toast,
          removeEntry,
        }),
      ),
    );

    await act(async () => {
      await result.current.deleteFromHistory("doc-3");
    });

    expect(removeEntry).toHaveBeenCalledWith("doc-3");
    expect(mockDeleteEntry).toHaveBeenCalledWith("user-3", "doc-3");
    expect(mockLoadFromFirestore).toHaveBeenCalledWith("user-3");
    expect(toast.error).toHaveBeenCalledWith("Failed to delete prompt");
  });
});
