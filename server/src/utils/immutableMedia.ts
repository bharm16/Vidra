/**
 * Pure helpers for preserving immutable media references when merging session
 * prompt versions or keyframes. Lives in `utils/` (not under any service
 * domain) because both `services/sessions/SessionService` and
 * `services/continuity/ContinuitySessionService` need it, and neither domain
 * should depend on the other.
 *
 * No I/O, no Firestore, no Node APIs — operates entirely on plain data from
 * `@shared/types/session`.
 */
import type {
  SessionPromptKeyframe,
  SessionPromptVersionEntry,
} from "@shared/types/session";

export type ImmutableMediaWarning = {
  scope: "version" | "generation" | "keyframe";
  field: string;
  versionId?: string;
  generationId?: string;
  keyframeId?: string;
  // A server-owned fact is any JSON value (a string url, a list of asset ids, a
  // provenance object, a boolean flag), so the before/after ride as `unknown`.
  previous?: unknown;
  incoming?: unknown;
};

type GenerationRecord = Record<string, unknown>;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const normalizeStringList = (value?: unknown): string[] =>
  Array.isArray(value) ? value.filter(isNonEmptyString) : [];

const listsEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const preserveImmutableString = (
  existing: string | null | undefined,
  incoming: string | null | undefined,
  warnings: ImmutableMediaWarning[],
  context: Omit<ImmutableMediaWarning, "previous" | "incoming">,
): string | null | undefined => {
  if (isNonEmptyString(existing)) {
    if (isNonEmptyString(incoming) && existing !== incoming) {
      warnings.push({
        ...context,
        previous: existing,
        incoming,
      });
    }
    return existing;
  }
  return isNonEmptyString(incoming) ? incoming : (incoming ?? existing);
};

const mergePreview = (
  existing: SessionPromptVersionEntry["preview"] | null | undefined,
  incoming: SessionPromptVersionEntry["preview"] | null | undefined,
  versionId: string,
  warnings: ImmutableMediaWarning[],
): SessionPromptVersionEntry["preview"] | null | undefined => {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const next = { ...incoming };
  const storagePath = preserveImmutableString(
    existing.storagePath,
    incoming.storagePath,
    warnings,
    {
      scope: "version",
      field: "preview.storagePath",
      versionId,
    },
  );
  const assetId = preserveImmutableString(
    existing.assetId,
    incoming.assetId,
    warnings,
    {
      scope: "version",
      field: "preview.assetId",
      versionId,
    },
  );

  if (storagePath && storagePath !== incoming.storagePath) {
    next.storagePath = storagePath;
  } else if (!incoming.storagePath && storagePath) {
    next.storagePath = storagePath;
  }
  if (assetId && assetId !== incoming.assetId) {
    next.assetId = assetId;
  } else if (!incoming.assetId && assetId) {
    next.assetId = assetId;
  }

  if (!incoming.imageUrl && existing.imageUrl) {
    next.imageUrl = existing.imageUrl;
  }
  if (!incoming.viewUrlExpiresAt && existing.viewUrlExpiresAt) {
    next.viewUrlExpiresAt = existing.viewUrlExpiresAt;
  }
  if (!incoming.aspectRatio && existing.aspectRatio) {
    next.aspectRatio = existing.aspectRatio;
  }
  if (!incoming.generatedAt && existing.generatedAt) {
    next.generatedAt = existing.generatedAt;
  }

  return next;
};

const mergeVideo = (
  existing: SessionPromptVersionEntry["video"] | null | undefined,
  incoming: SessionPromptVersionEntry["video"] | null | undefined,
  versionId: string,
  warnings: ImmutableMediaWarning[],
): SessionPromptVersionEntry["video"] | null | undefined => {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const next = { ...incoming };
  const storagePath = preserveImmutableString(
    existing.storagePath,
    incoming.storagePath,
    warnings,
    {
      scope: "version",
      field: "video.storagePath",
      versionId,
    },
  );
  const assetId = preserveImmutableString(
    existing.assetId,
    incoming.assetId,
    warnings,
    {
      scope: "version",
      field: "video.assetId",
      versionId,
    },
  );

  if (storagePath && storagePath !== incoming.storagePath) {
    next.storagePath = storagePath;
  } else if (!incoming.storagePath && storagePath) {
    next.storagePath = storagePath;
  }
  if (assetId && assetId !== incoming.assetId) {
    next.assetId = assetId;
  } else if (!incoming.assetId && assetId) {
    next.assetId = assetId;
  }

  if (!incoming.videoUrl && existing.videoUrl) {
    next.videoUrl = existing.videoUrl;
  }
  if (!incoming.viewUrlExpiresAt && existing.viewUrlExpiresAt) {
    next.viewUrlExpiresAt = existing.viewUrlExpiresAt;
  }
  if (!incoming.model && existing.model) {
    next.model = existing.model;
  }
  if (!incoming.generatedAt && existing.generatedAt) {
    next.generatedAt = existing.generatedAt;
  }

  return next;
};

/**
 * The take facts the server owns — ADR-0022 (decisions 1-3, 6) and issue #112.
 *
 * Once a take exists in a session, none of these can be changed through any
 * client-writable door: the versions PATCH, the general session update, or the
 * attachment retry. A client write may still ADD a new take, refresh a signed
 * URL, or edit the version envelope's own fields; it may never rewrite the
 * identity, origin, provenance, ancestry, archive state, durable media handles,
 * or completion of a take already recorded.
 *
 * `id` is the merge key — a take is matched by it and never renamed through it,
 * so it is named here for the contract but reconciled as the key, not a field.
 *
 * Deliberately NOT server-owned: the ephemeral signed URLs (`mediaUrls`,
 * `thumbnailUrl`, and the version-level `imageUrl`/`videoUrl`/
 * `viewUrlExpiresAt`). They expire and the client refreshes them, so they flow
 * through. The DURABLE handles (`mediaAssetIds`, `storagePath`, and the
 * version-level `assetId`/`storagePath`) are what identifies the media and are
 * immutable.
 *
 * The client mirrors the non-media subset in
 * `client/src/features/generations/utils/serverOwnedRecordFields.ts`
 * (`SERVER_OWNED_RECORD_FIELDS`) as a defensive re-apply; the server is the
 * enforcement boundary, so this list is authoritative.
 */
export const SERVER_OWNED_TAKE_FACTS = [
  "id",
  "origin",
  "productionProvenance",
  "sourceInputs",
  "ancestorGenerationId",
  "archived",
  "status",
  "completedAt",
  "mediaAssetIds",
  "storagePath",
] as const;

/**
 * The provenance and lifecycle facts, preserved from the stored take whether it
 * records them or NOT. A legacy take that never recorded an origin keeps
 * reading `unknown` — a client cannot add one to make the old record pass
 * (issue #112 rule d: never invent an origin or provenance). The durable media
 * identifiers (`mediaAssetIds`, `storagePath`) are handled separately because
 * a first late binding onto a take that lacked them is legitimate, while
 * inventing an origin never is.
 */
const PROVENANCE_FACT_KEYS = [
  "origin",
  "productionProvenance",
  "sourceInputs",
  "ancestorGenerationId",
  "archived",
  "status",
  "completedAt",
] as const;

/**
 * Structural equality for take-fact values. Order-independent over object keys
 * so a client that re-serialised a provenance object it read is not reported as
 * having changed it. Plain JSON data only — the facts are never functions,
 * Dates, or class instances by the time they are persisted.
 */
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => deepEqual(value, b[index]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(bObj, key) &&
      deepEqual(aObj[key], bObj[key]),
  );
};

export interface GenerationReconciliation {
  record: GenerationRecord;
  /**
   * Each server-owned fact the incoming record tried to change to a DIFFERENT,
   * present value. Empty when the incoming record faithfully re-states (or
   * simply omits) the stored take's facts. A write door decides what a conflict
   * means: the versions PATCH and general update treat it as a silent
   * correction (a stale save is routine), the attachment retry as a rejection
   * (its whole job is to re-send the take's own record).
   */
  conflicts: ImmutableMediaWarning[];
}

/**
 * Reconcile an incoming take record against the one already stored under the
 * same identity — the single spelling of the server-owned-facts rule (issue
 * #112), shared by every client-writable door.
 *
 * The result keeps the stored take's every server-owned fact and lets the
 * mutable ones (refreshable URLs, caption, anything unmodelled) come from the
 * incoming record. When no stored take exists (a first attach, a brand-new
 * take), the incoming record stands — the caller is introducing the take, not
 * rewriting one.
 */
export function reconcileGenerationRecord(
  existing: GenerationRecord | undefined,
  incoming: GenerationRecord,
  versionId?: string,
): GenerationReconciliation {
  if (!existing) return { record: incoming, conflicts: [] };

  const conflicts: ImmutableMediaWarning[] = [];
  const generationId = isNonEmptyString((incoming as { id?: unknown }).id)
    ? (incoming.id as string)
    : isNonEmptyString((existing as { id?: unknown }).id)
      ? (existing.id as string)
      : undefined;
  const context = (
    field: string,
  ): Omit<ImmutableMediaWarning, "previous" | "incoming"> => ({
    scope: "generation",
    field,
    ...(versionId ? { versionId } : {}),
    ...(generationId ? { generationId } : {}),
  });

  // Existing-only fields survive; incoming updates the mutable ones. The
  // server-owned facts below then overwrite whatever this base holds for them.
  const record: GenerationRecord = { ...existing, ...incoming };

  // Refreshable URLs flow through (already taken from incoming in the base);
  // only fill them back in when the incoming record dropped them entirely.
  const existingUrls = normalizeStringList(existing.mediaUrls);
  const incomingUrls = normalizeStringList(incoming.mediaUrls);
  if (existingUrls.length && !incomingUrls.length) {
    record.mediaUrls = existingUrls;
  }
  if (
    !isNonEmptyString(incoming.thumbnailUrl) &&
    isNonEmptyString(existing.thumbnailUrl)
  ) {
    record.thumbnailUrl = existing.thumbnailUrl;
  }

  // Durable media identifier — a list of asset ids.
  const existingIds = normalizeStringList(existing.mediaAssetIds);
  const incomingIds = normalizeStringList(incoming.mediaAssetIds);
  if (existingIds.length) {
    if (incomingIds.length && !listsEqual(existingIds, incomingIds)) {
      conflicts.push({
        ...context("mediaAssetIds"),
        previous: existingIds,
        incoming: incomingIds,
      });
    }
    record.mediaAssetIds = existingIds;
  }

  // Durable media identifier — the storage path. Never handled before this
  // change, so a client record could silently rewrite it.
  if (isNonEmptyString(existing.storagePath)) {
    if (
      isNonEmptyString(incoming.storagePath) &&
      incoming.storagePath !== existing.storagePath
    ) {
      conflicts.push({
        ...context("storagePath"),
        previous: existing.storagePath,
        incoming: incoming.storagePath,
      });
    }
    record.storagePath = existing.storagePath;
  }

  // Provenance and lifecycle facts: the stored take wins whether it records the
  // fact or not.
  for (const key of PROVENANCE_FACT_KEYS) {
    const storedValue = (existing as Record<string, unknown>)[key];
    const incomingValue = (incoming as Record<string, unknown>)[key];
    if (storedValue !== undefined) {
      if (
        incomingValue !== undefined &&
        !deepEqual(storedValue, incomingValue)
      ) {
        conflicts.push({
          ...context(key),
          previous: storedValue,
          incoming: incomingValue,
        });
      }
      (record as Record<string, unknown>)[key] = storedValue;
    } else if (incomingValue !== undefined) {
      // The stored take never recorded this fact; the client does not get to
      // add it (issue #112 rule d). Drop it rather than invent one.
      delete (record as Record<string, unknown>)[key];
    }
  }

  return { record, conflicts };
}

const mergeGeneration = (
  existing: GenerationRecord | undefined,
  incoming: GenerationRecord,
  versionId: string,
  warnings: ImmutableMediaWarning[],
): GenerationRecord => {
  const { record, conflicts } = reconcileGenerationRecord(
    existing,
    incoming,
    versionId,
  );
  warnings.push(...conflicts);
  return record;
};

const mergeGenerations = (
  existing: SessionPromptVersionEntry["generations"] | null | undefined,
  incoming: SessionPromptVersionEntry["generations"] | null | undefined,
  versionId: string,
  warnings: ImmutableMediaWarning[],
): SessionPromptVersionEntry["generations"] | null | undefined => {
  const incomingList = Array.isArray(incoming) ? incoming : [];
  const existingList = Array.isArray(existing) ? existing : [];
  if (!incomingList.length) {
    return existingList.length ? existingList : incoming;
  }
  if (!existingList.length) {
    return incomingList;
  }

  const existingMap = new Map<string, GenerationRecord>();
  for (const generation of existingList) {
    if (
      generation &&
      typeof generation === "object" &&
      isNonEmptyString((generation as { id?: string }).id)
    ) {
      existingMap.set((generation as { id: string }).id, generation);
    }
  }

  const incomingIds = new Set<string>();
  const merged = incomingList.map((generation) => {
    if (!generation || typeof generation !== "object") return generation;
    const generationId = isNonEmptyString((generation as { id?: string }).id)
      ? (generation as { id: string }).id
      : null;
    if (generationId) {
      incomingIds.add(generationId);
    }
    return mergeGeneration(
      generationId ? existingMap.get(generationId) : undefined,
      generation,
      versionId,
      warnings,
    );
  });

  for (const generation of existingList) {
    if (!generation || typeof generation !== "object") {
      merged.push(generation);
      continue;
    }
    const generationId = isNonEmptyString((generation as { id?: string }).id)
      ? (generation as { id: string }).id
      : null;
    if (!generationId || !incomingIds.has(generationId)) {
      merged.push(generation);
    }
  }

  return merged;
};

export function enforceImmutableVersions(
  existing: SessionPromptVersionEntry[] | null | undefined,
  incoming: SessionPromptVersionEntry[] | null | undefined,
): {
  versions: SessionPromptVersionEntry[] | null | undefined;
  warnings: ImmutableMediaWarning[];
} {
  const warnings: ImmutableMediaWarning[] = [];
  if (!Array.isArray(incoming)) {
    // Not an array means "not updating versions" — leave whatever was passed.
    return { versions: incoming, warnings };
  }

  const existingList = Array.isArray(existing) ? existing : [];

  if (incoming.length === 0) {
    // History only accumulates: words-versions and takes are never removed by a
    // whole-array write (archival is its own leaf-only action). An empty array
    // is a stale or racing client payload built before any version existed —
    // honouring it would erase the session's history. Preserve what is stored.
    if (existingList.length === 0) {
      return { versions: incoming, warnings };
    }
    warnings.push({
      scope: "version",
      field: "versions.clearedByEmptyArray",
      previous: existingList.map((version) => version.versionId),
      incoming: null,
    });
    return { versions: existingList, warnings };
  }

  if (!existingList.length) {
    return { versions: incoming, warnings };
  }

  const existingMap = new Map(
    existingList.map((version) => [version.versionId, version]),
  );
  const merged = incoming.map((version) => {
    const existingVersion = existingMap.get(version.versionId);
    if (!existingVersion) return version;
    const next: SessionPromptVersionEntry = { ...version };
    // Coalesce both spellings on each side before comparing. A session stored
    // before 2026-08-10 holds the frame under `preview`; a client that has
    // since read and re-saved it sends `firstFrame`. Comparing the two names
    // directly would read as "the client dropped the frame" and restore a
    // duplicate under the old key.
    const firstFrame = mergePreview(
      existingVersion.firstFrame ?? existingVersion.preview,
      version.firstFrame ?? version.preview,
      version.versionId,
      warnings,
    );
    const video = mergeVideo(
      existingVersion.video,
      version.video,
      version.versionId,
      warnings,
    );
    const generations = mergeGenerations(
      existingVersion.generations,
      version.generations,
      version.versionId,
      warnings,
    );

    if (firstFrame != null) {
      next.firstFrame = firstFrame;
      // Writers emit the new spelling only; leaving the old key behind would
      // keep two copies of one frame alive in the stored document.
      delete next.preview;
    }
    if (video != null) {
      next.video = video;
    }
    if (generations != null) {
      next.generations = generations;
    }

    return next;
  });

  const incomingIds = new Set(incoming.map((version) => version.versionId));
  for (const existingVersion of existingList) {
    if (!incomingIds.has(existingVersion.versionId)) {
      merged.push(existingVersion);
    }
  }

  return { versions: merged, warnings };
}

const resolveKeyframeKey = (keyframe: SessionPromptKeyframe): string | null => {
  if (isNonEmptyString(keyframe.id)) return keyframe.id;
  if (isNonEmptyString(keyframe.storagePath)) return keyframe.storagePath;
  if (isNonEmptyString(keyframe.url)) return keyframe.url;
  return null;
};

export function enforceImmutableKeyframes(
  existing: SessionPromptKeyframe[] | null | undefined,
  incoming: SessionPromptKeyframe[] | null | undefined,
): {
  keyframes: SessionPromptKeyframe[] | null | undefined;
  warnings: ImmutableMediaWarning[];
} {
  const warnings: ImmutableMediaWarning[] = [];
  if (!Array.isArray(incoming)) {
    return { keyframes: incoming, warnings };
  }

  const existingList = Array.isArray(existing) ? existing : [];
  if (!existingList.length) {
    return { keyframes: incoming, warnings };
  }

  const existingMap = new Map<string, SessionPromptKeyframe>();
  for (const frame of existingList) {
    const key = resolveKeyframeKey(frame);
    if (key) {
      existingMap.set(key, frame);
    }
  }

  const merged = incoming.map((frame) => {
    const key = resolveKeyframeKey(frame);
    if (!key) return frame;
    const existingFrame = existingMap.get(key);
    if (!existingFrame) return frame;

    const next = { ...frame };
    const storagePath = preserveImmutableString(
      existingFrame.storagePath,
      frame.storagePath,
      warnings,
      {
        scope: "keyframe",
        field: "storagePath",
        keyframeId: existingFrame.id ?? key,
      },
    );
    const assetId = preserveImmutableString(
      existingFrame.assetId,
      frame.assetId,
      warnings,
      {
        scope: "keyframe",
        field: "assetId",
        keyframeId: existingFrame.id ?? key,
      },
    );

    if (storagePath && storagePath !== frame.storagePath) {
      next.storagePath = storagePath;
    } else if (!frame.storagePath && storagePath) {
      next.storagePath = storagePath;
    }
    if (assetId && assetId !== frame.assetId) {
      next.assetId = assetId;
    } else if (!frame.assetId && assetId) {
      next.assetId = assetId;
    }

    if (!frame.url && existingFrame.url) {
      next.url = existingFrame.url;
    }

    return next;
  });

  return { keyframes: merged, warnings };
}
