import type { Generation } from "@/features/generations/types";

/**
 * Serializes a Generation into a stable JSON string for equality comparison.
 * Fields are listed in a fixed order with null-coalesced defaults to ensure
 * consistent output regardless of optional field presence.
 */
export function serializeGeneration(gen: Generation): string {
  return JSON.stringify({
    id: gen.id,
    status: gen.status,
    tier: gen.tier,
    model: gen.model,
    mediaType: gen.mediaType,
    promptVersionId: gen.promptVersionId ?? null,
    createdAt: gen.createdAt,
    completedAt: gen.completedAt ?? null,
    estimatedCost: gen.estimatedCost ?? null,
    actualCost: gen.actualCost ?? null,
    aspectRatio: gen.aspectRatio ?? null,
    duration: gen.duration ?? null,
    fps: gen.fps ?? null,
    thumbnailUrl: gen.thumbnailUrl ?? null,
    characterAssetId: gen.characterAssetId ?? null,
    faceSwapApplied: gen.faceSwapApplied ?? null,
    faceSwapUrl: gen.faceSwapUrl ?? null,
    serverProgress: gen.serverProgress ?? null,
    serverJobStatus: gen.serverJobStatus ?? null,
    isFavorite: gen.isFavorite ?? false,
    generationSettings: gen.generationSettings ?? null,
    error: gen.error ?? null,
    mediaUrls: gen.mediaUrls ?? [],
    mediaAssetIds: gen.mediaAssetIds ?? [],
  });
}

/**
 * Compares two Generation arrays by serializing each element.
 * Returns true when both arrays contain the same generations in the same order.
 */
export function areGenerationsEqual(
  left?: Generation[] | null,
  right?: Generation[] | null,
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const leftGen = left[i];
    const rightGen = right[i];
    if (!leftGen || !rightGen) return false;
    if (serializeGeneration(leftGen) !== serializeGeneration(rightGen)) {
      return false;
    }
  }
  return true;
}
