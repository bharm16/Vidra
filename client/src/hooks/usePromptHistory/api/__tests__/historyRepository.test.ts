import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockGetPromptRepositoryForUser,
  mockGetLocalPromptRepository,
  mockStartTimer,
  mockEndTimer,
} = vi.hoisted(() => ({
  mockGetPromptRepositoryForUser: vi.fn(),
  mockGetLocalPromptRepository: vi.fn(),
  mockStartTimer: vi.fn(),
  mockEndTimer: vi.fn().mockReturnValue(10),
}));

vi.mock("../../../../repositories", () => ({
  getPromptRepositoryForUser: mockGetPromptRepositoryForUser,
  getLocalPromptRepository: mockGetLocalPromptRepository,
}));

vi.mock("../../../../services/LoggingService", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    startTimer: mockStartTimer,
    endTimer: mockEndTimer,
  },
}));

import {
  loadFromFirestore,
  loadFromLocalStorage,
  saveEntry,
  updateHighlights,
  updateOutput,
  updatePrompt,
} from "../historyRepository";

describe("historyRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loadFromFirestore uses authenticated repository and normalizes results", async () => {
    const repository = {
      getUserPrompts: vi.fn().mockResolvedValue([
        {
          id: "doc-1",
          uuid: "uuid-1",
          input: "input",
          output: "output",
          timestamp: "2025-01-01T00:00:00.000Z",
          versions: undefined,
        },
      ]),
    };
    mockGetPromptRepositoryForUser.mockReturnValue(repository);

    const result = await loadFromFirestore("user-1");

    expect(mockGetPromptRepositoryForUser).toHaveBeenCalledWith(true);
    expect(repository.getUserPrompts).toHaveBeenCalledWith("user-1", 100);
    expect(result[0]?.versions).toEqual([]);
  });

  it("loadFromLocalStorage uses unauthenticated repository", async () => {
    const repository = {
      getUserPrompts: vi.fn().mockResolvedValue([
        {
          id: "local-1",
          uuid: "uuid-local",
          input: "local input",
          output: "local output",
        },
      ]),
    };
    mockGetPromptRepositoryForUser.mockReturnValue(repository);

    const result = await loadFromLocalStorage();

    expect(mockGetPromptRepositoryForUser).toHaveBeenCalledWith(false);
    expect(repository.getUserPrompts).toHaveBeenCalledWith("", 100);
    expect(result).toHaveLength(1);
  });

  it("saveEntry selects repository by auth state and returns id/uuid pair", async () => {
    const repository = {
      save: vi.fn().mockResolvedValue({ id: "doc-10", uuid: "uuid-10" }),
    };
    mockGetPromptRepositoryForUser.mockReturnValue(repository);

    const result = await saveEntry("user-10", {
      input: "in",
      output: "out",
      score: 1,
      mode: "video",
    });

    expect(mockGetPromptRepositoryForUser).toHaveBeenCalledWith(true);
    expect(repository.save).toHaveBeenCalledWith(
      "user-10",
      expect.objectContaining({
        input: "in",
        output: "out",
        mode: "video",
      }),
    );
    expect(result).toEqual({ id: "doc-10", uuid: "uuid-10" });
  });

  it("updatePrompt uses docId first and falls back to uuid when doc update fails", async () => {
    const updatePromptMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("doc update failed"))
      .mockResolvedValueOnce(undefined);
    mockGetPromptRepositoryForUser.mockReturnValue({
      updatePrompt: updatePromptMock,
    });

    await updatePrompt("user-1", "uuid-1", "session_123", { input: "updated" });

    expect(updatePromptMock).toHaveBeenNthCalledWith(1, "session_123", {
      input: "updated",
    });
    expect(updatePromptMock).toHaveBeenNthCalledWith(2, "uuid-1", {
      input: "updated",
    });
  });

  it("updateHighlights normalizes non-object highlightCache to null", async () => {
    const updateHighlightsMock = vi.fn().mockResolvedValue(undefined);
    mockGetPromptRepositoryForUser.mockReturnValue({
      updateHighlights: updateHighlightsMock,
    });

    await updateHighlights("user-1", "uuid-1", "session_9", [
      "invalid",
    ] as never);

    expect(updateHighlightsMock).toHaveBeenCalledWith("session_9", {
      highlightCache: null,
    });
  });

  it("updateOutput falls back to uuid when docId update fails", async () => {
    const updateOutputMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("doc output failed"))
      .mockResolvedValueOnce(undefined);
    mockGetPromptRepositoryForUser.mockReturnValue({
      updateOutput: updateOutputMock,
    });

    await updateOutput("user-1", "uuid-out", "session_1", "new output");

    expect(updateOutputMock).toHaveBeenNthCalledWith(
      1,
      "session_1",
      "new output",
    );
    expect(updateOutputMock).toHaveBeenNthCalledWith(
      2,
      "uuid-out",
      "new output",
    );
  });
});
