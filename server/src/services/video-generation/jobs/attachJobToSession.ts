import type { ILogger } from "@interfaces/ILogger";
import { RetryPolicy } from "@server/utils/RetryPolicy";
import {
  attachTakeToSession,
  type SessionAppendPort,
} from "@services/sessions/attachTakeToSession";
import { buildCompletedTakeRecord } from "@services/sessions/takeRecord";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";
import type { VideoJobAttachment, VideoJobRecord } from "./types";

/**
 * The clip half of the attachment boundary opened by ADR-0022 decision 6.
 *
 * Shared by the two entry points that own a completed job: `processVideoJob`
 * (worker and inline) runs it once the clip is durable, and
 * `resumePendingAttachments` runs it again for a job whose worker died holding
 * the debt. Both get the same answer because both go through this function.
 *
 * What it must never do — the decision names these explicitly: it never reruns
 * generation, never changes the job's generation outcome, and never invokes
 * refund logic. By the time it runs, `markCompleted` has succeeded and the
 * creator has already paid for a clip that is already in durable storage.
 */
export interface JobAttachmentStore {
  /**
   * Optional so a store that predates this boundary still satisfies the port.
   * Without it the attachment still runs — it simply leaves no durable trace,
   * so it cannot be resumed after a restart.
   */
  setAttachment?(
    jobId: string,
    attachment: VideoJobAttachment,
  ): Promise<boolean | void>;
}

export interface AttachJobRequest {
  job: VideoJobRecord;
  jobStore: JobAttachmentStore;
  sessionService: SessionAppendPort;
  log: Pick<ILogger, "warn">;
  /** Distinguishes worker / inline / resume in log messages. */
  logPrefix: string;
}

/** A job is owed to a session only when it names one. */
export function jobOwesAttachment(job: VideoJobRecord): boolean {
  return Boolean(job.sessionId && job.promptVersionId);
}

/**
 * A clip's take identity is its job id (CONTEXT.md → Take identity), so the
 * record is rebuilt under the same name every time. A resume prefers the record
 * persisted with the pending marker: it was built once, at completion, and
 * re-sending it keeps `completedAt` from drifting on every retry.
 */
function resolveRecord(job: VideoJobRecord): Record<string, unknown> {
  const persisted = job.attachment?.record;
  if (persisted) return persisted;

  return buildCompletedTakeRecord({
    id: job.id,
    model: job.request.options?.model ?? null,
    mediaType: "video",
    prompt: job.request.prompt,
    promptVersionId: job.promptVersionId ?? "",
    mediaUrls: job.result?.videoUrl ? [job.result.videoUrl] : [],
    ...(job.result?.assetId ? { mediaAssetIds: [job.result.assetId] } : {}),
    ...(job.result?.storagePath ? { storagePath: job.result.storagePath } : {}),
    // ADR-0013: name the source picture (or null = root) so the space draws
    // the picture→clip edge from real lineage.
    ancestorGenerationId: job.sourceGenerationId ?? null,
  });
}

/**
 * Attach a completed job's clip to its session and persist the outcome on the
 * job. Returns `null` when the job names no session — there is no attachment
 * fact to report for a clip nobody asked to file.
 */
export async function attachCompletedJobToSession({
  job,
  jobStore,
  sessionService,
  log,
  logPrefix,
}: AttachJobRequest): Promise<TakeAttachment | null> {
  const { sessionId, promptVersionId } = job;
  if (!sessionId || !promptVersionId) return null;

  const record = resolveRecord(job);
  const base = {
    generationId: job.id,
    sessionId,
    promptVersionId,
  };

  // Checkpoint before the attempt, not after it: a worker that dies mid-append
  // must leave behind a job that still says the session is owed this record.
  await persist(jobStore, job.id, { ...base, state: "pending", record }, log);

  let attachment: TakeAttachment;
  try {
    // The same bounded retry the completion write above it already uses — a
    // single Firestore blip should not cost the creator a "not saved" badge.
    attachment = await RetryPolicy.execute(
      async () => {
        const outcome = await attachTakeToSession({
          sessionService,
          userId: job.userId,
          sessionId,
          promptVersionId,
          record,
          logLabel: logPrefix,
        });
        if (outcome.state === "failed") {
          throw new Error(outcome.reason ?? "session append failed");
        }
        return outcome;
      },
      {
        maxRetries: 2,
        getDelayMs: (attempt) => 100 * 2 ** (attempt - 1),
        logRetries: true,
      },
    );
  } catch (error) {
    attachment = {
      ...base,
      state: "failed",
      reason: error instanceof Error ? error.message : String(error),
      record,
    };
  }

  await persist(
    jobStore,
    job.id,
    attachment.state === "attached"
      ? { ...base, state: "attached" }
      : { ...base, state: "failed", reason: attachment.reason ?? "", record },
    log,
  );

  return attachment;
}

/**
 * Persisting the attachment state is itself best-effort, and deliberately so:
 * it is a record ABOUT a write, and failing the clip because we could not
 * annotate it would be the exact inversion this boundary exists to prevent.
 */
async function persist(
  jobStore: JobAttachmentStore,
  jobId: string,
  attachment: Omit<VideoJobAttachment, "updatedAtMs">,
  log: Pick<ILogger, "warn">,
): Promise<void> {
  if (!jobStore.setAttachment) return;
  try {
    await jobStore.setAttachment(jobId, {
      ...attachment,
      updatedAtMs: Date.now(),
    });
  } catch (error) {
    log.warn("Failed to persist clip attachment state", {
      jobId,
      state: attachment.state,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
