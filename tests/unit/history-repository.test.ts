import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    startTimer: vi.fn(),
    endTimer: vi.fn(),
  },
}));

const mockRepository = {
  getUserPrompts: vi.fn(),
  save: vi.fn(),
  deleteById: vi.fn(),
  clear: vi.fn(),
  syncEntries: vi.fn(),
  updatePrompt: vi.fn(),
  updateHighlights: vi.fn(),
  updateOutput: vi.fn(),
  updateVersions: vi.fn(),
  collectionName: "prompts",
};

vi.mock("@repositories/index", () => ({
  getPromptRepositoryForUser: vi.fn(() => mockRepository),
  getLocalPromptRepository: vi.fn(() => mockRepository),
}));

import {
  normalizeEntries,
  loadFromFirestore,
  saveEntry,
  updatePrompt,
  updateOutput,
  updateVersions,
} from "@hooks/usePromptHistory/api/historyRepository";
import type { PromptHistoryEntry } from "@features/prompt-optimizer/types/domain/prompt-session";

describe("normalizeEntries", () => {
  describe("error and edge cases", () => {
    it("fills in all optional fields with defaults when missing", () => {
      const sparse = [
        { input: "test", output: "result" },
      ] as PromptHistoryEntry[];
      const normalized = normalizeEntries(sparse);

      expect(normalized[0]?.title).toBeNull();
      expect(normalized[0]?.brainstormContext).toBeNull();
      expect(normalized[0]?.generationParams).toBeNull();
      expect(normalized[0]?.keyframes).toBeNull();
      expect(normalized[0]?.highlightCache).toBeNull();
      expect(normalized[0]?.versions).toEqual([]);
    });
  });

  describe("core behavior", () => {
    it("preserves existing values when they are defined", () => {
      const entry: PromptHistoryEntry = {
        input: "test",
        output: "result",
        title: "My Prompt",
        brainstormContext: { key: "val" },
        generationParams: { fps: 24 },
        keyframes: [{ url: "http://example.com/img.png" }],
        highlightCache: { cached: true },
        versions: [
          { versionId: "v1", signature: "sig", prompt: "p", timestamp: "t" },
        ],
      };

      const normalized = normalizeEntries([entry]);
      expect(normalized[0]?.title).toBe("My Prompt");
      expect(normalized[0]?.versions).toHaveLength(1);
      expect(normalized[0]?.keyframes).toHaveLength(1);
    });
  });
});

describe("loadFromFirestore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("core behavior", () => {
    it("normalizes entries returned from repository", async () => {
      mockRepository.getUserPrompts.mockResolvedValueOnce([
        { input: "hello", output: "world" },
      ]);
      const result = await loadFromFirestore("user-1");
      expect(result[0]?.title).toBeNull();
      expect(result[0]?.versions).toEqual([]);
    });
  });
});

describe("saveEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("core behavior", () => {
    it("passes optional fields when provided", async () => {
      mockRepository.save.mockResolvedValueOnce({ uuid: "x", id: "y" });

      await saveEntry("user-1", {
        uuid: "existing-uuid",
        title: "My Title",
        input: "in",
        output: "out",
        score: 90,
        mode: "video",
        targetModel: "kling",
        brainstormContext: { style: "cinematic" },
      });

      const firstSaveCall = mockRepository.save.mock.calls[0];
      expect(firstSaveCall).toBeDefined();
      const callArg = firstSaveCall?.[1];
      expect(callArg?.uuid).toBe("existing-uuid");
      expect(callArg?.title).toBe("My Title");
      expect(callArg?.targetModel).toBe("kling");
    });
  });
});

describe("updatePrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips remote persistence when docId starts with draft- for authenticated users", async () => {
    await updatePrompt("user-1", "uuid-1", "draft-123", { input: "new" });
    expect(mockRepository.updatePrompt).not.toHaveBeenCalled();
  });

  it("falls back to uuid when docId is null", async () => {
    await updatePrompt("user-1", "uuid-1", null, { input: "new" });
    expect(mockRepository.updatePrompt).toHaveBeenCalledWith("uuid-1", {
      input: "new",
    });
  });

  it("calls updatePrompt with docId for valid Firestore doc", async () => {
    mockRepository.updatePrompt.mockResolvedValueOnce(undefined);
    await updatePrompt("user-1", "uuid-1", "real-doc-id", { input: "updated" });
    expect(mockRepository.updatePrompt).toHaveBeenCalledWith("real-doc-id", {
      input: "updated",
    });
  });
});

describe("updateOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure repository has the method
    mockRepository.updateOutput = vi.fn().mockResolvedValue(undefined);
  });

  it("skips remote output persistence when docId is a draft id for authenticated users", async () => {
    await updateOutput("user-1", "uuid-1", "draft-456", "new output");
    expect(mockRepository.updateOutput).not.toHaveBeenCalled();
  });
});

describe("updateVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository.updateVersions = vi.fn().mockResolvedValue(undefined);
  });

  it("falls back to uuid when docId is draft", async () => {
    await updateVersions("user-1", "uuid-1", "draft-789", []);
    expect(mockRepository.updateVersions).toHaveBeenCalledWith("uuid-1", []);
  });
});
