import type { DocumentData } from "firebase-admin/firestore";
import { VideoJobRecordSchema } from "./schemas";
import type { VideoJobRecord, VideoJobRequest } from "./types";
import { resolvePositiveInt, toVideoJobError } from "./normalizeError";

export function parseVideoJobRecord(
  id: string,
  data: DocumentData | undefined,
  defaultMaxAttempts: number,
): VideoJobRecord {
  const parsed = VideoJobRecordSchema.parse(data || {});
  const normalizedOptions = Object.fromEntries(
    Object.entries(parsed.request.options ?? {}).filter(
      ([, value]) => value !== undefined,
    ),
  ) as VideoJobRequest["options"];
  const normalizedResult = parsed.result
    ? {
        assetId: parsed.result.assetId,
        videoUrl: parsed.result.videoUrl,
        contentType: parsed.result.contentType,
        ...(parsed.result.inputMode !== undefined
          ? { inputMode: parsed.result.inputMode }
          : {}),
        ...(parsed.result.startImageUrl !== undefined
          ? { startImageUrl: parsed.result.startImageUrl }
          : {}),
        ...(parsed.result.storagePath !== undefined
          ? { storagePath: parsed.result.storagePath }
          : {}),
        ...(parsed.result.viewUrl !== undefined
          ? { viewUrl: parsed.result.viewUrl }
          : {}),
        ...(parsed.result.viewUrlExpiresAt !== undefined
          ? { viewUrlExpiresAt: parsed.result.viewUrlExpiresAt }
          : {}),
        ...(parsed.result.sizeBytes !== undefined
          ? { sizeBytes: parsed.result.sizeBytes }
          : {}),
      }
    : undefined;

  const base: VideoJobRecord = {
    id,
    ...(parsed.schemaVersion !== undefined
      ? { schemaVersion: parsed.schemaVersion }
      : {}),
    status: parsed.status,
    userId: parsed.userId,
    ...(typeof parsed.sessionId === "string"
      ? { sessionId: parsed.sessionId }
      : {}),
    ...(typeof parsed.promptVersionId === "string"
      ? { promptVersionId: parsed.promptVersionId }
      : {}),
    ...(typeof parsed.sourceGenerationId === "string"
      ? { sourceGenerationId: parsed.sourceGenerationId }
      : {}),
    request: {
      ...parsed.request,
      options: normalizedOptions,
    },
    creditsReserved: parsed.creditsReserved,
    ...(typeof parsed.provider === "string"
      ? { provider: parsed.provider }
      : {}),
    attempts: typeof parsed.attempts === "number" ? parsed.attempts : 0,
    maxAttempts: resolvePositiveInt(
      typeof parsed.maxAttempts === "number" ? parsed.maxAttempts : undefined,
      defaultMaxAttempts,
    ),
    createdAtMs: parsed.createdAtMs,
    updatedAtMs: parsed.updatedAtMs,
  };

  if (typeof parsed.completedAtMs === "number") {
    base.completedAtMs = parsed.completedAtMs;
  }
  if (normalizedResult) {
    base.result = normalizedResult;
  }
  if (parsed.error) {
    base.error = toVideoJobError(parsed.error);
  }
  if (typeof parsed.workerId === "string") {
    base.workerId = parsed.workerId;
  }
  if (typeof parsed.leaseExpiresAtMs === "number") {
    base.leaseExpiresAtMs = parsed.leaseExpiresAtMs;
  }
  if (typeof parsed.lastHeartbeatAtMs === "number") {
    base.lastHeartbeatAtMs = parsed.lastHeartbeatAtMs;
  }
  if (typeof parsed.releasedAtMs === "number") {
    base.releasedAtMs = parsed.releasedAtMs;
  }
  if (typeof parsed.releaseReason === "string") {
    base.releaseReason = parsed.releaseReason;
  }
  if (typeof parsed.nextRetryAtMs === "number") {
    base.nextRetryAtMs = parsed.nextRetryAtMs;
  }

  return base;
}
