import type { PreviewRoutesServices } from "@routes/types";
import { GENERATION_ERROR_CODES } from "@routes/generationErrorCodes";
import type { VideoErrorResult } from "./video-generate/types";

/** Refuse foreign/partial session destinations before any provider dispatch. */
export async function validateGenerationDestination(
  sessionService: PreviewRoutesServices["sessionService"],
  userId: string,
  input: {
    sessionId?: unknown;
    promptVersionId?: unknown;
    sourceGenerationId?: unknown;
  },
): Promise<VideoErrorResult | null> {
  const { sessionId, promptVersionId, sourceGenerationId } = input;
  if (
    sessionId === undefined &&
    promptVersionId === undefined &&
    sourceGenerationId === undefined
  )
    return null;
  if (
    typeof sessionId !== "string" ||
    !sessionId.trim() ||
    typeof promptVersionId !== "string" ||
    !promptVersionId.trim()
  )
    return {
      status: 400,
      payload: {
        error: "Session and words-version must be supplied together",
        code: GENERATION_ERROR_CODES.INVALID_REQUEST,
      },
    };
  if (!sessionService)
    return {
      status: 503,
      payload: {
        error: "Session persistence is unavailable",
        code: GENERATION_ERROR_CODES.SERVICE_UNAVAILABLE,
      },
    };
  try {
    const owned = await sessionService.requireOwnedSession(userId, sessionId);
    if (sourceGenerationId !== undefined) {
      const found =
        typeof sourceGenerationId === "string" &&
        owned.prompt?.versions?.some((version) =>
          version.generations?.some(
            (generation) =>
              generation.id === sourceGenerationId &&
              generation.mediaType === "image" &&
              generation.archived !== true,
          ),
        );
      if (!found)
        return {
          status: 404,
          payload: {
            error: "Source picture is not available in this session",
            code: GENERATION_ERROR_CODES.INVALID_REQUEST,
          },
        };
    }
    return null;
  } catch {
    return {
      status: 404,
      payload: {
        error: "Session not found",
        code: GENERATION_ERROR_CODES.INVALID_REQUEST,
      },
    };
  }
}
