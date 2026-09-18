import { logger } from "@infrastructure/Logger";
import {
  attachTakeToSession,
  type SessionAppendPort,
} from "./attachTakeToSession";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";

/**
 * The durable half of the attachment boundary for takes the session's own words
 * DID generate — ADR-0022 decision 6, the quick-picture side of the boundary the
 * clip worker's `attachCompletedJobToSession` already owns.
 *
 * A generated picture is not admitted (it never passes through
 * `admitPictureTake`, whose origin set excludes `generated`), so it has no
 * idempotency snapshot to resume from. Before this seam a lost response left
 * nothing server-side that knew the session was owed the take: recovery depended
 * entirely on the client re-posting the record it received, and a dropped
 * response stranded a durable, paid-for picture with no way back to its session.
 *
 * This mirrors the clip half exactly, one store swapped for another:
 *
 *  1. **Checkpoint before the attempt.** A `pending` owed record — carrying the
 *     take identity and the exact record its session is owed — is written BEFORE
 *     the append. A crash or a dropped response after this leaves a durable debt
 *     that a reloaded client can discover and repair, never a silent loss.
 *  2. **Attach, reporting rather than throwing.** `attachTakeToSession` resolves
 *     in every case; a failure is "made but not saved", never a lost write.
 *  3. **Settle the debt.** `attached` clears the owed record (the session is now
 *     the source of truth for the take); `failed` rewrites it as retryable,
 *     keeping the record so a by-id retry re-attaches the SAME take with no
 *     generation and no re-store.
 *
 * The store is optional so a caller without one still attaches — it simply
 * leaves no durable trace and cannot be resumed, exactly as the clip store's
 * `setAttachment?` is optional. Persisting the debt is itself best-effort: a
 * record ABOUT a write must never fail the take it annotates.
 *
 * NOT a decision-8 "operations" entity: this is the attachment's persisted
 * state (pending / attached-cleared / failed-and-retryable) that decision 6
 * explicitly opens, the picture analogue of `video_jobs.attachment`. It records
 * no provenance and schedules no work.
 */
export interface OwedTakeAttachmentInput {
  userId: string;
  generationId: string;
  sessionId: string;
  promptVersionId: string;
  /** Exactly what a retry re-sends: the take's own completed record. */
  record: Record<string, unknown>;
}

/** A single owed (unresolved) take attachment, read back for discovery / retry. */
export interface OwedTakeAttachment {
  userId: string;
  generationId: string;
  sessionId: string;
  promptVersionId: string;
  state: "pending" | "failed";
  reason?: string | undefined;
  record: Record<string, unknown>;
}

/**
 * The durable ledger of takes whose session write is still owed. The Firestore
 * implementation satisfies this; the boundary is tested against an in-memory
 * double, which is why it is a port and not a concrete import.
 */
export interface OwedTakeAttachmentStore {
  /** Checkpoint an owed take as `pending`, before the append is attempted. */
  recordOwedPending(input: OwedTakeAttachmentInput): Promise<void>;
  /**
   * Settle the debt with the attach outcome: `attached` clears the owed record,
   * `failed` rewrites it as retryable (keeping the record).
   */
  settleOwed(
    input: OwedTakeAttachmentInput,
    attachment: TakeAttachment,
  ): Promise<void>;
  /** Every owed take (pending or failed) for one creator's session. */
  listOwedForSession(
    userId: string,
    sessionId: string,
  ): Promise<OwedTakeAttachment[]>;
  /** One owed take by identity, scoped to its owner. */
  getOwned(
    userId: string,
    generationId: string,
  ): Promise<OwedTakeAttachment | undefined>;
}

export interface AttachTakeWithOwedTrackingRequest {
  /** Optional: without it the take still attaches, just without durable resume. */
  store: OwedTakeAttachmentStore | undefined;
  sessionService: SessionAppendPort;
  input: OwedTakeAttachmentInput;
  /** Names the writer in logs — "Quick picture", "Retried picture", … */
  logLabel: string;
}

const log = logger.child({ service: "attachTakeWithOwedTracking" });

async function recordPendingBestEffort(
  store: OwedTakeAttachmentStore | undefined,
  input: OwedTakeAttachmentInput,
): Promise<void> {
  if (!store) return;
  try {
    await store.recordOwedPending(input);
  } catch (error) {
    // A record ABOUT a write must not fail the write. Losing the checkpoint
    // costs this one take its discoverability, never its attachment.
    log.warn("Failed to checkpoint owed take attachment", {
      generationId: input.generationId,
      sessionId: input.sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function settleBestEffort(
  store: OwedTakeAttachmentStore | undefined,
  input: OwedTakeAttachmentInput,
  attachment: TakeAttachment,
): Promise<void> {
  if (!store) return;
  try {
    await store.settleOwed(input, attachment);
  } catch (error) {
    log.warn("Failed to settle owed take attachment", {
      generationId: input.generationId,
      sessionId: input.sessionId,
      state: attachment.state,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Checkpoint the owed take, attach it, and settle the debt with the outcome.
 * Never a generation retry (ADR-0022 decision 6): it re-sends the SAME record
 * under the SAME identity to the de-duplicating session append, so a first
 * attempt and a later repair both write one take rather than a second, and
 * neither reruns generation nor reaches a credit surface.
 */
export async function attachTakeWithOwedTracking({
  store,
  sessionService,
  input,
  logLabel,
}: AttachTakeWithOwedTrackingRequest): Promise<TakeAttachment> {
  await recordPendingBestEffort(store, input);

  const attachment = await attachTakeToSession({
    sessionService,
    userId: input.userId,
    sessionId: input.sessionId,
    promptVersionId: input.promptVersionId,
    record: input.record,
    logLabel,
  });

  await settleBestEffort(store, input, attachment);

  return attachment;
}
