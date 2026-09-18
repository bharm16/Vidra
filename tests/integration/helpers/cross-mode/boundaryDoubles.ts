import { createHash, randomUUID } from "node:crypto";
import { ownerSegment } from "@services/owned-media";
import { validatePathOwnership } from "@services/storage/utils/pathUtils";
import { SIGNED_URL_TTL_MS } from "@config/signedUrlPolicy";
import type {
  ImageAssetStore,
  StoredImageAsset,
} from "@services/image-generation/storage";
import type { StudioProjectStore } from "@services/studio/storage/StudioProjectStore";
import type {
  StudioCallRecord,
  StudioProjectRecord,
  StudioTurnRecord,
  StudioTurnStatus,
} from "@services/studio/types";
import { StudioCapExceededError } from "@services/studio/storage/FirestoreStudioProjectStore";
import type { SessionRecord } from "@server/domain/session/types";
import type {
  VideoJobAttachment,
  VideoJobRecord,
} from "@services/video-generation/jobs/types";
import type { VideoGenerationResult } from "@services/video-generation/types";
import type { AdmissionIdempotencyClaim } from "@services/admission/admitPictureTake";
import type { CreditRefunder } from "@services/credits/ports";

/**
 * Controlled adapters for every process-external boundary the cross-mode
 * walkthrough touches that is NOT served by a recorded cassette.
 *
 * Each one stands exactly where a Firestore or GCS adapter stands in
 * production — `sessionStore`, `imageAssetStore`, `storageService`,
 * `requestIdempotencyService`, `videoJobStore`, `studioProjectStore` — so the
 * services above them are the real ones. Nothing here substitutes for logic
 * the product owns; the moment one of these needs a rule of its own, the seam
 * is in the wrong place.
 *
 * The full boundary table, with which boundaries are recorded and which are
 * controlled, is `docs/architecture/cross-mode-golden-path.md`.
 */

/**
 * The reserved host the in-memory object store answers on.
 *
 * A stored object must be readable the way GCS objects are read — over HTTPS,
 * by a URL that passes the SSRF allowlist (`assertUrlSafe` rejects loopback on
 * purpose, and the studio's return leg really does fetch its own bytes). So
 * the object store is exposed on a public-looking host that the outbound guard
 * routes back into this process instead of the network.
 */
export const OBJECT_STORE_HOST = "objects.cross-mode.invalid";

const OBJECT_STORE_ORIGIN = `https://${OBJECT_STORE_HOST}`;

export interface StoredObject {
  buffer: Buffer;
  contentType: string;
}

/**
 * Durable media, in memory: what GCS holds, addressed the way GCS addresses
 * it (a path) and read the way it is read (a signed-looking URL).
 */
export class InMemoryObjectStore {
  private readonly objects = new Map<string, StoredObject>();

  put(storagePath: string, object: StoredObject): void {
    this.objects.set(storagePath, {
      buffer: Buffer.from(object.buffer),
      contentType: object.contentType,
    });
  }

  get(storagePath: string): StoredObject | undefined {
    return this.objects.get(storagePath);
  }

  urlFor(storagePath: string): string {
    return `${OBJECT_STORE_ORIGIN}/${storagePath}`;
  }

  pathFromUrl(url: string): string | null {
    if (!url.startsWith(`${OBJECT_STORE_ORIGIN}/`)) return null;
    return decodeURIComponent(url.slice(OBJECT_STORE_ORIGIN.length + 1));
  }

  /** The object-read half of the storage boundary, as a fetch handler. */
  serve = (url: string): Promise<Response> => {
    const path = this.pathFromUrl(url);
    const object = path ? this.objects.get(path) : undefined;
    if (!object) {
      return Promise.resolve(new Response("not found", { status: 404 }));
    }
    return Promise.resolve(
      new Response(new Uint8Array(object.buffer), {
        status: 200,
        headers: {
          "content-type": object.contentType,
          "content-length": String(object.buffer.byteLength),
        },
      }),
    );
  };
}

/**
 * The image-asset store's base path. Production's `GcsImageAssetStore` writes
 * every object at `<base>/<owner>/<assetId>` with this default base — NOT the
 * `users/<uid>/…` namespace the user-scoped store uses. This double emits that
 * SAME production shape on purpose (issue #109): an earlier version manufactured
 * `users/<uid>/…` paths here, which made the studio bridge's real-path
 * namespace mismatch invisible offline. Keeping the double production-shaped is
 * what lets the cross-mode walkthrough catch that class of bug and any future
 * one. The broader storage-adapter conformance suite (issue #138) now holds
 * every store — this double included — to that production shape, along with
 * production's fresh-id identity and reported URL expiry:
 * `tests/integration/storage-adapter-conformance.integration.test.ts`.
 */
const IMAGE_PREVIEWS_BASE_PATH = "image-previews";

/** `ImageAssetStore` over the in-memory object store. */
export class InMemoryImageAssetStore implements ImageAssetStore {
  private barrier: { size: number; waiting: Array<() => void> } | null = null;

  constructor(private readonly objects: InMemoryObjectStore) {}

  /** Mirrors `GcsImageAssetStore.objectPath`: `<base>/<owner>/<assetId>`. */
  private objectPath(userId: string, assetId: string): string {
    return `${IMAGE_PREVIEWS_BASE_PATH}/${ownerSegment(userId)}/${assetId}`;
  }

  /**
   * Hold the next `count` writers here and release them together.
   *
   * Storing the media is the last step before the session append, so releasing
   * two writers at the same instant is what makes their appends actually race.
   * Delays cannot do this: two timers started a millisecond apart fire a
   * millisecond apart, and the first append finishes in between — which is a
   * test that proves the writes do not overlap.
   */
  releaseTogether(count: number): void {
    this.barrier = { size: count, waiting: [] };
  }

  private async arrive(): Promise<void> {
    const barrier = this.barrier;
    if (!barrier) return;
    await new Promise<void>((resolve) => {
      barrier.waiting.push(resolve);
      if (barrier.waiting.length >= barrier.size) {
        this.barrier = null;
        for (const waiter of barrier.waiting) waiter();
      }
    });
  }

  async storeFromBuffer(
    buffer: Buffer,
    contentType: string,
    userId: string,
  ): Promise<StoredImageAsset> {
    await this.arrive();
    // A fresh id per store, exactly like `GcsImageAssetStore` (`uuidv4()`):
    // production NEVER content-addresses, so storing the same bytes twice must
    // mint two distinct objects. The conformance suite (#138) enforces this;
    // reintroducing a content hash here would be caught by its identity case.
    const id = randomUUID();
    const storagePath = this.objectPath(userId, id);
    this.objects.put(storagePath, { buffer, contentType });
    return {
      id,
      storagePath,
      url: this.objects.urlFor(storagePath),
      contentType,
      createdAt: Date.now(),
      sizeBytes: buffer.byteLength,
      // Production returns the moment the signed read URL dies (from the
      // minter's TTL). The double's routed URL does not actually expire, but it
      // reports the same bounded expiry, so code that must refresh a persisted
      // URL cannot look correct here while breaking in production.
      expiresAt: Date.now() + SIGNED_URL_TTL_MS.view,
    };
  }

  storeFromUrl(
    sourceUrl: string,
    userId: string,
    contentType?: string,
  ): Promise<StoredImageAsset> {
    const path = this.objects.pathFromUrl(sourceUrl);
    const existing = path ? this.objects.get(path) : undefined;
    if (!existing) {
      return Promise.reject(
        new Error(
          `No stored object for ${sourceUrl} (cross-mode object store)`,
        ),
      );
    }
    return this.storeFromBuffer(
      existing.buffer,
      contentType ?? existing.contentType,
      userId,
    );
  }

  getPublicUrl(assetId: string, userId: string): Promise<string | null> {
    const storagePath = this.objectPath(userId, assetId);
    return Promise.resolve(
      this.objects.get(storagePath) ? this.objects.urlFor(storagePath) : null,
    );
  }

  exists(assetId: string, userId: string): Promise<boolean> {
    return Promise.resolve(
      this.objects.get(this.objectPath(userId, assetId)) !== undefined,
    );
  }

  cleanupExpired(): Promise<number> {
    return Promise.resolve(0);
  }
}

/**
 * How the storage double names a stored object.
 *
 * Production (`generateStoragePath`) mints a fresh id per save, and the default
 * here does the same (`randomUUID`) — which is the identity the conformance
 * suite (#138) holds this double to. The cross-mode harness injects
 * `contentAddressedObjectId` instead — NOT to deduplicate (the walkthrough
 * never saves the same bytes twice), but so a re-recorded studio walkthrough is
 * reproducible: a studio turn's request key embeds the storage paths of the
 * project's images, those images are stored in PARALLEL
 * (`StudioService`'s `Promise.allSettled`), and only a content-addressed id is
 * stable across runs regardless of the order the parallel saves land. This is
 * the same determinism device as the harness's studio-id pinning, chosen at the
 * wiring rather than baked into the double.
 */
export type ObjectIdMint = (
  buffer: Buffer,
  userId: string,
  type: string,
) => string;

/** Deterministic, order-independent object ids for the cross-mode cassette. */
export const contentAddressedObjectId: ObjectIdMint = (buffer, userId, type) =>
  createHash("sha256")
    .update(`${userId}|${type}`)
    .update(buffer)
    .digest("hex")
    .slice(0, 24);

/**
 * The `storageService` surface the walkthrough reaches: the studio's image
 * copy (`saveFromUrl` + `getViewUrl`) and the clip's durable copy.
 */
export class InMemoryStorageService {
  /**
   * Source URLs this store refuses to copy — one sibling of a studio batch,
   * say. Persistent until cleared: a bounded retry that succeeded on attempt
   * two would prove nothing about a failure.
   */
  readonly failSaveFor = new Set<string>();

  constructor(
    private readonly objects: InMemoryObjectStore,
    /** Defaults to production-faithful fresh ids; see `ObjectIdMint`. */
    private readonly mintObjectId: ObjectIdMint = () => randomUUID(),
  ) {}

  saveFromUrl(
    userId: string,
    sourceUrl: string,
    type: string,
    _metadata?: Record<string, unknown>,
  ): Promise<{
    storagePath: string;
    viewUrl: string;
    expiresAt: string;
    sizeBytes: number;
  }> {
    if (this.failSaveFor.has(sourceUrl)) {
      return Promise.reject(
        new Error("storage is unavailable for this object"),
      );
    }
    const source = this.read(sourceUrl);
    // The id strategy is injected: production-faithful fresh ids by default
    // (what the conformance suite checks), deterministic content-addressed ids
    // under the cross-mode harness (what the cassette needs). See `ObjectIdMint`.
    const id = this.mintObjectId(source.buffer, userId, type);
    const storagePath = `users/${userId}/${type}/${id}`;
    this.objects.put(storagePath, source);
    return Promise.resolve({
      storagePath,
      viewUrl: this.objects.urlFor(storagePath),
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_MS.view).toISOString(),
      sizeBytes: source.buffer.byteLength,
    });
  }

  getViewUrl(
    userId: string,
    storagePath: string,
  ): Promise<{ viewUrl: string; expiresAt: string; storagePath: string }> {
    // Production's `StorageService.getViewUrl` refuses a path the caller does
    // not own (`validatePathOwnership`, the same anchored `users/<uid>/` rule).
    // The double must not be more permissive — a stand-in that signs any path
    // for anyone would hide a broken ownership check (#138).
    if (!validatePathOwnership(storagePath, userId)) {
      return Promise.reject(
        new Error(
          "Unauthorized - cannot access files belonging to other users",
        ),
      );
    }
    return Promise.resolve({
      viewUrl: this.objects.urlFor(storagePath),
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_MS.view).toISOString(),
      storagePath,
    });
  }

  /**
   * The provider hands back either a data URI (the sketch relay's sync mode)
   * or a URL into this store (a recorded provider result). Anything else is a
   * live download, which is exactly what must not happen here.
   */
  private read(sourceUrl: string): StoredObject {
    if (sourceUrl.startsWith("data:")) {
      const separator = sourceUrl.indexOf(",");
      const header = sourceUrl.slice("data:".length, separator);
      const contentType = header.split(";")[0] ?? "application/octet-stream";
      return {
        buffer: Buffer.from(sourceUrl.slice(separator + 1), "base64"),
        contentType,
      };
    }
    const path = this.objects.pathFromUrl(sourceUrl);
    const existing = path ? this.objects.get(path) : undefined;
    if (!existing) {
      throw new Error(
        `No stored object for ${sourceUrl} — the cross-mode object store holds only what a recorded provider produced`,
      );
    }
    return existing;
  }
}

/**
 * The session store, in memory.
 *
 * `mutate` is the load-bearing method: Firestore re-runs its mutator against
 * fresh data under contention, which is what makes two concurrent appends both
 * survive. A per-session queue reproduces exactly that serialization, so the
 * integrity case tests the append rule rather than the absence of a race.
 */
export class InMemorySessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly queues = new Map<string, Promise<unknown>>();
  /**
   * Session ids whose appends fail. Persistent until the test clears it —
   * `attachCompletedJobToSession` retries twice, so a one-shot failure would
   * be swallowed by the retry and prove nothing.
   */
  readonly failAppendFor = new Set<string>();

  get(sessionId: string): Promise<SessionRecord | null> {
    const found = this.sessions.get(sessionId);
    return Promise.resolve(found ? structuredClone(found) : null);
  }

  save(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, structuredClone(session));
    return Promise.resolve();
  }

  /**
   * The atomic create-if-absent the acceptance bridges mint through (issue
   * #130). Existence check and write share one synchronous section, mirroring
   * the real store's transaction: a second create at the same id reports the
   * existing row untouched rather than overwriting it.
   */
  createIfAbsent(
    session: SessionRecord,
  ): Promise<{ created: boolean; session: SessionRecord }> {
    const existing = this.sessions.get(session.id);
    if (existing) {
      return Promise.resolve({
        created: false,
        session: structuredClone(existing),
      });
    }
    this.sessions.set(session.id, structuredClone(session));
    return Promise.resolve({
      created: true,
      session: structuredClone(session),
    });
  }

  async mutate(
    sessionId: string,
    mutator: (current: SessionRecord) => SessionRecord,
  ): Promise<SessionRecord | null> {
    const previous = this.queues.get(sessionId) ?? Promise.resolve();
    const next = previous.then(() => {
      if (this.failAppendFor.has(sessionId)) {
        throw new Error("session store is unavailable");
      }
      const current = this.sessions.get(sessionId);
      if (!current) return null;
      const mutated = mutator(structuredClone(current));
      this.sessions.set(sessionId, structuredClone(mutated));
      return structuredClone(mutated);
    });
    this.queues.set(
      sessionId,
      next.catch(() => undefined),
    );
    return next;
  }

  delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    return Promise.resolve();
  }

  findByUser(userId: string, limitCount = 50): Promise<SessionRecord[]> {
    return Promise.resolve(
      [...this.sessions.values()]
        .filter((session) => session.userId === userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, limitCount)
        .map((session) => structuredClone(session)),
    );
  }

  findByPromptUuid(
    userId: string,
    promptUuid: string,
  ): Promise<SessionRecord | null> {
    const found = [...this.sessions.values()].find(
      (session) =>
        session.userId === userId && session.promptUuid === promptUuid,
    );
    return Promise.resolve(found ? structuredClone(found) : null);
  }
}

interface IdempotencyRecord {
  payloadHash: string;
  status: "pending" | "completed" | "failed";
  snapshot?: { statusCode: number; body: Record<string, unknown> };
}

/**
 * The per-admission idempotency record (ADR-0022 decision 6 permits exactly
 * this one), with the same four outcomes the Firestore service returns.
 */
export class InMemoryIdempotencyService {
  private readonly records = new Map<string, IdempotencyRecord>();

  claimRequest(input: {
    userId: string;
    route: string;
    key: string;
    payload: unknown;
  }): Promise<AdmissionIdempotencyClaim> {
    const recordId = createHash("sha256")
      .update(`${input.userId}|${input.route}|${input.key}`)
      .digest("hex");
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(input.payload ?? null))
      .digest("hex");
    const existing = this.records.get(recordId);
    if (!existing) {
      this.records.set(recordId, { payloadHash, status: "pending" });
      return Promise.resolve({ state: "claimed", recordId });
    }
    if (existing.payloadHash !== payloadHash) {
      return Promise.resolve({ state: "conflict", recordId });
    }
    if (existing.status === "completed" && existing.snapshot) {
      return Promise.resolve({
        state: "replay",
        recordId,
        snapshot: existing.snapshot,
      });
    }
    if (existing.status === "pending") {
      return Promise.resolve({ state: "in_progress", recordId });
    }
    this.records.set(recordId, { payloadHash, status: "pending" });
    return Promise.resolve({ state: "claimed", recordId });
  }

  markCompleted(input: {
    recordId: string;
    snapshot: { statusCode: number; body: Record<string, unknown> };
  }): Promise<void> {
    const existing = this.records.get(input.recordId);
    if (existing) {
      existing.status = "completed";
      existing.snapshot = input.snapshot;
    }
    return Promise.resolve();
  }

  markFailed(recordId: string): Promise<void> {
    const existing = this.records.get(recordId);
    if (existing) existing.status = "failed";
    return Promise.resolve();
  }
}

/** The studio's project/turn persistence, in memory. */
export class InMemoryStudioProjectStore implements StudioProjectStore {
  private readonly projects = new Map<string, StudioProjectRecord>();
  private readonly turns = new Map<string, StudioTurnRecord>();
  private readonly reserved = new Map<string, number>();

  createProject(record: StudioProjectRecord): Promise<boolean> {
    if (this.projects.has(record.id)) return Promise.resolve(false);
    this.projects.set(record.id, structuredClone(record));
    return Promise.resolve(true);
  }

  getProject(projectId: string): Promise<StudioProjectRecord | null> {
    const found = this.projects.get(projectId);
    return Promise.resolve(found ? structuredClone(found) : null);
  }

  listProjects(
    userId: string,
    limitCount = 50,
  ): Promise<StudioProjectRecord[]> {
    return Promise.resolve(
      [...this.projects.values()]
        .filter((project) => project.userId === userId)
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        .slice(0, limitCount)
        .map((project) => structuredClone(project)),
    );
  }

  updateProject(
    projectId: string,
    patch: Partial<StudioProjectRecord>,
  ): Promise<void> {
    const current = this.projects.get(projectId);
    if (current) {
      this.projects.set(projectId, structuredClone({ ...current, ...patch }));
    }
    return Promise.resolve();
  }

  listTurns(projectId: string, limitCount = 50): Promise<StudioTurnRecord[]> {
    return Promise.resolve(
      [...this.turns.values()]
        .filter((turn) => turn.projectId === projectId)
        .sort((a, b) => a.createdAtMs - b.createdAtMs)
        .slice(-limitCount)
        .map((turn) => structuredClone(turn)),
    );
  }

  getTurn(projectId: string, turnId: string): Promise<StudioTurnRecord | null> {
    const found = this.turns.get(turnId);
    return Promise.resolve(
      found && found.projectId === projectId ? structuredClone(found) : null,
    );
  }

  findTurnByProducedImageId(
    projectId: string,
    imageId: string,
  ): Promise<StudioTurnRecord | null> {
    const found = [...this.turns.values()].find(
      (turn) =>
        turn.projectId === projectId &&
        turn.calls.some(
          (call) => call.status === "succeeded" && call.image?.id === imageId,
        ),
    );
    return Promise.resolve(found ? structuredClone(found) : null);
  }

  reserveTurn({
    turn,
    day,
    capCents,
  }: {
    turn: StudioTurnRecord;
    day: string;
    capCents: number;
  }): Promise<void> {
    const usageKey = `${turn.userId}_${day}`;
    const already = this.reserved.get(usageKey) ?? 0;
    if (already + turn.reservedCents > capCents) {
      return Promise.reject(
        new StudioCapExceededError(already, turn.reservedCents, capCents),
      );
    }
    this.reserved.set(usageKey, already + turn.reservedCents);
    this.turns.set(turn.id, structuredClone(turn));
    return Promise.resolve();
  }

  saveTurn(turn: StudioTurnRecord): Promise<void> {
    this.turns.set(turn.id, structuredClone(turn));
    return Promise.resolve();
  }

  checkpointCall(
    projectId: string,
    turnId: string,
    call: StudioCallRecord,
    updatedAtMs: number,
  ): Promise<void> {
    const current = this.turns.get(turnId);
    if (!current || current.projectId !== projectId) return Promise.resolve();
    if (current.status !== "running") return Promise.resolve();
    const calls = [...current.calls];
    calls[call.index] = call;
    this.turns.set(turnId, structuredClone({ ...current, calls, updatedAtMs }));
    return Promise.resolve();
  }

  settleTurn(params: {
    projectId: string;
    turnId: string;
    userId: string;
    day: string;
    refundCents: number;
    status: StudioTurnStatus;
    calls: readonly StudioCallRecord[];
    updatedAtMs: number;
  }): Promise<{ applied: boolean }> {
    const current = this.turns.get(params.turnId);
    if (!current || current.projectId !== params.projectId) {
      return Promise.resolve({ applied: false });
    }
    // Idempotency guard mirrors Firestore: a replay finds a terminal turn and
    // no-ops, so refund and finalization apply exactly once.
    if (current.status !== "running")
      return Promise.resolve({ applied: false });
    if (params.refundCents > 0) {
      const usageKey = `${params.userId}_${params.day}`;
      this.reserved.set(
        usageKey,
        Math.max(0, (this.reserved.get(usageKey) ?? 0) - params.refundCents),
      );
    }
    this.turns.set(
      params.turnId,
      structuredClone({
        ...current,
        status: params.status,
        calls: [...params.calls],
        refundedCents: params.refundCents,
        updatedAtMs: params.updatedAtMs,
      }),
    );
    return Promise.resolve({ applied: true });
  }

  /**
   * Give the bridged attachment a fixed id.
   *
   * The studio's system prompt lists attachment ids, and a bridged project
   * mints one from a uuid — so without this the recorded `studio_turn` request
   * key would differ on every run and could never hit a cassette. Nothing
   * downstream reads the id's VALUE (the return leg compares it to the
   * project's own `origin.bridgedImageId`), so pinning it changes identity,
   * not behavior. Named plainly rather than hidden inside the store's writes.
   */
  pinBridgedAttachmentId(projectId: string, attachmentId: string): void {
    const project = this.projects.get(projectId);
    const bridged = project?.attachments?.[0];
    if (!project || !bridged) {
      throw new Error(`No bridged attachment on project ${projectId}`);
    }
    const previousId = bridged.id;
    bridged.id = attachmentId;
    if (project.selectedImageId === previousId) {
      project.selectedImageId = attachmentId;
    }
    if (project.origin?.bridgedImageId === previousId) {
      project.origin = { ...project.origin, bridgedImageId: attachmentId };
    }
  }

  /**
   * Give a settled turn's produced images fixed ids, `<prefix>-<index>`.
   *
   * Same reason as `pinBridgedAttachmentId`, one layer on: the studio's system
   * prompt lists the project's image inventory by id, so uuid-minted ids would
   * make every subsequent turn's recorded request key differ per run. The
   * project's selection follows the rename so the two cannot disagree.
   */
  pinTurnImageIds(projectId: string, turnId: string, prefix: string): void {
    const turn = this.turns.get(turnId);
    if (!turn || turn.projectId !== projectId) {
      throw new Error(`No turn ${turnId} on project ${projectId}`);
    }
    const project = this.projects.get(projectId);
    for (const call of turn.calls) {
      if (!call.image) continue;
      const previousId = call.image.id;
      call.image.id = `${prefix}-${call.index}`;
      if (project?.selectedImageId === previousId) {
        project.selectedImageId = call.image.id;
      }
    }
  }

  deleteProject(projectId: string): Promise<void> {
    this.projects.delete(projectId);
    for (const [id, turn] of this.turns) {
      if (turn.projectId === projectId) this.turns.delete(id);
    }
    return Promise.resolve();
  }
}

/**
 * The video job record store, in memory.
 *
 * Only the members the opened attachment boundary uses (ADR-0022 decision 6):
 * the processor's completion path, the attachment marker, the resume scan, and
 * the two HTTP reads. The sweeper, reconciler and DLQ reprocessor stay frozen
 * and are not represented here.
 */
export class InMemoryVideoJobStore {
  private readonly jobs = new Map<string, VideoJobRecord>();
  seed(job: VideoJobRecord): void {
    this.jobs.set(job.id, structuredClone(job));
  }

  getJob(jobId: string): Promise<VideoJobRecord | null> {
    const found = this.jobs.get(jobId);
    return Promise.resolve(found ? structuredClone(found) : null);
  }

  renewLease(): Promise<boolean> {
    return Promise.resolve(true);
  }

  markCompleted(
    jobId: string,
    result: VideoGenerationResult | undefined,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return Promise.resolve(false);
    job.status = "completed";
    job.completedAtMs = Date.now();
    if (result) job.result = structuredClone(result);
    return Promise.resolve(true);
  }

  markFailed(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return Promise.resolve(false);
    job.status = "failed";
    return Promise.resolve(true);
  }

  requeueForRetry(): Promise<boolean> {
    return Promise.resolve(true);
  }

  enqueueDeadLetter(): Promise<void> {
    return Promise.resolve();
  }

  setProviderResult(): Promise<boolean> {
    return Promise.resolve(true);
  }

  setAttachment(
    jobId: string,
    attachment: VideoJobAttachment,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return Promise.resolve(false);
    job.attachment = structuredClone(attachment);
    return Promise.resolve(true);
  }

  findPendingAttachments(limitCount = 50): Promise<VideoJobRecord[]> {
    return Promise.resolve(
      [...this.jobs.values()]
        .filter((job) => job.attachment?.state === "pending")
        .slice(0, limitCount)
        .map((job) => structuredClone(job)),
    );
  }

  cancelJobsForSession(): Promise<number> {
    return Promise.resolve(0);
  }
}

/**
 * The video provider, controlled.
 *
 * It satisfies `processVideoJob`'s injected `JobGenerationService` port — the
 * same port the real `VideoGenerationService` satisfies — and returns one
 * fixed clip. A clip's pixels are not what this walkthrough proves; that it
 * becomes a take in its session, exactly once, with its ancestry intact, is.
 */
export class ControlledVideoProvider {
  readonly calls: Array<{ prompt: string; options: unknown }> = [];

  constructor(private readonly clip: VideoGenerationResult) {}

  generateVideo(
    prompt: string,
    options: Record<string, unknown> | undefined,
  ): Promise<VideoGenerationResult> {
    this.calls.push({ prompt, options });
    return Promise.resolve(structuredClone(this.clip));
  }
}

/**
 * Refunds are the frozen side of decision 6's line. The walkthrough injects
 * this so the clip path has the port it requires AND so "never invokes refund
 * logic" is an assertion rather than a claim.
 */
export class RefundWitness implements CreditRefunder {
  readonly refunds: string[] = [];

  refundCredits(userId: string): Promise<boolean> {
    this.refunds.push(userId);
    return Promise.resolve(true);
  }
}
