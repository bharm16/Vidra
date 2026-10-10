import type { VideoJobError } from "./types";

export type VideoJobErrorInput =
  | string
  | {
      message: string;
      code?: string | undefined;
      category?: VideoJobError["category"] | undefined;
      retryable?: boolean | undefined;
      stage?: VideoJobError["stage"] | undefined;
      provider?: string | undefined;
      attempt?: number | undefined;
    };

export function toVideoJobError(error: VideoJobErrorInput): VideoJobError {
  if (typeof error === "string") {
    return { message: error };
  }
  return {
    message: error.message,
    ...(error.code ? { code: error.code } : {}),
    ...(error.category ? { category: error.category } : {}),
    ...(typeof error.retryable === "boolean"
      ? { retryable: error.retryable }
      : {}),
    ...(error.stage ? { stage: error.stage } : {}),
    ...(error.provider ? { provider: error.provider } : {}),
    ...(typeof error.attempt === "number" ? { attempt: error.attempt } : {}),
  };
}

export function resolvePositiveInt(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Number.parseInt(String(value), 10)
    : fallback;
}
