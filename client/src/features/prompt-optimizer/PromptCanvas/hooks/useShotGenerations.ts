import { useCallback, useMemo } from "react";
import type {
  ContinuityShot,
  UpdateShotInput,
} from "@/features/continuity/types";
import { createHighlightSignature } from "@/features/span-highlighting";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import type { Generation } from "@features/generations/types";
import {
  mapShotStatusToGenerationStatus,
  resolveVersionTimestamp,
} from "../utils/versioning";

interface UseShotGenerationsOptions {
  currentShot: ContinuityShot | null;
  updateShot: (
    shotId: string,
    updates: UpdateShotInput,
  ) => Promise<ContinuityShot>;
}

interface UseShotGenerationsResult {
  shotId: string | null;
  shotPromptEntry: PromptHistoryEntry | null;
  updateShotVersions: (versions: PromptVersionEntry[]) => void;
}

interface VersionMediaSnapshot {
  previewImageUrl: string | null;
  videoUrl: string | null;
  videoStoragePath: string | null;
  videoAssetId: string | null;
}

const normalizeNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const resolveLatestVersionMediaSnapshot = (
  versions: PromptVersionEntry[] | undefined,
): VersionMediaSnapshot => {
  if (!Array.isArray(versions) || versions.length === 0) {
    return {
      previewImageUrl: null,
      videoUrl: null,
      videoStoragePath: null,
      videoAssetId: null,
    };
  }

  for (let index = versions.length - 1; index >= 0; index -= 1) {
    const version = versions[index];
    if (!version || typeof version !== "object") continue;

    const previewImageUrl = normalizeNonEmptyString(version.firstFrame?.imageUrl);
    const videoUrl = normalizeNonEmptyString(version.video?.videoUrl);
    const videoStoragePath = normalizeNonEmptyString(
      version.video?.storagePath,
    );
    const videoAssetId = normalizeNonEmptyString(version.video?.assetId);

    if (previewImageUrl || videoUrl || videoStoragePath || videoAssetId) {
      return {
        previewImageUrl,
        videoUrl,
        videoStoragePath,
        videoAssetId,
      };
    }
  }

  return {
    previewImageUrl: null,
    videoUrl: null,
    videoStoragePath: null,
    videoAssetId: null,
  };
};

export function useShotGenerations({
  currentShot,
  updateShot,
}: UseShotGenerationsOptions): UseShotGenerationsResult {
  const shotId = currentShot?.id ?? null;
  const typedVersions = useMemo(
    () =>
      (currentShot?.versions as unknown as PromptVersionEntry[] | undefined) ??
      [],
    [currentShot?.versions],
  );
  const versionMediaSnapshot = useMemo(
    () => resolveLatestVersionMediaSnapshot(typedVersions),
    [typedVersions],
  );

  const sequenceGenerationVersionId = useMemo(() => {
    if (!currentShot) return null;
    const existing = typedVersions.length
      ? typedVersions[typedVersions.length - 1]?.versionId
      : undefined;
    return existing ?? `shot-${currentShot.id}`;
  }, [currentShot, typedVersions]);

  const sequenceVideoUrl = useMemo(() => {
    if (versionMediaSnapshot.videoUrl) return versionMediaSnapshot.videoUrl;
    if (!currentShot?.videoAssetId) return null;
    return `/api/preview/video/content/${currentShot.videoAssetId}`;
  }, [currentShot?.videoAssetId, versionMediaSnapshot.videoUrl]);

  const sequenceVideoRef = useMemo(
    () =>
      versionMediaSnapshot.videoStoragePath ??
      versionMediaSnapshot.videoAssetId ??
      currentShot?.videoAssetId ??
      null,
    [
      currentShot?.videoAssetId,
      versionMediaSnapshot.videoAssetId,
      versionMediaSnapshot.videoStoragePath,
    ],
  );

  const sequenceThumbnailUrl = useMemo(
    () =>
      normalizeNonEmptyString(currentShot?.generatedKeyframeUrl) ??
      versionMediaSnapshot.previewImageUrl ??
      null,
    [currentShot?.generatedKeyframeUrl, versionMediaSnapshot.previewImageUrl],
  );

  const sequenceGenerations = useMemo<Generation[]>(() => {
    if (!currentShot || !sequenceGenerationVersionId) return [];
    const status = mapShotStatusToGenerationStatus(currentShot.status);
    const hasOutput = Boolean(
      sequenceVideoUrl || sequenceVideoRef || sequenceThumbnailUrl,
    );
    const shouldRender = hasOutput || status !== "pending";
    if (!shouldRender) return [];
    const createdAtMs =
      resolveVersionTimestamp(currentShot.createdAt) ?? Date.now();
    const completedAtMs =
      resolveVersionTimestamp(currentShot.generatedAt) ??
      (status === "completed" ? createdAtMs : null);
    return [
      {
        id: currentShot.id,
        tier: "render",
        status,
        model: currentShot.modelId,
        prompt: currentShot.userPrompt ?? "",
        promptVersionId: sequenceGenerationVersionId,
        createdAt: createdAtMs,
        completedAt: completedAtMs,
        mediaType: "video",
        mediaUrls: sequenceVideoUrl ? [sequenceVideoUrl] : [],
        ...(sequenceVideoRef ? { mediaAssetIds: [sequenceVideoRef] } : {}),
        thumbnailUrl: sequenceThumbnailUrl,
      },
    ];
  }, [
    currentShot,
    sequenceGenerationVersionId,
    sequenceThumbnailUrl,
    sequenceVideoRef,
    sequenceVideoUrl,
  ]);

  const sequenceVersions = useMemo<PromptVersionEntry[]>(() => {
    if (!currentShot) return [];
    const existing = typedVersions;
    if (existing.length > 0) {
      if (
        sequenceGenerations.length > 0 &&
        !existing.some(
          (version) =>
            Array.isArray(version.generations) &&
            version.generations.length > 0,
        )
      ) {
        const patched = [...existing];
        const targetIndex = patched.length - 1;
        const target = patched[targetIndex];
        if (target) {
          patched[targetIndex] = {
            ...target,
            generations: sequenceGenerations,
          };
          return patched;
        }
      }
      return existing;
    }
    if (!sequenceGenerations.length || !sequenceGenerationVersionId) return [];
    const promptText = currentShot.userPrompt ?? "";
    const signature = createHighlightSignature(promptText);
    const rawTimestamp =
      currentShot.generatedAt ??
      currentShot.createdAt ??
      new Date().toISOString();
    const timestamp =
      typeof rawTimestamp === "string" && rawTimestamp.trim()
        ? rawTimestamp
        : new Date().toISOString();
    return [
      {
        versionId: sequenceGenerationVersionId,
        label: "v1",
        signature,
        prompt: promptText,
        timestamp,
        ...(currentShot.generatedKeyframeUrl
          ? {
              firstFrame: {
                generatedAt: timestamp,
                imageUrl: currentShot.generatedKeyframeUrl,
                aspectRatio: null,
              },
            }
          : {}),
        ...(sequenceVideoUrl
          ? {
              video: {
                generatedAt: timestamp,
                videoUrl: sequenceVideoUrl,
                model: currentShot.modelId ?? null,
                generationParams: null,
              },
            }
          : {}),
        generations: sequenceGenerations,
      },
    ];
  }, [
    currentShot,
    sequenceGenerationVersionId,
    sequenceGenerations,
    sequenceVideoUrl,
    typedVersions,
  ]);

  const shotPromptEntry = useMemo<PromptHistoryEntry | null>(() => {
    if (!currentShot) return null;
    return {
      uuid: currentShot.id,
      input: currentShot.userPrompt ?? "",
      output: "",
      versions: sequenceVersions,
    };
  }, [currentShot, sequenceVersions]);

  const updateShotVersions = useCallback(
    (versions: PromptVersionEntry[]) => {
      if (!shotId) return;
      const normalizedVersions = versions as unknown as NonNullable<
        UpdateShotInput["versions"]
      >;
      void updateShot(shotId, {
        versions: normalizedVersions,
      });
    },
    [shotId, updateShot],
  );

  return {
    shotId,
    shotPromptEntry,
    updateShotVersions,
  };
}
