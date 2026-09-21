import type { TakeAttachment } from "@shared/schemas/attachment.schemas";
import { TakeAttachmentSchema } from "@shared/schemas/attachment.schemas";
import { ADMISSION_ROUTE } from "./admitPictureTake";

/**
 * Recovery for an accepted live output whose attachment never resolved —
 * issue #134, ADR-0022 decision 6 on the sketchpad admission.
 *
 * Where the truth lives, and why: the live editor keeps nothing (ADR-0017), so
 * a refreshed client cannot carry the acceptance's idempotency key back, and
 * no client-side memory may contradict that. What survives the refresh is
 * server-side, in two places that play different roles:
 *
 *  - **The #128 receipt** — the admission's settled snapshot in the
 *    idempotency store — is the INDEX. It is how an unresolved acceptance is
 *    found at all: the snapshot carries the take identity, the destination and
 *    the exact record a retry re-sends. Receipts expire with the replay window
 *    (24h), which is the same horizon the replay path itself honors.
 *  - **The session the take was minted into** is the TRUTH of whether the take
 *    is still owed. A receipt is only rewritten when the acceptance itself is
 *    replayed, so the record-POST repair door (#133's attach retry, which
 *    never touches the receipt) would otherwise leave a stale `failed`
 *    snapshot behind forever. Checking the take's presence in the session
 *    makes discovery self-settling: a repaired take stops being reported, with
 *    no second ledger and no competing owner for the attachment state (#128).
 *
 * Only `sketchpad`-origin admissions are reported. The studio's returns share
 * the admission boundary but are another surface's recovery concern, and a
 * sketch recovery that reported a studio debt would be answering a question
 * nobody this route serves asked.
 *
 * Pure over its ports: reads the receipts, reads the session, projects. All
 * I/O stays in the ports the route wires.
 */

/** The settled snapshot shape the idempotency store hands back. */
export interface AdmissionReceiptSnapshot {
  statusCode: number;
  body: Record<string, unknown>;
}

/**
 * Reads the receipts one route's admissions settled, for one creator, within
 * the replay window. `RequestIdempotencyService` satisfies this; the port
 * keeps admission (and this module's callers) pointed at the store's
 * capability, not its concrete type.
 */
export interface AdmissionReceiptReaderPort {
  listResponseSnapshots(
    userId: string,
    route: string,
  ): Promise<AdmissionReceiptSnapshot[]>;
}

/** The session read the still-owed check needs — admission's own. */
export interface UnresolvedAcceptanceSessionPort {
  requireOwnedSession: (
    userId: string,
    sessionId: string,
  ) => Promise<{
    userId: string;
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
  }>;
}

export interface FindUnresolvedAcceptancesDeps {
  receipts: AdmissionReceiptReaderPort;
  sessionService: UnresolvedAcceptanceSessionPort;
}

export interface FindUnresolvedAcceptancesRequest {
  userId: string;
  /** Only acceptances minted INTO this session are the refreshed view's debts. */
  sessionId: string;
}

/** Narrow one opaque generation entry to a readable record, or skip it. */
function asGenerationRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * The take ids already in the destination session — the attachment truth. An
 * id present here means the take reached its session, however it got there
 * (the original attach, a later replay's resume, or the record-POST repair).
 */
function takeIdsInSession(session: {
  prompt?: {
    versions?: ReadonlyArray<{
      generations?: ReadonlyArray<unknown> | undefined;
    }> | undefined;
  } | undefined;
}): Set<string> {
  const ids = new Set<string>();
  for (const version of session.prompt?.versions ?? []) {
    for (const entry of version.generations ?? []) {
      const record = asGenerationRecord(entry);
      const id = record?.id;
      if (typeof id === "string" && id.length > 0) ids.add(id);
    }
  }
  return ids;
}

/**
 * Read one receipt back as an unresolved sketchpad attachment, or `undefined`
 * when it is not one: a foreign origin, another destination, a settled
 * attachment, or a body that does not validate against the shared attachment
 * contract. The shared schema is the boundary — a receipt this module cannot
 * fully vouch for is never offered to a client as recoverable work.
 */
function asUnresolvedSketchpadAttachment(
  snapshot: AdmissionReceiptSnapshot,
  sessionId: string,
): TakeAttachment | undefined {
  const body = snapshot.body;
  if (body.origin !== "sketchpad") return undefined;
  if (body.sessionId !== sessionId) return undefined;
  const parsed = TakeAttachmentSchema.safeParse(body.attachment);
  if (!parsed.success) return undefined;
  const attachment = parsed.data;
  // `attached` is the one settled state a receipt can hold — there is nothing
  // owed to report about it.
  if (attachment.state === "attached") return undefined;
  if (!attachment.record) return undefined;
  return attachment;
}

/**
 * Every accepted live output minted into this session whose take is STILL not
 * in it — the recovery answer a refreshed client asks for. Ordered by nothing:
 * each entry is independent, and a retry re-sends its own record.
 */
export async function findUnresolvedSketchAcceptances(
  deps: FindUnresolvedAcceptancesDeps,
  request: FindUnresolvedAcceptancesRequest,
): Promise<TakeAttachment[]> {
  const { receipts, sessionService } = deps;

  const [snapshots, session] = await Promise.all([
    receipts.listResponseSnapshots(request.userId, ADMISSION_ROUTE),
    sessionService.requireOwnedSession(request.userId, request.sessionId),
  ]);
  const attached = takeIdsInSession(session);

  const owed = new Map<string, TakeAttachment>();
  for (const snapshot of snapshots) {
    const attachment = asUnresolvedSketchpadAttachment(
      snapshot,
      request.sessionId,
    );
    // The receipt is the index; the session is the truth. A take the session
    // already holds is not owed, whatever a stale snapshot still says.
    if (!attachment || attached.has(attachment.generationId)) continue;
    owed.set(attachment.generationId, attachment);
  }
  return [...owed.values()];
}
