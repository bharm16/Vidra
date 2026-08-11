import type {
  PromptHistoryEntry,
  PromptKeyframe,
  PromptVersionEntry,
} from "../types";
import type { Generation } from "@features/generations/types";

export type ImmutableMediaWarning = {
  scope: "version" | "generation" | "keyframe";
  field: string;
  versionId?: string;
  generationId?: string;
  keyframeId?: string;
  previous?: string | string[] | null;
  incoming?: string | string[] | null;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const normalizeStringList = (value?: string[] | null): string[] =>
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
  existing: PromptVersionEntry["firstFrame"] | null | undefined,
  incoming: PromptVersionEntry["firstFrame"] | null | undefined,
  versionId: string,
  warnings: ImmutableMediaWarning[],
): PromptVersionEntry["firstFrame"] | null | undefined => {
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
  existing: PromptVersionEntry["video"] | null | undefined,
  incoming: PromptVersionEntry["video"] | null | undefined,
  versionId: string,
  warnings: ImmutableMediaWarning[],
): PromptVersionEntry["video"] | null | undefined => {
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
  existing: Generation | undefined,
  incoming: Generation,
  versionId: string,
  warnings: ImmutableMediaWarning[],
): Generation => {
  if (!existing) return incoming;

  const next: Generation = { ...incoming };
  if (!incoming.mediaUrls?.length && existing.mediaUrls?.length) {
    next.mediaUrls = existing.mediaUrls;
  }
  if (!incoming.thumbnailUrl && existing.thumbnailUrl) {
    next.thumbnailUrl = existing.thumbnailUrl;
  }
  if (
    typeof incoming.isFavorite !== "boolean" &&
    typeof existing.isFavorite === "boolean"
  ) {
    next.isFavorite = existing.isFavorite;
  }
  if (!incoming.generationSettings && existing.generationSettings) {
    next.generationSettings = existing.generationSettings;
  }

  const existingIds = normalizeStringList(existing.mediaAssetIds);
  const incomingIds = normalizeStringList(incoming.mediaAssetIds);
  if (existingIds.length) {
    if (!incomingIds.length || !listsEqual(existingIds, incomingIds)) {
      warnings.push({
        scope: "generation",
        field: "mediaAssetIds",
        versionId,
        generationId: incoming.id,
        previous: existingIds,
        incoming: incomingIds.length ? incomingIds : null,
      });
      next.mediaAssetIds = existingIds;
    }
  }

  return next;
};

const mergeGenerations = (
  existing: Generation[] | null | undefined,
  incoming: Generation[] | null | undefined,
  versionId: string,
  warnings: ImmutableMediaWarning[],
): Generation[] | null | undefined => {
  const incomingList = Array.isArray(incoming) ? incoming : [];
  const existingList = Array.isArray(existing) ? existing : [];

  if (!incomingList.length) {
    return existingList.length ? existingList : incoming;
  }
  if (!existingList.length) {
    return incomingList;
  }

  const existingMap = new Map(
    existingList.map((generation) => [generation.id, generation]),
  );
  const incomingIds = new Set<string>();
  const merged = incomingList.map((generation) => {
    incomingIds.add(generation.id);
    return mergeGeneration(
      existingMap.get(generation.id),
      generation,
      versionId,
      warnings,
    );
  });

  for (const generation of existingList) {
    if (!incomingIds.has(generation.id)) {
      merged.push(generation);
    }
  }

  return merged;
};

export function enforceImmutableVersions(
  entry: PromptHistoryEntry | null | undefined,
  versions: PromptVersionEntry[],
): { versions: PromptVersionEntry[]; warnings: ImmutableMediaWarning[] } {
  const warnings: ImmutableMediaWarning[] = [];
  if (!Array.isArray(versions) || versions.length === 0) {
    return { versions, warnings };
  }

  const existingVersions = Array.isArray(entry?.versions)
    ? entry?.versions
    : [];
  if (!existingVersions.length) {
    return { versions, warnings };
  }

  const existingMap = new Map(
    existingVersions.map((version) => [version.versionId, version]),
  );
  const merged = versions.map((version) => {
    const existing = existingMap.get(version.versionId);
    if (!existing) return version;
    const firstFrame = mergePreview(
      existing.firstFrame,
      version.firstFrame,
      version.versionId,
      warnings,
    );
    const video = mergeVideo(
      existing.video,
      version.video,
      version.versionId,
      warnings,
    );
    const generations = mergeGenerations(
      existing.generations,
      version.generations,
      version.versionId,
      warnings,
    );
    return {
      ...version,
      ...(firstFrame != null ? { firstFrame } : {}),
      ...(video != null ? { video } : {}),
      ...(generations != null ? { generations } : {}),
    };
  });

  const incomingIds = new Set(versions.map((version) => version.versionId));
  for (const existingVersion of existingVersions) {
    if (!incomingIds.has(existingVersion.versionId)) {
      merged.push(existingVersion);
    }
  }

  return { versions: merged, warnings };
}

const resolveKeyframeKey = (keyframe: PromptKeyframe): string | null => {
  if (isNonEmptyString(keyframe.id)) return keyframe.id;
  if (isNonEmptyString(keyframe.storagePath)) return keyframe.storagePath;
  if (isNonEmptyString(keyframe.url)) return keyframe.url;
  return null;
};

export function enforceImmutableKeyframes(
  existing: PromptKeyframe[] | null | undefined,
  incoming: PromptKeyframe[] | null | undefined,
): {
  keyframes: PromptKeyframe[] | null | undefined;
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

  const existingMap = new Map<string, PromptKeyframe>();
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
