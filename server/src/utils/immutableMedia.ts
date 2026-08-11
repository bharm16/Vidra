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
  previous?: string | string[] | null;
  incoming?: string | string[] | null;
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

const mergeGeneration = (
  existing: GenerationRecord | undefined,
  incoming: GenerationRecord,
  versionId: string,
  warnings: ImmutableMediaWarning[],
): GenerationRecord => {
  if (!existing) return incoming;

  const next: GenerationRecord = { ...incoming };
  const existingUrls = normalizeStringList(existing.mediaUrls);
  const incomingUrls = normalizeStringList(incoming.mediaUrls);
  if (existingUrls.length && !incomingUrls.length) {
    next.mediaUrls = existingUrls;
  }

  if (
    !isNonEmptyString(incoming.thumbnailUrl) &&
    isNonEmptyString(existing.thumbnailUrl)
  ) {
    next.thumbnailUrl = existing.thumbnailUrl;
  }

  const existingIds = normalizeStringList(existing.mediaAssetIds);
  const incomingIds = normalizeStringList(incoming.mediaAssetIds);
  if (existingIds.length) {
    if (!incomingIds.length || !listsEqual(existingIds, incomingIds)) {
      const warning: ImmutableMediaWarning = {
        scope: "generation",
        field: "mediaAssetIds",
        versionId,
        previous: existingIds,
        incoming: incomingIds.length ? incomingIds : null,
        ...(isNonEmptyString(incoming.id) ? { generationId: incoming.id } : {}),
      };
      warnings.push(warning);
      next.mediaAssetIds = existingIds;
    }
  }

  return next;
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
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return { versions: incoming, warnings };
  }

  const existingList = Array.isArray(existing) ? existing : [];
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
