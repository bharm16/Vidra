/**
 * Unit tests for LocalStoragePromptRepository
 *
 * Tests localStorage CRUD, Zod validation, quota handling, and edge cases.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { LocalStoragePromptRepository } from "../LocalStoragePromptRepository";
import { PromptRepositoryError } from "../promptRepositoryTypes";

// Mock LoggingService to avoid side effects
vi.mock("../../services/LoggingService", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe("LocalStoragePromptRepository", () => {
  let repo: LocalStoragePromptRepository;
  const testKey = "test_prompt_history";

  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStoragePromptRepository(testKey);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // ---------------------------------------------------------------------------
  // save - error handling
  // ---------------------------------------------------------------------------
  describe("save", () => {
    it("trims whitespace from provided UUID", async () => {
      const result = await repo.save("user1", {
        uuid: "  my-uuid  ",
        input: "hello",
        output: "world",
      });
      expect(result.uuid).toBe("my-uuid");
    });

    it("updates existing entry with matching UUID", async () => {
      await repo.save("user1", {
        uuid: "existing-uuid",
        input: "old input",
        output: "old output",
      });

      await repo.save("user1", {
        uuid: "existing-uuid",
        input: "new input",
        output: "new output",
      });

      const entry = await repo.getByUuid("existing-uuid");
      expect(entry?.input).toBe("new input");
      expect(entry?.output).toBe("new output");
    });

    it("caps history at 100 entries", async () => {
      for (let i = 0; i < 105; i++) {
        await repo.save("user1", {
          input: `input-${i}`,
          output: `output-${i}`,
        });
      }

      const all = await repo.getUserPrompts("user1", 200);
      expect(all).toHaveLength(100);
    });

    it("preserves mode and targetModel when provided", async () => {
      await repo.save("user1", {
        uuid: "meta-uuid",
        input: "test",
        output: "result",
        mode: "video",
        targetModel: "kling-v1",
      });

      const entry = await repo.getByUuid("meta-uuid");
      expect(entry?.mode).toBe("video");
      expect(entry?.targetModel).toBe("kling-v1");
    });

    it("falls back to trimmed history on QuotaExceededError", async () => {
      const seededHistory = Array.from({ length: 80 }, (_, i) => ({
        id: String(i),
        uuid: `uuid-${i}`,
        input: `input-${i}`,
        output: `output-${i}`,
        timestamp: new Date().toISOString(),
      }));
      localStorage.setItem(testKey, JSON.stringify(seededHistory));

      const originalSetItem = localStorage.setItem.bind(localStorage);
      const quotaError = new Error("quota exceeded");
      quotaError.name = "QuotaExceededError";
      const setItemSpy = vi
        .spyOn(localStorage, "setItem")
        .mockImplementationOnce(() => {
          throw quotaError;
        })
        .mockImplementation((key: string, value: string) => {
          originalSetItem(key, value);
        });

      await repo.save("user1", {
        uuid: "new-uuid",
        input: "new input",
        output: "new output",
      });

      const parsed = JSON.parse(localStorage.getItem(testKey) || "[]");
      expect(parsed).toHaveLength(50);
      expect(parsed[0]).toMatchObject({
        uuid: "new-uuid",
        input: "new input",
        output: "new output",
      });
      expect(setItemSpy).toHaveBeenCalledTimes(2);
    });

    it("throws PromptRepositoryError when storage fails with non-quota error", async () => {
      const storageError = new Error("Storage unavailable");
      storageError.name = "SecurityError";
      const setItemSpy = vi
        .spyOn(localStorage, "setItem")
        .mockImplementation(() => {
          throw storageError;
        });

      await expect(
        repo.save("user1", {
          input: "cannot-save",
          output: "cannot-save",
        }),
      ).rejects.toBeInstanceOf(PromptRepositoryError);

      expect(setItemSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getUserPrompts
  // ---------------------------------------------------------------------------
  describe("getUserPrompts", () => {
    it("respects limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await repo.save("user1", { input: `in-${i}`, output: `out-${i}` });
      }
      const result = await repo.getUserPrompts("user1", 3);
      expect(result).toHaveLength(3);
    });

    it("returns empty array on corrupted localStorage data", async () => {
      localStorage.setItem(testKey, "not valid json {{{");
      const result = await repo.getUserPrompts("user1");
      expect(result).toEqual([]);
    });

    it("returns empty array when localStorage contains non-array JSON", async () => {
      localStorage.setItem(testKey, '{"foo": "bar"}');
      const result = await repo.getUserPrompts("user1");
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getByUuid
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // updatePrompt
  // ---------------------------------------------------------------------------
  describe("updatePrompt", () => {
    it("updates title for matching UUID", async () => {
      await repo.save("user1", { uuid: "up-uuid", input: "i", output: "o" });
      await repo.updatePrompt("up-uuid", { title: "New Title" });
      const entry = await repo.getByUuid("up-uuid");
      expect(entry?.title).toBe("New Title");
    });

    it("does not affect non-matching entries", async () => {
      await repo.save("user1", {
        uuid: "other-uuid",
        input: "i",
        output: "o",
        title: "Original",
      });
      await repo.updatePrompt("nonexistent", { title: "Changed" });
      const entry = await repo.getByUuid("other-uuid");
      expect(entry?.title).toBe("Original");
    });

    it("updates multiple fields at once", async () => {
      await repo.save("user1", { uuid: "multi", input: "i", output: "o" });
      await repo.updatePrompt("multi", {
        input: "new input",
        mode: "enhanced",
        targetModel: "sora-v2",
      });
      const entry = await repo.getByUuid("multi");
      expect(entry?.input).toBe("new input");
      expect(entry?.mode).toBe("enhanced");
      expect(entry?.targetModel).toBe("sora-v2");
    });
  });

  // ---------------------------------------------------------------------------
  // updateOutput
  // ---------------------------------------------------------------------------
  describe("updateOutput", () => {
    it("updates output for matching entry", async () => {
      await repo.save("user1", { uuid: "out-uuid", input: "i", output: "old" });
      await repo.updateOutput("out-uuid", "new output");
      const entry = await repo.getByUuid("out-uuid");
      expect(entry?.output).toBe("new output");
    });

    it("no-ops when uuid is empty", async () => {
      await repo.save("user1", {
        uuid: "safe",
        input: "i",
        output: "original",
      });
      await repo.updateOutput("", "changed");
      const entry = await repo.getByUuid("safe");
      expect(entry?.output).toBe("original");
    });

    it("no-ops when output is empty", async () => {
      await repo.save("user1", {
        uuid: "safe2",
        input: "i",
        output: "original",
      });
      await repo.updateOutput("safe2", "");
      const entry = await repo.getByUuid("safe2");
      expect(entry?.output).toBe("original");
    });
  });

  // ---------------------------------------------------------------------------
  // updateVersions
  // ---------------------------------------------------------------------------
  describe("updateVersions", () => {
    it("replaces versions array", async () => {
      await repo.save("user1", { uuid: "ver-uuid", input: "i", output: "o" });
      const versions = [
        {
          versionId: "v1",
          signature: "sig",
          prompt: "p",
          timestamp: new Date().toISOString(),
        },
      ];
      await repo.updateVersions("ver-uuid", versions);
      const entry = await repo.getByUuid("ver-uuid");
      expect(entry?.versions).toHaveLength(1);
      expect(entry?.versions?.[0]?.versionId).toBe("v1");
    });
  });

  // ---------------------------------------------------------------------------
  // updateHighlights
  // ---------------------------------------------------------------------------
  describe("updateHighlights", () => {
    it("updates highlightCache for matching entry", async () => {
      await repo.save("user1", { uuid: "hl-uuid", input: "i", output: "o" });
      await repo.updateHighlights("hl-uuid", {
        highlightCache: { spans: [1, 2, 3] },
      });
      const entry = await repo.getByUuid("hl-uuid");
      expect(entry?.highlightCache).toEqual({ spans: [1, 2, 3] });
    });

    it("sets highlightCache to null when not provided", async () => {
      await repo.save("user1", {
        uuid: "hl2",
        input: "i",
        output: "o",
        highlightCache: { old: true },
      });
      await repo.updateHighlights("hl2", {});
      const entry = await repo.getByUuid("hl2");
      expect(entry?.highlightCache).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // syncEntries
  // ---------------------------------------------------------------------------
  describe("syncEntries", () => {
    it("returns success true after sync", () => {
      const result = repo.syncEntries([{ input: "x", output: "y" }] as any);
      expect(result.success).toBe(true);

      // Verify data was actually persisted
      const raw = localStorage.getItem(testKey);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].input).toBe("x");
    });
  });

  // ---------------------------------------------------------------------------
  // deleteById
  // ---------------------------------------------------------------------------
  describe("deleteById", () => {
    it("preserves entries count minus one after deletion", async () => {
      await repo.save("user1", { uuid: "a", input: "a", output: "a" });
      // wait a ms so Date.now() gives different IDs
      await new Promise((r) => setTimeout(r, 2));
      await repo.save("user1", { uuid: "b", input: "b", output: "b" });

      const before = await repo.getUserPrompts("user1", 100);
      expect(before).toHaveLength(2);

      // Delete the second entry by its ID
      const entryB = before.find((e) => e.uuid === "b");
      expect(entryB?.id).toBeTruthy();
      await repo.deleteById(entryB!.id!);

      const after = await repo.getUserPrompts("user1", 100);
      expect(after).toHaveLength(1);
      expect(after[0]?.uuid).toBe("a");
    });
  });

  // ---------------------------------------------------------------------------
  // clear
  // ---------------------------------------------------------------------------
  describe("clear", () => {
    it("removes all entries", async () => {
      await repo.save("user1", { input: "a", output: "b" });
      await repo.clear();
      const result = await repo.getUserPrompts("user1");
      expect(result).toEqual([]);
    });
  });
});
