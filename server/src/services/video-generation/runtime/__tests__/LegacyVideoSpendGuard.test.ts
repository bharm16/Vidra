import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@infrastructure/Logger";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { AcceptedRequestSchema } from "@shared/schemas/workflow/request.schemas";
import { ProjectSchema } from "@shared/schemas/workflow/project.schemas";
import { workflowRuntimeProfiles } from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";
import { StudioWorkflowSpendGuard } from "@services/creation-requests/execution/StudioWorkflowSpendGuard";
import { ExecutionAttemptSchema, WorkflowPreflightError } from "@services/creation-requests/execution/types";
import { LegacyVideoSpendGuard, LegacyVideoSpendRefusedError, reviewedLegacyVideoDispatch } from "../LegacyVideoSpendGuard";
import { processVideoJob, type JobProcessingStore } from "../processVideoJob";
import { VideoJobHandler } from "../VideoJobHandler";
import type { VideoJobRecord } from "../types";

vi.mock("@infrastructure/Logger", () => {
  const sink = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: (): unknown => sink };
  return { logger: sink };
});

const AT = Date.parse("2026-10-20T12:00:00.000Z");
const DAY = "2026-10-20";
const profiles = workflowRuntimeProfiles();
beforeEach(() => { vi.clearAllMocks(); });
type Data = Record<string, unknown>;
type Ref = { path: string; collection(name: string): { doc(id: string): Ref } };

/** Optimistic transactions retry stale reads and enforce Firestore's read-before-write rule. */
class Database {
  readonly rows = new Map<string, Data>();
  private readonly versions = new Map<string, number>();
  collection(path: string): { doc(id: string): Ref } {
    return { doc: id => ({ path: `${path}/${id}`, collection: name => this.collection(`${path}/${id}/${name}`) }) };
  }
  set(path: string, data: Data): void { this.rows.set(path, structuredClone(data)); this.versions.set(path, (this.versions.get(path) ?? 0) + 1); }
  async runTransaction<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const reads = new Map<string, number>(); const writes = new Map<string, Data>();
      const transaction = {
        get: async (ref: Ref) => {
          if (writes.size) throw new Error("Transaction read after write");
          reads.set(ref.path, this.versions.get(ref.path) ?? 0);
          const value = this.rows.get(ref.path);
          await Promise.resolve();
          return { exists: value !== undefined, data: () => value && structuredClone(value) };
        },
        set: (ref: Ref, data: Data) => writes.set(ref.path, data),
        create: (ref: Ref, data: Data) => { if (this.rows.has(ref.path)) throw new Error("Already exists"); writes.set(ref.path, data); },
      } as unknown as Transaction;
      const result = await callback(transaction);
      if ([...reads].some(([path, revision]) => (this.versions.get(path) ?? 0) !== revision)) continue;
      for (const [path, data] of writes) this.set(path, data);
      return result;
    }
    throw new Error("Contention did not settle");
  }
  get firestore(): Firestore { return this as unknown as Firestore; }
}

function job(overrides: Partial<VideoJobRecord> = {}): VideoJobRecord {
  return { id: "legacy-one", status: "processing", userId: "creator", request: { prompt: "A red boat", options: { model: "wan-video/wan-2.2-t2v-fast" } }, creditsReserved: 0, attempts: 1, maxAttempts: 3, workerId: "worker-one", leaseExpiresAtMs: AT + 90_000, createdAtMs: AT, updatedAtMs: AT, ...overrides };
}
function setup(cap = 500, at = AT) {
  const database = new Database();
  const authority = new StudioWorkflowSpendGuard(database.firestore, { dailyCapCents: cap }, () => at);
  const guard = new LegacyVideoSpendGuard(database.firestore, { reserve: async (tx, input) => {
    try { return await authority.reserveProviderSpendInTransaction(tx, input); }
    catch (error) { if (error instanceof WorkflowPreflightError) throw new LegacyVideoSpendRefusedError(error.message); throw error; }
  } }, profiles, () => AT);
  const seed = (value: VideoJobRecord): void => { const { id, ...record } = value; database.set(`video_jobs/${id}`, record); };
  return { database, authority, guard, seed, used: (): number => Number(database.rows.get(`studio_usage/creator_${DAY}`)?.reservedCents ?? 0) };
}
const store = (): JobProcessingStore => ({ renewLease: vi.fn(async () => true), markCompleted: vi.fn(async () => true), markFailed: vi.fn(async () => true), requeueForRetry: vi.fn(async () => true), enqueueDeadLetter: vi.fn(async () => undefined) });
function processing(guard: LegacyVideoSpendGuard) {
  const generateVideo = vi.fn(async () => ({ assetId: "asset", videoUrl: "https://media.test/video", contentType: "video/mp4" }));
  const jobStore = store();
  const deps = { jobStore, providerSpendGuard: guard, videoGenerationService: { generateVideo }, storageService: { saveFromUrl: vi.fn(async () => ({ storagePath: "users/creator/generations/video.mp4", viewUrl: "https://media.test/owned", expiresAt: "2099-01-01T00:00:00.000Z", sizeBytes: 10 })) }, workerId: "worker-one", leaseMs: 90_000, heartbeat: { start: vi.fn(), stop: vi.fn() } };
  return { deps, generateVideo, jobStore };
}

describe("legacy native provider spending", () => {
  it("consumes reviewed cents once before dispatch while customer credits stay zero", async () => {
    const h = setup(); const value = job(); h.seed(value); const p = processing(h.guard);
    await Promise.all([processVideoJob(value, p.deps), processVideoJob(value, p.deps)]);
    expect(p.generateVideo).toHaveBeenCalledTimes(1); expect(h.used()).toBe(20);
    expect(p.generateVideo).toHaveBeenCalledWith("A red boat", expect.objectContaining({ model: "wan-video/wan-2.2-t2v-fast", numFrames: 81, fps: 16, size: "720p", promptExtend: false }), undefined);
    expect(h.database.rows.get("video_jobs/legacy-one/provider_dispatches/1")).toMatchObject({ spend: { authority: "studio_usage/v1", cents: 20 }, requestHash: expect.stringMatching(/^[a-f0-9]{64}$/), dispatchOptionsHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(value.creditsReserved).toBe(0);
  });

  it("an exhausted allowance refuses a fresh job without reaching the provider", async () => {
    const h = setup(); h.database.set(`studio_usage/creator_${DAY}`, { userId: "creator", day: DAY, reservedCents: 500 });
    const value = job({ id: "fresh-key-job" }); h.seed(value); const p = processing(h.guard);
    await processVideoJob(value, p.deps);
    expect(p.generateVideo).not.toHaveBeenCalled(); expect(h.used()).toBe(500);
    expect(p.jobStore.markFailed).toHaveBeenCalledWith(value.id, expect.objectContaining({ code: "VIDEO_JOB_SPEND_REFUSED", retryable: false }));
    expect(h.database.rows.has(`video_jobs/${value.id}/provider_dispatches/1`)).toBe(false);
  });

  it("legacy and canonical workflow reservations share the same last allowance", async () => {
    const h = setup(); const value = job(); h.seed(value);
    const profile = profiles.find(candidate => candidate.id === "flux-schnell")!;
    const request = AcceptedRequestSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "request_spend", ownerId: "creator", projectId: "project_spend", conversationId: "conversation_spend", submissionId: "submission_spend", executionDraftId: "draft_spend", executionDraftRevision: 1, acceptanceSequence: 1, snapshotHash: "a".repeat(64), acceptedAt: new Date(AT).toISOString(), snapshot: { action: "make-image", instructions: "A boat", inputs: [], settings: { profileId: profile.id, profileRevision: profile.revision, parameters: { aspectRatio: "16:9" }, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_spend", conversationId: "conversation_spend" } }, materializedContext: { projectInstructions: "", entries: [] }, slots: [{ id: "slot_spend", ordinal: 1, outcome: "running", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 } }] });
    h.database.set("creation_requests/request_spend", request);
    h.database.set("creation_requests/request_spend/execution_attempts/slot_spend", ExecutionAttemptSchema.parse({ requestId: request.id, slotId: "slot_spend", ownerId: "creator", projectId: request.projectId, token: "attempt", snapshotHash: request.snapshotHash, state: "running", startedAt: new Date(AT).toISOString(), deadlineAt: new Date(AT + 90_000).toISOString(), profile, sentInstructions: "A boat" }));
    h.database.set("creation_projects/project_spend", ProjectSchema.parse({ schemaVersion: "vidra-workflow/v2", id: request.projectId, ownerId: "creator", revision: 1, name: "Budget", status: "active", instructions: { revision: 1, text: "" }, origin: { kind: "new" }, createdAt: new Date(AT).toISOString(), updatedAt: new Date(AT).toISOString() }));
    h.database.set(`studio_usage/creator_${DAY}`, { userId: "creator", day: DAY, reservedCents: 480 });
    const result = await Promise.allSettled([h.guard.authorize(value, "worker-one"), h.authority.reserve(request, request.slots[0]!, profile)]);
    expect(result.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(h.used()).toBeLessThanOrEqual(500);
  });

  it("worker retries require a new durable reservation and the next retry cannot exceed the cap", async () => {
    const h = setup(40); const first = job(); h.seed(first); const p = processing(h.guard);
    const handler = new VideoJobHandler(p.deps.jobStore as never, p.deps.videoGenerationService as never, { refundCredits: vi.fn(async () => true) }, p.deps.storageService as never, { providerSpendGuard: h.guard });
    const context = { workerId: "worker-one", leaseMs: 90_000, signal: new AbortController().signal, heartbeat: p.deps.heartbeat };
    for (let attempt = 1; attempt <= 3; attempt += 1) { const current = job({ attempts: attempt }); h.seed(current); await handler.process(current, context); }
    expect(p.generateVideo).toHaveBeenCalledTimes(2); expect(h.used()).toBe(40);
  });

  it.each(["held", "expired", "changed"])("refuses a %s reviewed mapping before dispatch", async mode => {
    const h = setup(500, mode === "expired" ? Date.parse("2027-01-01T00:00:00.000Z") : AT);
    if (mode === "held") h.database.set("workflow_spend_holds/wan-2.2-t2v", { profileId: "wan-2.2-t2v" });
    const value = job({ request: { prompt: "A red boat", options: { model: "wan-video/wan-2.2-t2v-fast", ...(mode === "changed" ? { fps: 30 } : {}) } } }); h.seed(value); const p = processing(h.guard);
    await processVideoJob(value, p.deps); expect(p.generateVideo).not.toHaveBeenCalled(); expect(h.used()).toBe(0);
  });

  it("refuses stale leases, replaced requests, raw-key owners and an absent authority", async () => {
    const h = setup(); const value = job(); h.seed(value);
    expect(await h.guard.authorize(value, "another-worker")).toBeNull();
    h.seed({ ...value, leaseExpiresAtMs: AT - 1 }); expect(await h.guard.authorize(value, "worker-one")).toBeNull();
    h.seed(value); await expect(h.guard.authorize({ ...value, request: { ...value.request, prompt: "Changed" } }, "worker-one")).rejects.toBeInstanceOf(LegacyVideoSpendRefusedError);
    await expect(h.guard.authorize(job({ userId: "api-key:retired-fixture" }), "worker-one")).rejects.toBeInstanceOf(LegacyVideoSpendRefusedError);
    const p = processing(h.guard); const { providerSpendGuard: _guard, ...missing } = p.deps;
    await processVideoJob(value, missing); expect(p.generateVideo).not.toHaveBeenCalled(); expect(h.used()).toBe(0);
  });

  it("never reinterprets an unknown persisted model as the default Wan model", async () => {
    const h = setup();
    const value = job({ request: { prompt: "A boat", options: { model: "unregistered-provider/model" } } });
    h.seed(value); const p = processing(h.guard);
    await processVideoJob(value, p.deps);
    expect(p.generateVideo).not.toHaveBeenCalled(); expect(h.used()).toBe(0);
    expect(p.jobStore.markFailed).toHaveBeenCalledWith(value.id, expect.objectContaining({ code: "VIDEO_JOB_SPEND_REFUSED", retryable: false }));
    expect(reviewedLegacyVideoDispatch({}, profiles).profile.id).toBe("wan-2.2-t2v");
    expect(reviewedLegacyVideoDispatch({ model: "auto" }, profiles).profile.id).toBe("wan-2.2-t2v");
  });

  it.each(["retired-secret-fixture", `v1:${"a".repeat(64)}`])("does not log or dispatch historical raw-key owner %s", async credential => {
    const h = setup(); const p = processing(h.guard);
    await processVideoJob(job({ userId: `api-key:${credential}` }), p.deps);
    expect(p.generateVideo).not.toHaveBeenCalled(); expect(p.jobStore.markFailed).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled(); expect(logger.warn).not.toHaveBeenCalled(); expect(logger.error).not.toHaveBeenCalled();
  });

  it("qualifies only the existing exact Wan envelopes", () => {
    for (const options of [{ model: "google/veo-3" }, { model: "wan-video/wan-2.2-t2v-fast", startImage: "https://media.test/image" }, { model: "wan-video/wan-2.5-i2v-fast", startImage: "https://media.test/image" }, { model: "wan-video/wan-2.2-t2v-fast", numFrames: 300 }, { model: "wan-video/wan-2.2-t2v-fast", promptExtend: true }, { model: "wan-video/wan-2.2-t2v-fast", arbitrary: "value" }]) expect(() => reviewedLegacyVideoDispatch(options, profiles)).toThrow();
    expect(reviewedLegacyVideoDispatch({ model: "wan-video/wan-2.5-i2v", startImage: "https://media.test/image", seconds: "10", size: "1080p" }, profiles)).toMatchObject({ profile: { id: "wan-2.5-i2v" }, options: { seconds: "10", promptExtend: true } });
    const changed = profiles.map(profile => profile.id === "wan-2.2-t2v" ? { ...profile, revision: "unreviewed" } : profile);
    const h = setup(); const altered = new LegacyVideoSpendGuard(h.database.firestore, { reserve: (tx, input) => h.authority.reserveProviderSpendInTransaction(tx, input) }, changed, () => AT);
    const value = job(); h.seed(value);
    return expect(altered.authorize(value, "worker-one")).rejects.toThrow("unavailable during bounded free testing");
  });
});
