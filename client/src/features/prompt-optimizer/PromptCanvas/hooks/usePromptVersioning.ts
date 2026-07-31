import { useCallback, useMemo, useRef, type MutableRefObject } from "react";
import { createHighlightSignature } from "@/features/span-highlighting";
import type { CapabilityValues } from "@shared/capabilities";
import type {
  PromptHistoryEntry,
  PromptVersionEdit,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import type { Generation } from "@features/generations/types";
import { areGenerationsEqual } from "@features/generations/utils/generationComparison";
import {
  extractStorageObjectPath,
  extractVideoContentAssetId,
  parseGcsSignedUrlExpiryMs,
} from "@/utils/storageUrl";
import type { HighlightSnapshot } from "../types";

// Per-span content equality for the idempotency guard in
// `syncVersionHighlights`. Accepts `unknown` because the persisted version
// entry stores highlights as `Record<string, unknown>` (the on-disk shape is
// laxer than the runtime HighlightSnapshot) — the helper validates the shape
// at runtime as it walks. We deliberately ignore `confidence` because LLM
// labelers produce numerically noisy scores across runs even when nothing
// semantically changed; gating persistence on confidence would cause the
// "browsing is read-only" rule (ISSUE-31) to leak again. The user-visible
// highlight rendering is determined by start/end/category — those are what
// must match for the snapshot to be a true round-trip echo.
const haveIdenticalSpanContent = (a: unknown, b: unknown): boolean => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i] as
      | { start?: unknown; end?: unknown; category?: unknown }
      | undefined;
    const right = b[i] as
      | { start?: unknown; end?: unknown; category?: unknown }
      | undefined;
    if (!left || !right) return false;
    if (
      left.start !== right.start ||
      left.end !== right.end ||
      left.category !== right.category
    ) {
      return false;
    }
  }
  return true;
};

interface UsePromptVersioningOptions {
  promptHistory: PromptVersionStore;
  currentPromptUuid: string | null;
  currentPromptDocId: string | null;
  activeVersionId?: string | null;
  latestHighlightRef: MutableRefObject<HighlightSnapshot | null>;
  versionEditCountRef: MutableRefObject<number>;
  versionEditsRef: MutableRefObject<PromptVersionEdit[]>;
  resetVersionEdits: () => void;
  effectiveAspectRatio: string | null;
  generationParams: CapabilityValues;
  selectedModel: string;
}

interface PromptVersionStore {
  history: PromptHistoryEntry[];
  updateEntryVersions: (
    uuid: string,
    docId: string | null,
    versions: PromptVersionEntry[],
  ) => void;
}

interface UpsertVersionOutputParams {
  action: "preview" | "video";
  prompt: string;
  generatedAt: number | string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  aspectRatio?: string | null;
}

interface UsePromptVersioningReturn {
  upsertVersionOutput: (params: UpsertVersionOutputParams) => void;
  syncVersionHighlights: (
    snapshot: HighlightSnapshot,
    promptText: string,
  ) => void;
  syncVersionGenerations: (generations: Generation[]) => void;
}

const toIsoString = (value: number | string): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
    return value;
  }
  return new Date().toISOString();
};

const toExpiresAtIso = (url?: string | null): string | null => {
  if (!url || typeof url !== "string") return null;
  const expiresAtMs = parseGcsSignedUrlExpiryMs(url);
  return expiresAtMs ? new Date(expiresAtMs).toISOString() : null;
};

const extractAssetIdFromPath = (path?: string | null): string | null => {
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  return parts.length ? (parts[parts.length - 1] ?? null) : null;
};

/**
 * Extract the best thumbnail URL from a list of generations.
 * Prioritizes: explicit thumbnailUrl > image mediaUrls > first media URL
 */
const extractThumbnailFromGenerations = (
  generations: Generation[],
): string | null => {
  const completed = generations.filter((g) => g.status === "completed");
  if (!completed.length) return null;

  // First, look for an explicit thumbnailUrl (set by flux-kontext storyboard)
  for (const gen of completed) {
    if (
      gen.thumbnailUrl &&
      typeof gen.thumbnailUrl === "string" &&
      gen.thumbnailUrl.trim()
    ) {
      return gen.thumbnailUrl.trim();
    }
  }

  // Next, prefer image or image-sequence media types
  for (const gen of completed) {
    if (
      (gen.mediaType === "image" || gen.mediaType === "image-sequence") &&
      gen.mediaUrls.length
    ) {
      const url = gen.mediaUrls[0];
      if (url && typeof url === "string" && url.trim()) {
        return url.trim();
      }
    }
  }

  // No blind mediaUrls fallback: for a video-only version that URL is the
  // mp4 itself, and it used to get written into version.preview.imageUrl —
  // an <img> src — leaving broken posters on the space tile and Library
  // card. A version with no still simply has no preview.
  return null;
};

/**
 * Determine which of two Generation records is "more complete".
 * A generation is considered more complete when it has a terminal status
 * (completed/failed) and/or has populated media data.  This prevents a
 * concurrent persist triggered by a newly-added (still "generating")
 * generation from erasing an already-completed sibling generation's data.
 */
const generationCompleteness = (gen: Generation): number => {
  let score = 0;
  if (gen.status === "completed") score += 10;
  if (gen.status === "failed") score += 5;
  if (gen.mediaUrls.length > 0) score += 3;
  if (gen.thumbnailUrl) score += 1;
  if (gen.completedAt) score += 1;
  return score;
};

/**
 * Merge an incoming generations array with the already-persisted generations
 * on the version entry.  For each generation ID that appears in both arrays,
 * the more complete record wins (see `generationCompleteness`).  Generations
 * that only exist in the persisted set are preserved; generations that only
 * exist in the incoming set are appended.  The order follows the incoming
 * array, with any persisted-only entries appended at the end.
 *
 * This avoids the race where a persist for gen2 (status: "generating")
 * overwrites gen1 (status: "completed") because the callback read a stale
 * snapshot that didn't include gen1's completed data.
 */
const mergeGenerationsById = (
  persisted: Generation[] | null | undefined,
  incoming: Generation[],
): Generation[] => {
  if (!persisted?.length) return incoming;
  // Bug 18 safeguard: if incoming is empty, preserve persisted data rather than wiping it.
  // This prevents a stale callback with an empty array from erasing completed generations.
  if (!incoming.length) return persisted;

  const persistedMap = new Map<string, Generation>();
  for (const gen of persisted) {
    persistedMap.set(gen.id, gen);
  }

  const incomingIds = new Set<string>();
  const merged: Generation[] = incoming.map((incomingGen) => {
    incomingIds.add(incomingGen.id);
    const persistedGen = persistedMap.get(incomingGen.id);
    if (!persistedGen) return incomingGen;

    // Pick the more complete record
    const incomingScore = generationCompleteness(incomingGen);
    const persistedScore = generationCompleteness(persistedGen);
    const preferred =
      incomingScore >= persistedScore ? incomingGen : persistedGen;
    return {
      ...preferred,
      isFavorite:
        typeof incomingGen.isFavorite === "boolean"
          ? incomingGen.isFavorite
          : typeof persistedGen.isFavorite === "boolean"
            ? persistedGen.isFavorite
            : undefined,
      generationSettings:
        incomingGen.generationSettings ??
        persistedGen.generationSettings ??
        undefined,
    };
  });

  // Append any persisted generations not present in the incoming array.
  // These are generations that the current local state doesn't know about
  // (e.g., completed gen1 that was persisted but lost from local state).
  for (const gen of persisted) {
    if (!incomingIds.has(gen.id)) {
      merged.push(gen);
    }
  }

  return merged;
};

const buildSeedVersionFromGeneration = (
  generation: Generation,
  highlights: HighlightSnapshot | null,
): PromptVersionEntry | null => {
  const promptText =
    typeof generation.prompt === "string" ? generation.prompt.trim() : "";
  if (!promptText) return null;

  const versionId =
    typeof generation.promptVersionId === "string" &&
    generation.promptVersionId.trim().length > 0
      ? generation.promptVersionId.trim()
      : `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    versionId,
    label: "v1",
    signature: createHighlightSignature(promptText),
    prompt: promptText,
    timestamp: new Date().toISOString(),
    ...(highlights ? { highlights } : {}),
    generations: [],
  };
};

export function usePromptVersioning({
  promptHistory,
  currentPromptUuid,
  currentPromptDocId,
  activeVersionId,
  latestHighlightRef,
  versionEditCountRef,
  versionEditsRef,
  resetVersionEdits,
  effectiveAspectRatio,
  generationParams,
  selectedModel,
}: UsePromptVersioningOptions): UsePromptVersioningReturn {
  const { history, updateEntryVersions } = promptHistory;
  // Track last persisted thumbnail to prevent infinite update loops
  const lastPersistedThumbnailRef = useRef<string | null>(null);

  const currentPromptEntry = useMemo(() => {
    if (!history.length) return null;
    return (
      history.find((entry) => entry.uuid === currentPromptUuid) ||
      history.find((entry) => entry.id === currentPromptDocId) ||
      null
    );
  }, [history, currentPromptUuid, currentPromptDocId]);

  const currentVersions = useMemo<PromptVersionEntry[]>(
    () =>
      Array.isArray(currentPromptEntry?.versions)
        ? currentPromptEntry.versions
        : [],
    [currentPromptEntry],
  );

  // Bug 12/13 fix: refs for fresh values in callbacks to avoid stale closures
  const currentVersionsRef = useRef(currentVersions);
  currentVersionsRef.current = currentVersions;
  const currentPromptEntryRef = useRef(currentPromptEntry);
  currentPromptEntryRef.current = currentPromptEntry;

  const persistVersions = useCallback(
    (versions: PromptVersionEntry[]): void => {
      if (!currentPromptUuid) return;
      // Eagerly update ref so concurrent callbacks in the same render cycle
      // read fresh data instead of overwriting each other's changes
      currentVersionsRef.current = versions;
      // Bug 13 fix: read entry from ref to avoid stale docId after draft promotion
      const entry = currentPromptEntryRef.current;
      const resolvedDocId = entry?.id ?? currentPromptDocId;
      updateEntryVersions(currentPromptUuid, resolvedDocId ?? null, versions);
    },
    [updateEntryVersions, currentPromptUuid, currentPromptDocId],
  );

  const createVersionEntry = useCallback(
    ({
      signature,
      prompt,
      highlights,
      preview,
      video,
    }: {
      signature: string;
      prompt: string;
      highlights?: PromptVersionEntry["highlights"];
      preview?: PromptVersionEntry["preview"];
      video?: PromptVersionEntry["video"];
    }): PromptVersionEntry => {
      const versionNumber = currentVersions.length + 1;
      const editCount = versionEditCountRef.current;
      const edits = versionEditsRef.current.length
        ? [...versionEditsRef.current]
        : [];
      return {
        versionId: `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: `v${versionNumber}`,
        signature,
        prompt,
        timestamp: new Date().toISOString(),
        ...(typeof highlights !== "undefined" ? { highlights } : {}),
        ...(editCount > 0 ? { editCount } : {}),
        ...(edits.length ? { edits } : {}),
        ...(typeof preview !== "undefined" ? { preview } : {}),
        ...(typeof video !== "undefined" ? { video } : {}),
      };
    },
    [currentVersions.length, versionEditCountRef, versionEditsRef],
  );

  const upsertVersionOutput = useCallback(
    (params: UpsertVersionOutputParams): void => {
      if (!currentPromptUuid) return;
      if (!currentPromptEntryRef.current) return;
      const promptText = params.prompt.trim();
      if (!promptText) return;

      const versions = currentVersionsRef.current;
      const signature = createHighlightSignature(promptText);
      const lastVersion = versions[versions.length - 1] ?? null;
      const hasEditsSinceLastVersion =
        !lastVersion || lastVersion.signature !== signature;

      const previewPayload =
        params.action === "preview"
          ? {
              generatedAt: toIsoString(params.generatedAt),
              imageUrl: params.imageUrl ?? null,
              aspectRatio: params.aspectRatio ?? effectiveAspectRatio ?? null,
              storagePath: params.imageUrl
                ? extractStorageObjectPath(params.imageUrl)
                : null,
              assetId: params.imageUrl
                ? (() => {
                    const path = extractStorageObjectPath(params.imageUrl);
                    return path && !path.startsWith("users/")
                      ? extractAssetIdFromPath(path)
                      : null;
                  })()
                : null,
              viewUrlExpiresAt: toExpiresAtIso(params.imageUrl),
            }
          : undefined;

      const videoPayload =
        params.action === "video"
          ? {
              generatedAt: toIsoString(params.generatedAt),
              videoUrl: params.videoUrl ?? null,
              model: selectedModel?.trim() ? selectedModel.trim() : null,
              generationParams: generationParams ?? null,
              storagePath: params.videoUrl
                ? extractStorageObjectPath(params.videoUrl)
                : null,
              assetId: params.videoUrl
                ? (extractVideoContentAssetId(params.videoUrl) ??
                  (() => {
                    const path = extractStorageObjectPath(params.videoUrl);
                    return path && !path.startsWith("users/")
                      ? extractAssetIdFromPath(path)
                      : null;
                  })())
                : null,
              viewUrlExpiresAt: toExpiresAtIso(params.videoUrl),
            }
          : undefined;

      if (hasEditsSinceLastVersion) {
        const newVersion = createVersionEntry({
          signature,
          prompt: promptText,
          highlights: latestHighlightRef.current ?? undefined,
          preview: previewPayload,
          video: videoPayload,
        });
        persistVersions([...versions, newVersion]);
        resetVersionEdits();
        return;
      }

      if (!lastVersion) return;
      const updatedLast: PromptVersionEntry = {
        ...lastVersion,
        ...(previewPayload ? { preview: previewPayload } : {}),
        ...(videoPayload ? { video: videoPayload } : {}),
      };
      const updatedVersions = [...versions.slice(0, -1), updatedLast];
      persistVersions(updatedVersions);
    },
    [
      currentPromptUuid,
      createVersionEntry,
      effectiveAspectRatio,
      generationParams,
      latestHighlightRef,
      persistVersions,
      resetVersionEdits,
      selectedModel,
    ],
  );

  const syncVersionHighlights = useCallback(
    (snapshot: HighlightSnapshot, promptText: string): void => {
      if (!currentPromptUuid) return;
      if (!currentPromptEntryRef.current) return;
      if (!snapshot?.signature) return;

      const versions = currentVersionsRef.current;
      if (versions.length === 0) {
        const fallbackPrompt = promptText.trim();
        if (!fallbackPrompt) return;
        // Diagnostic warn (per pre-launch code review): this branch is the
        // only labeling-sync path that creates a fresh v1, and it fires both
        // legitimately (brand-new session, first ML pass after typing) and
        // suspiciously (hydrated session whose versions array is empty —
        // legacy data, partial writes, or a sync race). The latter case
        // bumps `updatedAt` on what should be a read-only browse,
        // violating the "browsing is read-only" UX rule.
        //
        // We can't reliably distinguish the two cases here, so we don't
        // gate the create — but we surface the event so production logs
        // can quantify how often it fires on hydrated sessions.
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            "[usePromptVersioning] syncVersionHighlights creating v1 on empty-versions entry",
            {
              promptUuid: currentPromptUuid,
              signature: snapshot.signature,
              editsSinceLoad: versionEditCountRef.current,
            },
          );
        }
        const initialVersion = createVersionEntry({
          signature: snapshot.signature,
          prompt: fallbackPrompt,
          highlights: snapshot,
        });
        persistVersions([initialVersion]);
        resetVersionEdits();
        return;
      }

      const lastVersion = versions[versions.length - 1];
      if (!lastVersion) {
        return;
      }
      if (lastVersion.signature !== snapshot.signature) {
        return;
      }

      // Idempotency guard (ISSUE-31): hydrating the labeling pipeline on
      // session load re-emits a snapshot with a freshly stamped `updatedAt`
      // but otherwise identical content. Persisting that round-trip would
      // bump the session's updatedAt every time the user just *navigates* to
      // a session, breaking the "browsing is read-only" UX rule.
      //
      // We compare on the content-bearing tuple of every span (start, end,
      // category) plus signature/cacheId. A length-only check is NOT enough:
      // a fresh re-label can yield the same number of spans with different
      // categorizations (LLM labelers are non-deterministic across runs), and
      // dropping that legitimate update would silently reintroduce stale
      // highlight data. The per-span structural compare is the cheapest
      // correct predicate.
      const existingHighlights = lastVersion.highlights;
      if (
        existingHighlights &&
        existingHighlights.signature === snapshot.signature &&
        existingHighlights.cacheId === snapshot.cacheId &&
        haveIdenticalSpanContent(existingHighlights.spans, snapshot.spans)
      ) {
        return;
      }

      const updatedLast: PromptVersionEntry = {
        ...lastVersion,
        highlights: snapshot,
      };
      persistVersions([...versions.slice(0, -1), updatedLast]);
    },
    [
      createVersionEntry,
      currentPromptUuid,
      persistVersions,
      resetVersionEdits,
      versionEditCountRef,
    ],
  );

  // Bug 12 fix: read currentVersions/currentPromptEntry from refs to avoid stale closures
  const syncVersionGenerations = useCallback(
    (generations: Generation[]): void => {
      if (!currentPromptUuid) return;
      // Previously bailed here when the history entry hadn't hydrated yet
      // (common during draft→persisted transition): saveToHistory returns
      // the new uuid before the local history array has refreshed, so
      // currentPromptEntry is briefly null and this sync was silently
      // dropped. The result: accepted generations never reached the cloud,
      // users were charged for storyboards that never displayed. We now
      // proceed with an empty versions array and seed from the generation.

      let versions = currentVersionsRef.current;
      if (!versions.length) {
        const seedSource = [...generations]
          .reverse()
          .find(
            (generation) =>
              typeof generation.prompt === "string" && generation.prompt.trim(),
          );
        if (!seedSource) return;

        const seedVersion = buildSeedVersionFromGeneration(
          seedSource,
          latestHighlightRef.current,
        );
        if (!seedVersion) return;

        versions = [seedVersion];
        currentVersionsRef.current = versions;
      }

      const index = activeVersionId
        ? versions.findIndex((version) => version.versionId === activeVersionId)
        : versions.length - 1;
      if (index < 0) return;

      const target = versions[index];
      if (!target) return;

      // Merge incoming generations with already-persisted ones by ID,
      // preferring the more complete record for each generation.
      const mergedGenerations = mergeGenerationsById(
        target.generations,
        generations,
      );

      // Extract thumbnail from the merged set (includes all completed generations)
      const thumbnailUrl = extractThumbnailFromGenerations(mergedGenerations);
      const existingPreviewUrl = target.preview?.imageUrl;

      const alreadyPersisted =
        thumbnailUrl === lastPersistedThumbnailRef.current;
      const shouldUpdatePreview = Boolean(
        thumbnailUrl &&
          thumbnailUrl !== existingPreviewUrl &&
          !alreadyPersisted,
      );

      // Check if generations changed or if we have a new thumbnail to persist
      const generationsChanged = !areGenerationsEqual(
        target.generations,
        mergedGenerations,
      );

      if (!generationsChanged && !shouldUpdatePreview) return;

      const updated: PromptVersionEntry = {
        ...target,
        generations: mergedGenerations.length ? mergedGenerations : [],
      };

      // Update preview with thumbnail from generations if available
      if (shouldUpdatePreview && thumbnailUrl) {
        updated.preview = {
          generatedAt: new Date().toISOString(),
          imageUrl: thumbnailUrl,
          aspectRatio: target.preview?.aspectRatio ?? null,
          storagePath: extractStorageObjectPath(thumbnailUrl),
          assetId: (() => {
            const path = extractStorageObjectPath(thumbnailUrl);
            return path && !path.startsWith("users/")
              ? extractAssetIdFromPath(path)
              : null;
          })(),
          viewUrlExpiresAt: toExpiresAtIso(thumbnailUrl),
        };
        lastPersistedThumbnailRef.current = thumbnailUrl;
      }

      const updatedVersions = [...versions];
      updatedVersions[index] = updated;

      persistVersions(updatedVersions);
    },
    [activeVersionId, currentPromptUuid, latestHighlightRef, persistVersions],
  );

  return { upsertVersionOutput, syncVersionHighlights, syncVersionGenerations };
}
