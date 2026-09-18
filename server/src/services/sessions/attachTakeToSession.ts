import { logger } from "@infrastructure/Logger";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";

/**
 * The one place a completed take is handed to its session, and the one place
 * that decides what a failure there means — ADR-0022 decision 6.
 *
 * Every writer used to own a private copy of that decision as a swallowed
 * catch, so "did the take attach" was answerable only by its absence. The
 * decision is stated here once instead: an attachment never throws, it
 * *reports*, and a failure is a tracked state rather than a lost write.
 *
 * Why this is not the durable-copy policy one layer up: the storage copy is a
 * post-completion step that must fail loudly and refund (pinned by
 * `inlineProcessor.durable-copy.regression.test.ts` — "a completed render is
 * copied ... as a REQUIRED step ... If that copy fails, the job must FAIL and
 * refund"). Attachment sits one step further on and differs on exactly one
 * point: the media is already durable and already paid for. Failing the
 * generation to punish a session write would destroy a picture the creator
 * owns. So the honest outcome is "made but not saved, retry it" — never a
 * refund, never a re-render, never a reopened job.
 */
export interface SessionAppendPort {
  appendGenerationToVersion(
    userId: string,
    sessionId: string,
    promptVersionId: string,
    generation: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface AttachTakeRequest {
  sessionService: SessionAppendPort;
  userId: string;
  sessionId: string;
  promptVersionId: string;
  /**
   * The record to write, built by the caller and carrying the take identity.
   * It is echoed back on failure so a retry re-sends this exact record rather
   * than minting a second take for the same media.
   */
  record: Record<string, unknown>;
  /** Names the writer in logs — "Quick picture", "Video job", … */
  logLabel: string;
}

/**
 * Attempt the append and report the outcome. Resolves in every case; the
 * `record` rides along only while the attachment is unresolved, because that is
 * the only time anyone needs it back.
 */
export async function attachTakeToSession({
  sessionService,
  userId,
  sessionId,
  promptVersionId,
  record,
  logLabel,
}: AttachTakeRequest): Promise<TakeAttachment> {
  const generationId = typeof record.id === "string" ? record.id : "";

  try {
    await sessionService.appendGenerationToVersion(
      userId,
      sessionId,
      promptVersionId,
      record,
    );
    logger.info(`${logLabel} attached to session`, {
      userId,
      sessionId,
      promptVersionId,
      generationId,
    });
    return { state: "attached", generationId, sessionId, promptVersionId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(
      `${logLabel} attachment failed; media is durable but the take is not in its session`,
      error instanceof Error ? error : new Error(reason),
      { userId, sessionId, promptVersionId, generationId },
    );
    return {
      state: "failed",
      generationId,
      sessionId,
      promptVersionId,
      reason,
      record,
    };
  }
}
