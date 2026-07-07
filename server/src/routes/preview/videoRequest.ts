import { pipeline } from "node:stream/promises";
import type { Response } from "express";
import { isKnownGenerationModelInput } from "@config/videoModelRegistry";

export type VideoAspectRatio = "16:9" | "9:16" | "21:9" | "1:1";

export interface VideoPreviewPayload {
  prompt: string;
  aspectRatio?: VideoAspectRatio;
  model?: string;
  startImage?: string;
  endImage?: string;
  referenceImages?: Array<{ url: string; type: "asset" | "style" }>;
  extendVideoUrl?: string;
  inputReference?: string;
  generationParams?: unknown;
  characterAssetId?: string;
  autoKeyframe?: boolean;
  faceSwapAlreadyApplied?: boolean;
  // ISSUE-12: when both provided, the worker's processVideoJob pipeline
  // appends the completed generation to the named session version after
  // successful markCompleted. Matches the storyboard handler behaviour.
  sessionId?: string;
  promptVersionId?: string;
  // M5 / ADR-0013: the source picture's generation id, persisted as the clip
  // record's ancestorGenerationId so the space draws the picture→clip edge.
  sourceGenerationId?: string;
}

interface VideoPreviewParseSuccess {
  ok: true;
  payload: VideoPreviewPayload;
}

interface VideoPreviewParseFailure {
  ok: false;
  status: number;
  error: string;
}

export type VideoPreviewParseResult =
  | VideoPreviewParseSuccess
  | VideoPreviewParseFailure;

const VIDEO_ASPECT_RATIOS = new Set<VideoAspectRatio>([
  "16:9",
  "9:16",
  "21:9",
  "1:1",
]);

export const parseVideoPreviewRequest = (
  body: unknown,
): VideoPreviewParseResult => {
  const {
    prompt,
    aspectRatio,
    model,
    startImage,
    endImage,
    referenceImages,
    extendVideoUrl,
    inputReference,
    generationParams,
    characterAssetId,
    autoKeyframe,
    faceSwapAlreadyApplied,
    sessionId,
    promptVersionId,
    sourceGenerationId,
  } = (body || {}) as {
    prompt?: unknown;
    aspectRatio?: unknown;
    model?: unknown;
    startImage?: unknown;
    endImage?: unknown;
    referenceImages?: unknown;
    extendVideoUrl?: unknown;
    inputReference?: unknown;
    generationParams?: unknown;
    characterAssetId?: unknown;
    autoKeyframe?: unknown;
    faceSwapAlreadyApplied?: unknown;
    sessionId?: unknown;
    promptVersionId?: unknown;
    sourceGenerationId?: unknown;
  };

  if (prompt !== undefined && typeof prompt !== "string") {
    return {
      ok: false,
      status: 400,
      error: "Prompt must be a string",
    };
  }

  const promptTrimmedLen =
    typeof prompt === "string" ? prompt.trim().length : 0;
  const startImageIsNonEmptyString =
    typeof startImage === "string" && startImage.trim().length > 0;

  if (promptTrimmedLen === 0 && !startImageIsNonEmptyString) {
    return {
      ok: false,
      status: 400,
      error: "Prompt must be a non-empty string when no startImage is provided",
    };
  }

  const resolvedPrompt: string = typeof prompt === "string" ? prompt : "";

  let resolvedAspectRatio: VideoAspectRatio | undefined;
  if (aspectRatio !== undefined) {
    if (typeof aspectRatio !== "string") {
      return { ok: false, status: 400, error: "aspectRatio must be a string" };
    }
    const trimmedAspectRatio = aspectRatio.trim();
    if (!VIDEO_ASPECT_RATIOS.has(trimmedAspectRatio as VideoAspectRatio)) {
      return {
        ok: false,
        status: 400,
        error: "aspectRatio must be one of: 16:9, 9:16, 21:9, 1:1",
      };
    }
    resolvedAspectRatio = trimmedAspectRatio as VideoAspectRatio;
  }

  let resolvedModel: string | undefined;
  if (model !== undefined) {
    if (typeof model !== "string") {
      return { ok: false, status: 400, error: "model must be a string" };
    }
    const trimmedModel = model.trim();
    if (trimmedModel.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "model must be a non-empty string",
      };
    }
    if (
      trimmedModel.toLowerCase() !== "auto" &&
      !isKnownGenerationModelInput(trimmedModel)
    ) {
      return {
        ok: false,
        status: 400,
        error: `Unknown model: ${trimmedModel}`,
      };
    }
    resolvedModel = trimmedModel;
  }

  if (startImage !== undefined && typeof startImage !== "string") {
    return { ok: false, status: 400, error: "startImage must be a string URL" };
  }

  if (inputReference !== undefined && typeof inputReference !== "string") {
    return {
      ok: false,
      status: 400,
      error: "inputReference must be a string URL",
    };
  }

  if (endImage !== undefined && typeof endImage !== "string") {
    return { ok: false, status: 400, error: "endImage must be a string URL" };
  }

  if (extendVideoUrl !== undefined && typeof extendVideoUrl !== "string") {
    return {
      ok: false,
      status: 400,
      error: "extendVideoUrl must be a string URL",
    };
  }

  if (referenceImages !== undefined) {
    if (!Array.isArray(referenceImages)) {
      return {
        ok: false,
        status: 400,
        error: "referenceImages must be an array",
      };
    }
    if (referenceImages.length > 3) {
      return {
        ok: false,
        status: 400,
        error: "referenceImages supports a maximum of 3 items",
      };
    }
    for (const ref of referenceImages) {
      if (!ref || typeof ref !== "object") {
        return {
          ok: false,
          status: 400,
          error: "Each referenceImages entry must be an object",
        };
      }
      const typed = ref as { url?: unknown; type?: unknown };
      if (typeof typed.url !== "string" || typed.url.trim().length === 0) {
        return {
          ok: false,
          status: 400,
          error: "Each referenceImages entry requires a non-empty url",
        };
      }
      if (typed.type !== "asset" && typed.type !== "style") {
        return {
          ok: false,
          status: 400,
          error: 'Each referenceImages type must be \"asset\" or \"style\"',
        };
      }
    }
  }

  if (characterAssetId !== undefined && typeof characterAssetId !== "string") {
    return {
      ok: false,
      status: 400,
      error: "characterAssetId must be a string",
    };
  }

  if (autoKeyframe !== undefined && typeof autoKeyframe !== "boolean") {
    return { ok: false, status: 400, error: "autoKeyframe must be a boolean" };
  }

  if (
    faceSwapAlreadyApplied !== undefined &&
    typeof faceSwapAlreadyApplied !== "boolean"
  ) {
    return {
      ok: false,
      status: 400,
      error: "faceSwapAlreadyApplied must be a boolean",
    };
  }

  const resolvedCharacterAssetId =
    typeof characterAssetId === "string" && characterAssetId.trim().length > 0
      ? characterAssetId.trim()
      : undefined;
  const resolvedAutoKeyframe = autoKeyframe !== false;
  const resolvedFaceSwapAlreadyApplied = faceSwapAlreadyApplied === true;

  if (sessionId !== undefined && typeof sessionId !== "string") {
    return { ok: false, status: 400, error: "sessionId must be a string" };
  }
  const resolvedSessionId =
    typeof sessionId === "string" && sessionId.trim().length > 0
      ? sessionId.trim()
      : undefined;

  if (promptVersionId !== undefined && typeof promptVersionId !== "string") {
    return {
      ok: false,
      status: 400,
      error: "promptVersionId must be a string",
    };
  }
  const resolvedPromptVersionId =
    typeof promptVersionId === "string" && promptVersionId.trim().length > 0
      ? promptVersionId.trim()
      : undefined;

  if (
    sourceGenerationId !== undefined &&
    typeof sourceGenerationId !== "string"
  ) {
    return {
      ok: false,
      status: 400,
      error: "sourceGenerationId must be a string",
    };
  }
  const resolvedSourceGenerationId =
    typeof sourceGenerationId === "string" &&
    sourceGenerationId.trim().length > 0
      ? sourceGenerationId.trim()
      : undefined;

  return {
    ok: true,
    payload: {
      prompt: resolvedPrompt,
      ...(resolvedAspectRatio ? { aspectRatio: resolvedAspectRatio } : {}),
      ...(resolvedModel ? { model: resolvedModel } : {}),
      ...(startImage ? { startImage } : {}),
      ...(endImage ? { endImage } : {}),
      ...(referenceImages?.length ? { referenceImages } : {}),
      ...(extendVideoUrl ? { extendVideoUrl } : {}),
      ...(inputReference ? { inputReference } : {}),
      ...(generationParams !== undefined ? { generationParams } : {}),
      ...(resolvedCharacterAssetId
        ? { characterAssetId: resolvedCharacterAssetId }
        : {}),
      autoKeyframe: resolvedAutoKeyframe,
      ...(resolvedFaceSwapAlreadyApplied
        ? { faceSwapAlreadyApplied: true }
        : {}),
      ...(resolvedSessionId ? { sessionId: resolvedSessionId } : {}),
      ...(resolvedPromptVersionId
        ? { promptVersionId: resolvedPromptVersionId }
        : {}),
      ...(resolvedSourceGenerationId
        ? { sourceGenerationId: resolvedSourceGenerationId }
        : {}),
    },
  };
};

export const sendVideoContent = async (
  res: Response,
  entry: {
    contentType: string;
    stream: NodeJS.ReadableStream;
    contentLength?: number;
  },
): Promise<void> => {
  res.setHeader("Content-Type", entry.contentType);
  if (entry.contentLength) {
    res.setHeader("Content-Length", String(entry.contentLength));
  }
  res.setHeader("Cache-Control", "private, max-age=600");

  try {
    await pipeline(entry.stream, res);
  } catch (error) {
    if (res.headersSent) {
      const streamError =
        error instanceof Error ? error : new Error(String(error));
      res.destroy(streamError);
    }
    throw error;
  }
};
