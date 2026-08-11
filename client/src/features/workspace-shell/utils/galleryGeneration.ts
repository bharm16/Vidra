import type { PromptVersionEntry } from "@features/prompt-optimizer";
import {
  deriveGenerationTier,
  getModelConfig,
} from "@features/generations/config/generationConfig";
import type { Generation } from "@features/generations/types";
import { resolveTakePosterUrl } from "./takePosterUrl";
import type {
  GalleryGeneration,
  GalleryPromptSpan,
  GalleryTier,
} from "@/features/prompt-optimizer/components/GalleryPanel";

interface GalleryGenerationEntry {
  gallery: GalleryGeneration;
  generation: Generation;
}

interface BuildGalleryGenerationEntriesOptions {
  versions: PromptVersionEntry[];
  runtimeGenerations: Generation[];
}

type VersionGenerationSource = {
  generation: Generation;
  promptSpans: GalleryPromptSpan[];
  versionTimestamp: number | null;
  versionPreviewImageUrl: string | null;
  versionPreviewAssetId: string | null;
};

const resolveTimestamp = (
  generation: Generation,
  versionTimestamp: number | null,
): number =>
  generation.completedAt ??
  generation.createdAt ??
  versionTimestamp ??
  Date.now();

const normalizeNonEmpty = (value: string | null | undefined): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const toEpochMs = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildVersionMediaFallbackGeneration = (
  version: PromptVersionEntry,
): Generation | null => {
  const videoUrl = normalizeNonEmpty(version.video?.videoUrl ?? null);
  const previewUrl = normalizeNonEmpty(version.firstFrame?.imageUrl ?? null);

  if (!videoUrl && !previewUrl) {
    return null;
  }

  const mediaType: Generation["mediaType"] = videoUrl ? "video" : "image";
  const mediaUrl = videoUrl ?? previewUrl;
  if (!mediaUrl) return null;

  const model = normalizeNonEmpty(version.video?.model ?? null) ?? "unknown";

  const mediaRef = videoUrl
    ? normalizeNonEmpty(
        version.video?.storagePath ?? version.video?.assetId ?? null,
      )
    : normalizeNonEmpty(
        version.firstFrame?.storagePath ?? version.firstFrame?.assetId ?? null,
      );

  const completedAt = toEpochMs(
    (videoUrl ? version.video?.generatedAt : version.firstFrame?.generatedAt) ??
      version.timestamp,
  );
  const createdAt = toEpochMs(version.timestamp) ?? completedAt ?? Date.now();

  return {
    id: `version-media-${version.versionId}`,
    // Derived like every other take (ADR-0021). This used to be a hardcoded
    // "render", which badged the same clip differently depending on whether it
    // was reached through its generation record or through this fallback.
    tier: deriveGenerationTier(model),
    status: "completed",
    model,
    prompt: version.prompt ?? "",
    promptVersionId: version.versionId,
    createdAt,
    completedAt: completedAt ?? createdAt,
    mediaType,
    mediaUrls: [mediaUrl],
    ...(mediaRef ? { mediaAssetIds: [mediaRef] } : {}),
    ...(videoUrl && previewUrl ? { thumbnailUrl: previewUrl } : {}),
    ...(version.video?.generationParams
      ? {
          generationSettings: {
            generationParams: version.video.generationParams,
          },
        }
      : {}),
  };
};

const hasBrowsableMedia = (
  generation: Generation,
  versionPreviewImageUrl: string | null,
): boolean => {
  if (generation.status !== "completed") {
    return false;
  }

  const thumbnailUrl = resolveTakePosterUrl(generation, versionPreviewImageUrl);
  if (thumbnailUrl) {
    return true;
  }

  return generation.mediaUrls.some((url) => normalizeNonEmpty(url) !== null);
};

const parsePromptSpans = (
  highlights: PromptVersionEntry["highlights"],
): GalleryPromptSpan[] => {
  if (!highlights || typeof highlights !== "object") return [];
  if (!Array.isArray((highlights as { spans?: unknown }).spans)) return [];

  const spans = (highlights as { spans: unknown[] }).spans;
  return spans
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") return null;
      const maybe = candidate as {
        start?: unknown;
        end?: unknown;
        category?: unknown;
      };
      if (
        typeof maybe.start !== "number" ||
        typeof maybe.end !== "number" ||
        typeof maybe.category !== "string"
      ) {
        return null;
      }
      if (maybe.start < 0 || maybe.end <= maybe.start) return null;
      return {
        start: maybe.start,
        end: maybe.end,
        category: maybe.category,
      };
    })
    .filter((span): span is GalleryPromptSpan => Boolean(span));
};

const generationCompleteness = (generation: Generation): number => {
  let score = 0;
  if (generation.status === "completed") score += 10;
  if (generation.mediaUrls.length > 0) score += 3;
  if (generation.thumbnailUrl) score += 1;
  if (generation.completedAt) score += 1;
  return score;
};

const mergeGeneration = (
  incoming: Generation,
  existing: Generation,
): Generation => ({
  ...(generationCompleteness(incoming) >= generationCompleteness(existing)
    ? incoming
    : existing),
  isFavorite:
    typeof incoming.isFavorite === "boolean"
      ? incoming.isFavorite
      : typeof existing.isFavorite === "boolean"
        ? existing.isFavorite
        : false,
  generationSettings:
    incoming.generationSettings ?? existing.generationSettings ?? null,
});

const formatDuration = (
  duration: number | null | undefined,
): string | undefined =>
  typeof duration === "number" && Number.isFinite(duration) && duration > 0
    ? `${duration}s`
    : undefined;

const resolveMediaAssetId = (generation: Generation): string | null => {
  const ref = normalizeNonEmpty(generation.mediaAssetIds?.[0] ?? null);
  return ref ?? null;
};

const resolveThumbnailAssetId = (
  generation: Generation,
  versionPreviewAssetId: string | null,
): string | null => {
  // For images the thumbnail IS the primary media, so use its asset ID
  if (generation.mediaType !== "video") {
    return resolveMediaAssetId(generation);
  }
  // For videos prefer the version preview asset ID (image asset)
  return normalizeNonEmpty(versionPreviewAssetId) ?? null;
};

const mapGalleryGeneration = (
  generation: Generation,
  promptSpans: GalleryPromptSpan[],
  versionTimestamp: number | null,
  versionPreviewImageUrl: string | null,
  versionPreviewAssetId: string | null,
): GalleryGeneration => ({
  id: generation.id,
  // Carried straight through: every take's tier is derived from its model at
  // the repository boundary (ADR-0021), so there is nothing left to map.
  tier: generation.tier,
  thumbnailUrl: resolveTakePosterUrl(generation, versionPreviewImageUrl),
  mediaUrl: generation.mediaUrls[0] ?? null,
  mediaType: generation.mediaType,
  prompt: generation.prompt ?? "",
  model: getModelConfig(generation.model)?.label ?? generation.model,
  duration: formatDuration(generation.duration),
  aspectRatio: generation.aspectRatio ?? undefined,
  createdAt: resolveTimestamp(generation, versionTimestamp),
  isFavorite: Boolean(generation.isFavorite),
  generationSettings: generation.generationSettings ?? null,
  promptSpans,
  mediaAssetId: resolveMediaAssetId(generation),
  thumbnailAssetId: resolveThumbnailAssetId(generation, versionPreviewAssetId),
});

export function buildGalleryGenerationEntries({
  versions,
  runtimeGenerations,
}: BuildGalleryGenerationEntriesOptions): GalleryGenerationEntry[] {
  const versionGenerations: VersionGenerationSource[] = [];
  for (const version of versions) {
    const timestamp = Date.parse(version.timestamp);
    const versionTimestamp = Number.isFinite(timestamp) ? timestamp : null;
    const promptSpans = parsePromptSpans(version.highlights);
    const versionPreviewImageUrl = normalizeNonEmpty(
      version.firstFrame?.imageUrl ?? null,
    );
    const versionPreviewAssetId = normalizeNonEmpty(
      version.firstFrame?.assetId ?? null,
    );
    const explicitGenerations =
      Array.isArray(version.generations) && version.generations.length > 0
        ? version.generations
        : null;
    const generations =
      explicitGenerations ??
      (() => {
        const fallback = buildVersionMediaFallbackGeneration(version);
        return fallback ? [fallback] : [];
      })();
    for (const generation of generations) {
      versionGenerations.push({
        generation,
        promptSpans,
        versionTimestamp,
        versionPreviewImageUrl,
        versionPreviewAssetId,
      });
    }
  }

  const mergedById = new Map<string, VersionGenerationSource>();
  for (const source of versionGenerations) {
    mergedById.set(source.generation.id, source);
  }

  for (const generation of runtimeGenerations) {
    const existing = mergedById.get(generation.id);
    if (!existing) {
      mergedById.set(generation.id, {
        generation,
        promptSpans: [],
        versionTimestamp: null,
        versionPreviewImageUrl: null,
        versionPreviewAssetId: null,
      });
      continue;
    }

    mergedById.set(generation.id, {
      ...existing,
      generation: mergeGeneration(generation, existing.generation),
    });
  }

  return Array.from(mergedById.values())
    .filter((source) =>
      hasBrowsableMedia(source.generation, source.versionPreviewImageUrl),
    )
    .map((source) => ({
      gallery: mapGalleryGeneration(
        source.generation,
        source.promptSpans,
        source.versionTimestamp,
        source.versionPreviewImageUrl,
        source.versionPreviewAssetId,
      ),
      generation: source.generation,
    }))
    .sort((left, right) => right.gallery.createdAt - left.gallery.createdAt);
}
