import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../services/LoggingService";
import type { PromptHistoryEntry, PromptVersionEntry } from "../hooks/types";
import { normalizePersistedVersions } from "./normalizePersistedVersions";
import type {
  PromptData,
  SavedPromptResult,
  UpdatePromptOptions,
} from "./promptRepositoryTypes";
import { PromptRepositoryError } from "./promptRepositoryTypes";

const log = logger.child("LocalStoragePromptRepository");

const CapabilityValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const GenerationParamsSchema = z.record(z.string(), CapabilityValueSchema);
const KeyframeSchema = z
  .object({
    id: z.string().optional(),
    url: z.string(),
    source: z.enum(["upload", "library", "generation", "asset"]).optional(),
    assetId: z.string().optional(),
  })
  .passthrough();
const KeyframesSchema = z.array(KeyframeSchema);

const PromptVersionEditSchema = z
  .object({
    timestamp: z.string(),
    delta: z.number().optional(),
    source: z.string().optional(),
  })
  .passthrough();

const PromptVersionFirstFrameSchema = z
  .object({
    generatedAt: z.string(),
    imageUrl: z.string().nullable().optional(),
    aspectRatio: z.string().nullable().optional(),
  })
  .passthrough();

const PromptVersionVideoSchema = z
  .object({
    generatedAt: z.string(),
    videoUrl: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    generationParams: GenerationParamsSchema.nullable().optional(),
  })
  .passthrough();

const PromptVersionEntrySchema = z
  .object({
    versionId: z.string(),
    label: z.string().optional(),
    signature: z.string(),
    prompt: z.string(),
    timestamp: z.string(),
    highlights: z.unknown().nullable().optional(),
    editCount: z.number().optional(),
    edits: z.array(PromptVersionEditSchema).optional(),
    firstFrame: PromptVersionFirstFrameSchema.nullable().optional(),
    // Pre-2026-08-10 spelling; normalizePersistedVersions folds it into
    // firstFrame so nothing downstream sees two names for one frame.
    preview: PromptVersionFirstFrameSchema.nullable().optional(),
    video: PromptVersionVideoSchema.nullable().optional(),
  })
  .passthrough();

const VersionsSchema = z.array(PromptVersionEntrySchema).catch([]);

const PromptHistoryEntrySchema = z
  .object({
    id: z
      .union([z.string(), z.number()])
      .transform((value) => String(value))
      .optional(),
    uuid: z.string().optional(),
    timestamp: z.string().optional(),
    title: z.string().nullable().optional(),
    input: z.string(),
    output: z.string(),
    score: z.number().nullable().optional(),
    mode: z.string().optional(),
    targetModel: z.string().nullable().optional(),
    generationParams: GenerationParamsSchema.nullable().optional(),
    keyframes: KeyframesSchema.nullable().optional(),
    brainstormContext: z.unknown().nullable().optional(),
    highlightCache: z.unknown().nullable().optional(),
    versions: VersionsSchema.optional(),
  })
  .passthrough();

const PromptHistoryEntriesSchema = z.array(PromptHistoryEntrySchema);

const safeParseHistory = (raw: string): PromptHistoryEntry[] | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = PromptHistoryEntriesSchema.safeParse(parsed);
    return result.success ? (result.data as PromptHistoryEntry[]) : null;
  } catch {
    return null;
  }
};

export class LocalStoragePromptRepository {
  private storageKey: string;

  constructor(storageKey: string = "promptHistory") {
    this.storageKey = storageKey;
  }

  /**
   * Save a prompt to localStorage
   */
  async save(
    userId: string,
    promptData: PromptData,
  ): Promise<SavedPromptResult> {
    try {
      const providedUuid =
        typeof promptData.uuid === "string" ? promptData.uuid.trim() : "";
      const uuid = providedUuid ? providedUuid : uuidv4();
      const history = this._getHistory();
      const existing = history.find((entry) => entry.uuid === uuid) ?? null;
      const versions = Array.isArray(promptData.versions)
        ? promptData.versions
        : (existing?.versions ?? []);
      const generationParams =
        promptData.generationParams &&
        typeof promptData.generationParams === "object"
          ? promptData.generationParams
          : (existing?.generationParams ?? null);
      const keyframes = Array.isArray(promptData.keyframes)
        ? promptData.keyframes
        : (existing?.keyframes ?? []);
      const entry: PromptHistoryEntry = {
        ...(existing ?? {}),
        id: existing?.id ?? String(Date.now()),
        uuid,
        timestamp: new Date().toISOString(),
        title: promptData.title ?? existing?.title ?? null,
        input: promptData.input,
        output: promptData.output,
        score: promptData.score ?? null,
        generationParams,
        keyframes,
        brainstormContext:
          promptData.brainstormContext ?? existing?.brainstormContext ?? null,
        highlightCache: promptData.highlightCache ?? null,
        versions,
        ...(typeof promptData.mode === "string"
          ? { mode: promptData.mode }
          : {}),
        ...(typeof promptData.targetModel === "string"
          ? { targetModel: promptData.targetModel }
          : {}),
      };

      const updatedHistory = [
        entry,
        ...history.filter((historyEntry) => historyEntry.uuid !== uuid),
      ].slice(0, 100);

      try {
        localStorage.setItem(this.storageKey, JSON.stringify(updatedHistory));
      } catch (storageError) {
        if (
          storageError instanceof Error &&
          storageError.name === "QuotaExceededError"
        ) {
          // Try to save with fewer items
          const trimmedHistory = [entry, ...history].slice(0, 50);
          localStorage.setItem(this.storageKey, JSON.stringify(trimmedHistory));
        } else {
          throw storageError;
        }
      }

      return { uuid, id: entry.id ?? uuid };
    } catch (error) {
      log.error("Error saving to localStorage", error as Error);
      throw new PromptRepositoryError("Failed to save to local storage", error);
    }
  }

  /**
   * Get all prompts from localStorage
   */
  async getUserPrompts(
    userId: string,
    limitCount: number = 10,
  ): Promise<PromptHistoryEntry[]> {
    try {
      const history = this._getHistory();
      return history.slice(0, limitCount);
    } catch (error) {
      log.error("Error loading from localStorage", error as Error);
      return [];
    }
  }

  /**
   * Get prompt by UUID from localStorage
   */
  async getByUuid(uuid: string): Promise<PromptHistoryEntry | null> {
    try {
      const history = this._getHistory();
      return history.find((entry) => entry.uuid === uuid) || null;
    } catch (error) {
      log.error("Error fetching from localStorage", error as Error);
      return null;
    }
  }

  /**
   * Get prompt by ID from localStorage
   */
  async getById(id: string): Promise<PromptHistoryEntry | null> {
    try {
      const history = this._getHistory();
      return history.find((entry) => entry.id === id) || null;
    } catch (error) {
      log.error("Error fetching from localStorage by id", error as Error);
      return null;
    }
  }

  /**
   * Update prompt details in localStorage
   */
  async updatePrompt(
    uuid: string,
    updates: UpdatePromptOptions,
  ): Promise<void> {
    try {
      const history = this._getHistory();
      const updated = history.map((entry) => {
        if (entry.uuid !== uuid) return entry;

        return {
          ...entry,
          ...(updates.title !== undefined ? { title: updates.title } : {}),
          ...(updates.input !== undefined ? { input: updates.input } : {}),
          ...(updates.mode !== undefined ? { mode: updates.mode } : {}),
          ...(updates.targetModel !== undefined
            ? { targetModel: updates.targetModel }
            : {}),
          ...(updates.generationParams !== undefined
            ? { generationParams: updates.generationParams }
            : {}),
          ...(updates.keyframes !== undefined
            ? { keyframes: updates.keyframes }
            : {}),
        };
      });

      try {
        localStorage.setItem(this.storageKey, JSON.stringify(updated));
      } catch (storageError) {
        if (
          storageError instanceof Error &&
          storageError.name === "QuotaExceededError"
        ) {
          const trimmed = updated.slice(0, 50);
          localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
          log.warn("Storage limit reached, keeping only 50 most recent items");
        } else {
          throw storageError;
        }
      }
    } catch (error) {
      log.warn("Unable to persist prompt updates to localStorage", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Update highlights in localStorage
   */
  async updateHighlights(
    uuid: string,
    { highlightCache }: { highlightCache?: unknown | null },
  ): Promise<void> {
    try {
      const history = this._getHistory();
      const updated = history.map((entry) =>
        entry.uuid === uuid
          ? { ...entry, highlightCache: highlightCache ?? null }
          : entry,
      );

      try {
        localStorage.setItem(this.storageKey, JSON.stringify(updated));
      } catch (storageError) {
        if (
          storageError instanceof Error &&
          storageError.name === "QuotaExceededError"
        ) {
          // Try to save with fewer items, keeping the updated one
          const trimmed = updated.slice(0, 50);
          localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
          log.warn("Storage limit reached, keeping only 50 most recent items");
        } else {
          throw storageError;
        }
      }
    } catch (error) {
      log.warn("Unable to persist highlights to localStorage", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Replace versions array in localStorage
   */
  async updateVersions(
    uuid: string,
    versions: PromptVersionEntry[],
  ): Promise<void> {
    try {
      if (!uuid) return;

      const history = this._getHistory();
      const updated = history.map((entry) =>
        entry.uuid === uuid
          ? { ...entry, versions: Array.isArray(versions) ? versions : [] }
          : entry,
      );

      try {
        localStorage.setItem(this.storageKey, JSON.stringify(updated));
      } catch (storageError) {
        if (
          storageError instanceof Error &&
          storageError.name === "QuotaExceededError"
        ) {
          const trimmed = updated.slice(0, 50);
          localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
          log.warn("Storage limit reached, keeping only 50 most recent items");
        } else {
          throw storageError;
        }
      }
    } catch (error) {
      log.warn("Unable to persist versions to localStorage", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Update output text in localStorage
   */
  async updateOutput(uuid: string, output: string): Promise<void> {
    try {
      if (!uuid || !output) return;

      const history = this._getHistory();
      const updated = history.map((entry) =>
        entry.uuid === uuid ? { ...entry, output } : entry,
      );

      try {
        localStorage.setItem(this.storageKey, JSON.stringify(updated));
      } catch (storageError) {
        if (
          storageError instanceof Error &&
          storageError.name === "QuotaExceededError"
        ) {
          // Try to save with fewer items, keeping the updated one
          const trimmed = updated.slice(0, 50);
          localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
          log.warn("Storage limit reached, keeping only 50 most recent items");
        } else {
          throw storageError;
        }
      }
    } catch (error) {
      log.warn("Unable to persist output update to localStorage", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Replace stored history entries (used to sync Firestore data)
   */
  syncEntries(entries: PromptHistoryEntry[]): {
    success: boolean;
    trimmed: boolean;
  } {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(entries));
      return { success: true, trimmed: false };
    } catch (error) {
      if (error instanceof Error && error.name === "QuotaExceededError") {
        const trimmed = entries.slice(0, 50);
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
          return { success: true, trimmed: true };
        } catch {
          return { success: false, trimmed: false };
        }
      }
      log.warn("Could not save to localStorage", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, trimmed: false };
    }
  }

  /**
   * Clear all prompts
   */
  async clear(): Promise<void> {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Delete a prompt by its ID from localStorage
   */
  async deleteById(id: string | number): Promise<void> {
    try {
      const history = this._getHistory();
      const filtered = history.filter((entry) => entry.id !== String(id));

      try {
        localStorage.setItem(this.storageKey, JSON.stringify(filtered));
      } catch (storageError) {
        log.error("Error deleting from localStorage", storageError as Error);
        throw storageError;
      }
    } catch (error) {
      log.error("Error deleting prompt from localStorage", error as Error);
      throw new PromptRepositoryError(
        "Failed to delete from local storage",
        error,
      );
    }
  }

  /**
   * Get history from localStorage
   * @private
   */
  private _getHistory(): PromptHistoryEntry[] {
    try {
      const savedHistory = localStorage.getItem(this.storageKey);
      if (!savedHistory) return [];

      const parsed = safeParseHistory(savedHistory);
      if (!parsed) {
        localStorage.removeItem(this.storageKey);
        return [];
      }
      // The version schema passes generations through unvalidated (an open bag
      // by contract), so this is the local-store half of the same boundary
      // PromptRepository applies to the server's sessions.
      return parsed.map((entry) => ({
        ...entry,
        versions: normalizePersistedVersions(entry.versions),
      }));
    } catch (error) {
      log.error("Error parsing localStorage history", error as Error);
      localStorage.removeItem(this.storageKey);
      return [];
    }
  }
}
