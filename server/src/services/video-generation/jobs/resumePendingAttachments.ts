import { logger } from "@infrastructure/Logger";
import type { SessionAppendPort } from "@services/sessions/attachTakeToSession";
import {
  attachCompletedJobToSession,
  type JobAttachmentStore,
} from "./attachJobToSession";
import type { VideoJobRecord } from "./types";

/**
 * Settle the attachment debts a previous worker died holding — ADR-0022
 * decision 6 ("its resumption after a worker restart").
 *
 * The recovery only works because the pending marker is written BEFORE the
 * append is attempted: a job that says `pending` is a job whose clip is durable
 * and whose session has not been told. Everything needed to finish the job —
 * the session, the version, and the exact record — is on that marker, so this
 * re-sends the same take rather than minting a second one for the same media.
 *
 * Deliberately narrow, and not a sweeper: it runs once when a worker starts,
 * scans only `pending`, and touches nothing about the generation outcome. The
 * stale-task sweeper, the reconciler and the DLQ reprocessor stay frozen.
 */
export interface ResumePendingAttachmentsDeps {
  jobStore: JobAttachmentStore & {
    findPendingAttachments(limitCount?: number): Promise<VideoJobRecord[]>;
  };
  sessionService: SessionAppendPort;
  /** Upper bound on one pass. A restart settles a backlog, not a queue. */
  limit?: number;
}

export interface ResumePendingAttachmentsResult {
  scanned: number;
  attached: number;
  failed: number;
}

export async function resumePendingAttachments({
  jobStore,
  sessionService,
  limit = 50,
}: ResumePendingAttachmentsDeps): Promise<ResumePendingAttachmentsResult> {
  const log = logger.child({ service: "resumePendingAttachments" });

  const pending = await jobStore.findPendingAttachments(limit);
  if (pending.length === 0) {
    return { scanned: 0, attached: 0, failed: 0 };
  }

  log.info("Resuming pending clip attachments", { count: pending.length });

  let attached = 0;
  let failed = 0;
  for (const job of pending) {
    const outcome = await attachCompletedJobToSession({
      job,
      jobStore,
      sessionService,
      log,
      logPrefix: "Resumed clip",
    });
    if (!outcome) continue;
    if (outcome.state === "attached") attached += 1;
    else failed += 1;
  }

  log.info("Pending clip attachments settled", {
    scanned: pending.length,
    attached,
    failed,
  });

  return { scanned: pending.length, attached, failed };
}
