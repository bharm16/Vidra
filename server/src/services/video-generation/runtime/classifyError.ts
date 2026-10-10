import type {
  VideoJobError,
  VideoJobErrorCategory,
  VideoJobErrorStage,
  VideoJobRequest,
} from "./types";

export interface StageAwareError extends Error {
  stage: VideoJobErrorStage;
}

export function withStage(
  error: unknown,
  stage: VideoJobErrorStage,
): StageAwareError {
  if (error instanceof Error) {
    const stageError = error as StageAwareError;
    stageError.stage = stage;
    return stageError;
  }
  const stageError = new Error(String(error)) as StageAwareError;
  stageError.stage = stage;
  return stageError;
}

export function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface ClassifyErrorInput {
  request: VideoJobRequest;
  attempts: number;
}

export function classifyError(
  error: StageAwareError,
  job: ClassifyErrorInput,
): VideoJobError {
  const message = normalizeErrorMessage(error);
  const lowered = message.toLowerCase();
  const stage = error.stage || "unknown";
  const provider =
    typeof job.request.options?.model === "string"
      ? job.request.options.model
      : undefined;

  let category: VideoJobErrorCategory = "unknown";
  let code = "VIDEO_JOB_FAILED";
  let retryable = true;

  if (stage === "persistence") {
    category = "storage";
    code = "VIDEO_JOB_STORAGE_FAILED";
    retryable = true;
  } else if (
    lowered.includes("timeout") ||
    lowered.includes("timed out") ||
    lowered.includes("etimedout")
  ) {
    category = "timeout";
    code = "VIDEO_JOB_TIMEOUT";
    retryable = true;
  } else if (
    lowered.includes("rate limit") ||
    lowered.includes("429") ||
    lowered.includes("unavailable") ||
    lowered.includes("temporar")
  ) {
    category = "provider";
    code = "VIDEO_JOB_PROVIDER_RETRYABLE";
    retryable = true;
  } else if (
    lowered.includes("invalid") ||
    lowered.includes("unsupported") ||
    lowered.includes("validation") ||
    lowered.includes("bad request")
  ) {
    category = "validation";
    code = "VIDEO_JOB_VALIDATION_FAILED";
    retryable = false;
  } else if (stage === "generation") {
    category = "provider";
    code = "VIDEO_JOB_PROVIDER_FAILED";
    retryable = true;
  } else {
    category = "infrastructure";
    code = "VIDEO_JOB_INFRA_FAILED";
    retryable = true;
  }

  return {
    message,
    code,
    category,
    retryable,
    stage,
    ...(provider ? { provider } : {}),
    attempt: job.attempts,
  };
}
