/**
 * History Repository Operations
 *
 * Wraps repository calls for prompt history CRUD operations.
 * Handles Firestore and localStorage fallback logic.
 */

import {
  getLocalPromptRepository,
  getPromptRepositoryForUser,
} from "../../../repositories";
import { logger } from "../../../services/LoggingService";
import { isBlankLocalDraft } from "../utils/blankLocalDraft";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
  SaveEntryParams,
  SaveResult,
} from "../types";
import type { UpdatePromptOptions } from "../../../repositories/promptRepositoryTypes";

const log = logger.child("historyRepository");

const isValidSessionId = (
  docId: string | null | undefined,
): docId is string => {
  if (!docId) {
    return false;
  }
  const normalized = docId.trim();
  return normalized.length > 0 && !normalized.startsWith("draft-");
};

const isDraftDocId = (docId: string | null | undefined): boolean => {
  if (!docId) {
    return false;
  }
  return docId.trim().startsWith("draft-");
};

const normalizeRecord = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
};

/**
 * Normalize prompt entries to ensure consistent shape
 */
export function normalizeEntries(
  entries: PromptHistoryEntry[],
): PromptHistoryEntry[] {
  return entries.map((entry) => ({
    ...entry,
    title: entry.title ?? null,
    brainstormContext: entry.brainstormContext ?? null,
    generationParams: entry.generationParams ?? null,
    keyframes: entry.keyframes ?? null,
    highlightCache: entry.highlightCache ?? null,
    versions: entry.versions ?? [],
  }));
}

/**
 * Load history from Firestore for authenticated user
 */
export async function loadFromFirestore(
  userId: string,
): Promise<PromptHistoryEntry[]> {
  log.debug("Loading from Firestore", { userId });
  logger.startTimer("loadFromFirestore");

  try {
    const repository = getPromptRepositoryForUser(true);
    const prompts = await repository.getUserPrompts(userId, 100);
    const normalized = normalizeEntries(prompts);

    const duration = logger.endTimer("loadFromFirestore");

    log.info("Loaded from Firestore", {
      entryCount: normalized.length,
      duration,
    });

    return normalized;
  } catch (error) {
    logger.endTimer("loadFromFirestore");
    // PromptRepository logs this with full context — rethrow without re-logging.
    throw error;
  }
}

/**
 * Load history from localStorage for unauthenticated user
 */
export async function loadFromLocalStorage(): Promise<PromptHistoryEntry[]> {
  log.debug("Loading from localStorage");

  try {
    const repository = getPromptRepositoryForUser(false);
    const prompts = await repository.getUserPrompts("", 100);
    return normalizeEntries(prompts);
  } catch (error) {
    // LocalStoragePromptRepository already logged — rethrow cleanly.
    throw error;
  }
}

/**
 * Save history to localStorage (for syncing Firestore data)
 *
 * Blank bootstrap drafts never reach the store: they are in-memory
 * scaffolding (created on every blank session load), and persisting one
 * turns it into a durable "Untitled" entry that resurfaces on every later
 * load. A rehydrated blank draft is indistinguishable from a fresh
 * bootstrap, so dropping them loses nothing.
 */
export function syncToLocalStorage(entries: PromptHistoryEntry[]): {
  success: boolean;
  trimmed: boolean;
} {
  const repository = getLocalPromptRepository();
  const persistable = entries.filter((entry) => !isBlankLocalDraft(entry));
  return repository.syncEntries(persistable);
}

/**
 * Save a new entry to the repository
 */
export async function saveEntry(
  userId: string | undefined,
  params: SaveEntryParams,
): Promise<SaveResult> {
  log.debug("Saving entry", {
    hasUser: !!userId,
    inputLength: params.input.length,
  });
  logger.startTimer("saveEntry");

  const repository = getPromptRepositoryForUser(!!userId);

  try {
    const result = await repository.save(userId ?? "", {
      ...(params.uuid ? { uuid: params.uuid } : {}),
      ...(params.title !== undefined ? { title: params.title } : {}),
      input: params.input,
      output: params.output,
      score: params.score,
      mode: params.mode,
      ...(params.targetModel ? { targetModel: params.targetModel } : {}),
      ...(params.generationParams
        ? { generationParams: params.generationParams }
        : {}),
      ...(params.keyframes ? { keyframes: params.keyframes } : {}),
      brainstormContext: params.brainstormContext ?? null,
      highlightCache: params.highlightCache ?? null,
      ...(Array.isArray(params.versions) ? { versions: params.versions } : {}),
    });

    const duration = logger.endTimer("saveEntry");
    log.info("Entry saved", { uuid: result.uuid, duration });

    return { uuid: result.uuid, id: result.id };
  } catch (error) {
    logger.endTimer("saveEntry");
    // PromptRepository logs this with full context — rethrow without re-logging.
    throw error;
  }
}

/**
 * Update prompt details (persisted)
 */
export async function updatePrompt(
  userId: string | undefined,
  uuid: string,
  docId: string | null,
  updates: UpdatePromptOptions,
): Promise<void> {
  const repository = getPromptRepositoryForUser(!!userId);

  if (userId && isDraftDocId(docId)) {
    return;
  }

  if (
    "updatePrompt" in repository &&
    typeof repository.updatePrompt === "function"
  ) {
    const canUseDocId = Boolean(userId) && isValidSessionId(docId);
    let attemptedUuid = false;
    try {
      if (canUseDocId) {
        await repository.updatePrompt(docId, updates);
        return;
      }
      attemptedUuid = true;
      await repository.updatePrompt(uuid, updates);
    } catch (error) {
      if (
        userId &&
        isValidSessionId(docId) &&
        !attemptedUuid &&
        uuid &&
        uuid !== docId
      ) {
        try {
          await repository.updatePrompt(uuid, updates);
          return;
        } catch (fallbackError) {
          log.warn("Unable to persist updated prompt (fallback)", {
            uuid,
            docId,
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
          });
          return;
        }
      }
      log.warn("Unable to persist updated prompt", {
        uuid,
        docId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Update highlight cache for an entry
 */
export async function updateHighlights(
  userId: string | undefined,
  uuid: string,
  docId: string | null,
  highlightCache: Record<string, unknown> | null,
): Promise<void> {
  const repository = getPromptRepositoryForUser(!!userId);

  if (userId && isDraftDocId(docId)) {
    return;
  }

  if (
    "updateHighlights" in repository &&
    typeof repository.updateHighlights === "function"
  ) {
    const canUseDocId = Boolean(userId) && isValidSessionId(docId);
    const normalizedHighlightCache = normalizeRecord(highlightCache);
    let attemptedUuid = false;
    try {
      if (canUseDocId) {
        await repository.updateHighlights(docId, {
          highlightCache: normalizedHighlightCache,
        });
        return;
      }
      attemptedUuid = true;
      await repository.updateHighlights(uuid, {
        highlightCache: normalizedHighlightCache,
      });
    } catch (error) {
      if (
        userId &&
        isValidSessionId(docId) &&
        !attemptedUuid &&
        uuid &&
        uuid !== docId
      ) {
        try {
          await repository.updateHighlights(uuid, {
            highlightCache: normalizedHighlightCache,
          });
          return;
        } catch (fallbackError) {
          log.warn("Unable to persist updated highlights (fallback)", {
            uuid,
            docId,
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
          });
          return;
        }
      }
      log.warn("Unable to persist updated highlights", {
        uuid,
        docId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Update output for an entry
 */
export async function updateOutput(
  userId: string | undefined,
  uuid: string,
  docId: string | null,
  output: string,
): Promise<void> {
  const repository = getPromptRepositoryForUser(!!userId);

  if (userId && isDraftDocId(docId)) {
    return;
  }

  if (
    "updateOutput" in repository &&
    typeof repository.updateOutput === "function"
  ) {
    const canUseDocId = Boolean(userId) && isValidSessionId(docId);
    let attemptedUuid = false;
    try {
      if (canUseDocId) {
        await repository.updateOutput(docId, output);
        return;
      }
      attemptedUuid = true;
      await repository.updateOutput(uuid, output);
    } catch (error) {
      if (
        userId &&
        isValidSessionId(docId) &&
        !attemptedUuid &&
        uuid &&
        uuid !== docId
      ) {
        try {
          await repository.updateOutput(uuid, output);
          return;
        } catch (fallbackError) {
          log.warn("Unable to persist updated output (fallback)", {
            uuid,
            docId,
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
          });
          return;
        }
      }
      log.warn("Unable to persist updated output", {
        uuid,
        docId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Update versions array for an entry
 */
export async function updateVersions(
  userId: string | undefined,
  uuid: string,
  docId: string | null,
  versions: PromptVersionEntry[],
): Promise<void> {
  const repository = getPromptRepositoryForUser(!!userId);

  if (
    "updateVersions" in repository &&
    typeof repository.updateVersions === "function"
  ) {
    const generationCount = versions.reduce(
      (sum, v) =>
        sum + (Array.isArray(v.generations) ? v.generations.length : 0),
      0,
    );

    try {
      if (userId && isValidSessionId(docId)) {
        await repository.updateVersions(docId, versions);
        log.debug("Versions persisted to session store", {
          uuid,
          docId,
          versionCount: versions.length,
          generationCount,
        });
        return;
      }
      await repository.updateVersions(uuid, versions);
      log.debug(
        userId
          ? "Versions persisted to session store via uuid"
          : "Versions persisted to localStorage",
        { uuid, versionCount: versions.length },
      );
    } catch (error) {
      if (userId && isValidSessionId(docId) && uuid && uuid !== docId) {
        try {
          await repository.updateVersions(uuid, versions);
          log.debug("Versions persisted to session store via uuid fallback", {
            uuid,
            docId,
            versionCount: versions.length,
            generationCount,
          });
          return;
        } catch (fallbackError) {
          log.error(
            "Failed to persist versions (fallback)",
            fallbackError as Error,
            { uuid, docId },
          );
          return;
        }
      }
      log.error("Failed to persist versions", error as Error, { uuid, docId });
    }
  }
}

/**
 * Delete an entry by ID
 */
export async function deleteEntry(
  userId: string | undefined,
  entryId: string,
): Promise<void> {
  log.debug("Deleting entry", { entryId, hasUser: !!userId });
  logger.startTimer("deleteEntry");

  const repository = getPromptRepositoryForUser(!!userId);

  try {
    await repository.deleteById(entryId);
    const duration = logger.endTimer("deleteEntry");
    log.info("Entry deleted", { entryId, duration });
  } catch (error) {
    logger.endTimer("deleteEntry");
    log.error("Failed to delete entry", error as Error, { entryId });
    throw error;
  }
}

/**
 * Clear all history
 */
export async function clearAll(userId: string | undefined): Promise<void> {
  log.debug("Clearing all history", { hasUser: !!userId });
  logger.startTimer("clearAll");

  const repository = getPromptRepositoryForUser(!!userId);

  if ("clear" in repository && typeof repository.clear === "function") {
    await repository.clear();
  }

  const duration = logger.endTimer("clearAll");
  log.info("History cleared", { duration });
}
