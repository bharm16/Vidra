import type { KeyframeTile } from "@features/generation-controls";
import type { PromptKeyframe } from "@features/prompt-optimizer/types/domain/prompt-session";

const MAX_KEYFRAMES = 3;

const createKeyframeId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `keyframe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeForCompare = (
  keyframes: Array<PromptKeyframe | KeyframeTile> | null | undefined,
): Array<{ url: string; source: string; assetId: string | null }> => {
  if (!Array.isArray(keyframes)) {
    return [];
  }
  return keyframes
    .filter((frame) => typeof frame?.url === "string" && frame.url.trim())
    .slice(0, MAX_KEYFRAMES)
    .map((frame) => ({
      url:
        typeof frame.storagePath === "string" &&
        frame.storagePath.trim().length > 0
          ? frame.storagePath
          : frame.url,
      source: frame.source ?? "",
      assetId: frame.assetId ?? null,
    }));
};

export const serializeKeyframes = (
  keyframes: KeyframeTile[] | null | undefined,
): PromptKeyframe[] => {
  if (!Array.isArray(keyframes)) {
    return [];
  }
  return keyframes.slice(0, MAX_KEYFRAMES).map((frame) => ({
    id: frame.id,
    url: frame.url,
    source: frame.source,
    ...(frame.assetId ? { assetId: frame.assetId } : {}),
    ...(frame.storagePath ? { storagePath: frame.storagePath } : {}),
    ...(frame.viewUrlExpiresAt
      ? { viewUrlExpiresAt: frame.viewUrlExpiresAt }
      : {}),
    ...(frame.generationId ? { generationId: frame.generationId } : {}),
    ...(frame.sourcePrompt ? { sourcePrompt: frame.sourcePrompt } : {}),
  }));
};

export const hydrateKeyframes = (
  keyframes: PromptKeyframe[] | null | undefined,
): KeyframeTile[] => {
  if (!Array.isArray(keyframes)) {
    return [];
  }
  return keyframes
    .filter((frame) => typeof frame?.url === "string" && frame.url.trim())
    .slice(0, MAX_KEYFRAMES)
    .map((frame) => ({
      id: frame.id ?? createKeyframeId(),
      url: frame.url,
      source: frame.source ?? "upload",
      ...(frame.assetId ? { assetId: frame.assetId } : {}),
      ...(frame.storagePath ? { storagePath: frame.storagePath } : {}),
      ...(frame.viewUrlExpiresAt
        ? { viewUrlExpiresAt: frame.viewUrlExpiresAt }
        : {}),
      ...(frame.generationId ? { generationId: frame.generationId } : {}),
      ...(frame.sourcePrompt ? { sourcePrompt: frame.sourcePrompt } : {}),
    }));
};

export const areKeyframesEqual = (
  left: Array<PromptKeyframe | KeyframeTile> | null | undefined,
  right: Array<PromptKeyframe | KeyframeTile> | null | undefined,
): boolean => {
  const leftNormalized = normalizeForCompare(left);
  const rightNormalized = normalizeForCompare(right);
  if (leftNormalized.length !== rightNormalized.length) {
    return false;
  }
  for (let i = 0; i < leftNormalized.length; i += 1) {
    const leftFrame = leftNormalized[i];
    const rightFrame = rightNormalized[i];
    if (!leftFrame || !rightFrame) return false;
    if (leftFrame.url !== rightFrame.url) return false;
    if (leftFrame.source !== rightFrame.source) return false;
    if ((leftFrame.assetId ?? null) !== (rightFrame.assetId ?? null))
      return false;
  }
  return true;
};

/**
 * The persisted view of a session's keyframes: the armed start frame leads,
 * remaining keyframes follow (deduped by media identity). Persisting through
 * this view is what makes the armed frame a session fact rather than a
 * memory-only one (ADR-0011 D4) — hydration's keyframes[0]→startFrame
 * contract depends on the armed frame heading the array.
 */
export const withStartFrameFirst = (
  startFrame: KeyframeTile | null,
  keyframes: KeyframeTile[],
): KeyframeTile[] => {
  if (!startFrame) return keyframes;
  const rest = keyframes.filter(
    (frame) => !areKeyframesEqual([frame], [startFrame]),
  );
  return [startFrame, ...rest];
};
