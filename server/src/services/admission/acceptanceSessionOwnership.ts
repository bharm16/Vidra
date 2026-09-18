import { createHash } from "node:crypto";
import { logger } from "@infrastructure/Logger";
import type { SessionPrompt } from "@shared/types/session";

/**
 * One acceptance owns one session — issue #130, ADR-0022 decision 6.
 *
 * The sketch-accept and studio-return bridges both locate-or-create a session
 * for the picture they are admitting. Two facts about that creation were unsafe,
 * and both bridges had a private, subtly-wrong copy of the logic:
 *
 *  1. It was a find-then-create with no uniqueness guarantee, so two racing
 *     presses of the SAME output each minted a session.
 *  2. Its compensation deleted the session on ANY later failure — including a
 *     completion-record write that failed AFTER the take had already attached,
 *     which destroyed committed, durable, resumable work.
 *
 * This module is the single correct spelling of both halves, so the two bridges
 * cannot drift:
 *
 *  - {@link ensureAcceptanceSession} mints through one atomic create-if-absent
 *    keyed on a deterministic id, so racing presses converge on one document.
 *  - {@link discardMintedSessionIfUncommitted} removes ONLY a session this
 *    attempt minted, that no concurrent same-key admission is attaching into,
 *    and that holds no take. A session that gained a take is never deleted to
 *    punish a failed response-record: the take is durable and the admission is
 *    resumable, so a retry re-attaches it rather than a compensation erasing it.
 */

const log = logger.child({ service: "acceptanceSessionOwnership" });

/**
 * The narrow read the compensation and the ensure need: which words-versions a
 * session has, and whether any of them already holds a take. Read defensively —
 * the generation entries are opaque; only their presence matters here.
 */
export interface AcceptanceSessionRead {
  prompt?:
    | {
        versions?:
          | ReadonlyArray<{
              versionId: string;
              generations?: ReadonlyArray<unknown> | undefined;
            }>
          | undefined;
      }
    | undefined;
}

/**
 * The session capabilities an acceptance needs to own exactly one session per
 * output. `SessionService` satisfies it; naming it here keeps the ownership
 * logic testable against an in-memory store double and documents the whole of
 * the session domain these bridges are allowed to touch for creation.
 */
export interface AcceptanceSessionPort {
  createPromptSessionAtomically(
    userId: string,
    sessionId: string,
    request: { name?: string; prompt: SessionPrompt },
  ): Promise<{ created: boolean; session: AcceptanceSessionRead }>;
  requireOwnedSession(
    userId: string,
    sessionId: string,
  ): Promise<AcceptanceSessionRead>;
  deleteSessionForUser(userId: string, sessionId: string): Promise<void>;
}

/**
 * The one session an acceptance is allowed to mint, named deterministically
 * from the output it is accepting.
 *
 * The bridges already derive a stable `promptUuid` per output (the accept key,
 * or the project+image being returned). Hashing it to the session's document id
 * makes the mint idempotent through the store's own create-if-absent: two
 * presses of the same output ask for the same document, so one is created and
 * the rest read it back. The prefix keeps the id space disjoint from randomly
 * generated session ids.
 */
export function acceptanceSessionId(promptUuid: string): string {
  const digest = createHash("sha256").update(promptUuid).digest("hex");
  return `session_acc_${digest.slice(0, 24)}`;
}

export type EnsureAcceptanceSessionResult =
  | {
      ok: true;
      sessionId: string;
      promptVersionId: string;
      /** Set only when THIS attempt created the session — the one thing that
       * makes it eligible for compensation. Absent when a prior press's session
       * was reused. */
      mintedSessionId?: string;
    }
  | { ok: false; reason: string };

/**
 * Resolve the session for an acceptance that names no destination: mint it if
 * this attempt is first, otherwise reuse the one an earlier press minted.
 *
 * The atomic create-if-absent collapses the old find-then-create into one step,
 * so the "no uniqueness guarantee" window is gone. When the session already
 * exists it is reused untouched, filing the take under its ORIGINAL root
 * words-version — never a freshly built one that would orphan the first press's
 * take.
 */
export async function ensureAcceptanceSession(
  sessionService: AcceptanceSessionPort,
  input: {
    userId: string;
    promptUuid: string;
    name: string;
    root: { prompt: SessionPrompt; versionId: string };
  },
): Promise<EnsureAcceptanceSessionResult> {
  const sessionId = acceptanceSessionId(input.promptUuid);
  const { created, session } =
    await sessionService.createPromptSessionAtomically(
      input.userId,
      sessionId,
      {
        name: input.name,
        prompt: input.root.prompt,
      },
    );

  if (created) {
    return {
      ok: true,
      sessionId,
      promptVersionId: input.root.versionId,
      mintedSessionId: sessionId,
    };
  }

  const existingRoot = session.prompt?.versions?.[0];
  if (!existingRoot) {
    // Minted by this bridge and always given a root. If it has none now,
    // guessing an id would file a take under words nobody authored — say so.
    return {
      ok: false,
      reason: `session ${sessionId} has no root words-version`,
    };
  }

  return { ok: true, sessionId, promptVersionId: existingRoot.versionId };
}

function sessionHoldsTake(session: AcceptanceSessionRead): boolean {
  return (session.prompt?.versions ?? []).some(
    (version) => (version.generations?.length ?? 0) > 0,
  );
}

/**
 * Compensation, scoped so it can only ever remove uncommitted work — the whole
 * point of issue #130.
 *
 * Three conditions must all hold before a session is deleted:
 *
 *  - **This attempt minted it.** A reused session belongs to an earlier press
 *    and is never this attempt's to remove.
 *  - **No concurrent same-key admission owns the claim.** When admission reports
 *    `in_progress` or `conflict`, another attempt holds the per-admission claim
 *    and may be attaching a take into THIS very session; deleting it would
 *    destroy that in-flight work. The minter can lose the claim race, so this is
 *    not hypothetical.
 *  - **The session holds no take.** A fresh read is the last word. A completion
 *    write that fails after a successful attach surfaces to the bridge as a
 *    thrown admission, indistinguishable from a pre-attach failure by its error
 *    alone — so the state, not the exception, decides. A session that gained a
 *    take is kept: the take is durable and the admission resumable, and a retry
 *    re-attaches it rather than this compensation erasing committed work.
 */
export async function discardMintedSessionIfUncommitted(
  sessionService: AcceptanceSessionPort,
  input: {
    userId: string;
    mintedSessionId: string | undefined;
    concurrentClaimOwner: boolean;
  },
): Promise<void> {
  const { userId, mintedSessionId, concurrentClaimOwner } = input;
  if (!mintedSessionId) return;
  if (concurrentClaimOwner) return;

  try {
    const session = await sessionService.requireOwnedSession(
      userId,
      mintedSessionId,
    );
    if (sessionHoldsTake(session)) {
      log.warn(
        "Acceptance failed after its take attached; the session it minted is kept intact",
        { userId, sessionId: mintedSessionId },
      );
      return;
    }
    await sessionService.deleteSessionForUser(userId, mintedSessionId);
  } catch (error) {
    // A read/delete that throws here — the session was concurrently removed, or
    // storage is down — leaves nothing this attempt can safely act on. Report
    // it; never let compensation itself become a second failure that strands the
    // caller.
    log.warn("Acceptance compensation could not resolve its minted session", {
      userId,
      sessionId: mintedSessionId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
