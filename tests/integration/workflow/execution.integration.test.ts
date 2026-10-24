import { CreationRequestLifecycle } from "@services/creation-requests/lifecycle";
import express from "express";
import request from "supertest";
import { afterAll, expect, it, vi } from "vitest";
import { AcceptedRequestSchema, type AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { CreationContextService } from "@services/creation-context/CreationContextService";
import { RequestHistoryStore } from "@services/media-history/RequestHistoryStore";
import { RequestIdempotencyService } from "@services/admission/idempotency/RequestIdempotencyService";
import { FirestoreCircuitExecutor } from "@services/firestore/FirestoreCircuitExecutor";
import { WorkflowCapabilityCatalog } from "@services/creation-requests/catalog";
import { WorkflowOutboxSchema } from "@services/creation-requests/receipts";
import { WorkflowExecutionStore } from "@services/creation-requests/execution";
import { WorkflowExecutionService } from "@services/creation-requests/execution";
import { ExecutionAttemptSchema, instructionsFor, type ExecutionAttempt, type NativeOutput, type VerifiedOutput, type WorkflowNativeExecutor, type WorkflowOutputStorage } from "@services/creation-requests/execution";
import { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { createCreationRequestRoutes } from "@routes/creation-requests.routes";
import { errorHandler } from "@middleware/errorHandler";
import type { RequestWithUser } from "@middleware/intake";
import { createTestLifecycle } from "../helpers/workflow/lifecycle";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database);
const store = new WorkflowExecutionStore(database, new MediaVersionIndex(database, projects));
const catalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(["replicate-flux-schnell"]), videoAvailable: () => false, textAvailable: true, spendGuard: { qualified: () => true } });
const profile = catalog.get("flux-schnell")!;
const storage: WorkflowOutputStorage = { materialize: vi.fn(async (attempt: ExecutionAttempt): Promise<VerifiedOutput> => ({ object: { identity: "verified", assetId: attempt.slotId, storagePath: `users/creator/previews/images/${attempt.slotId}.webp`, generation: "1", sha256: "b".repeat(64), bytes: 20 }, metadata: { state: "verified", width: 100, height: 100, durationSeconds: 0, audio: "absent", probeVersion: "controlled" } })) };
const native: WorkflowNativeExecutor = { available: () => true, execute: vi.fn(async (): Promise<NativeOutput> => ({ kind: "image", storagePath: "image-previews/creator/produced", provider: "replicate", model: "flux" })) };
afterAll(async () => { await database.terminate(); });

async function accepted(suffix: string, count = 1, text = false): Promise<AcceptedRequest> {
  const project = await projects.create("creator", { id: `project_${suffix}`, name: "Private test" });
  const selected = text ? catalog.get("text-ask")! : profile;
  const captured = AcceptedRequestSchema.parse({ schemaVersion: "vidra-workflow/v2", id: `request_${suffix}`, ownerId: "creator", projectId: project.id, conversationId: `conversation_${suffix}`, submissionId: `submission_${suffix}`, executionDraftId: `draft_${suffix}`, executionDraftRevision: 1, acceptanceSequence: 1, snapshotHash: "a".repeat(64), acceptedAt: "2026-10-17T00:00:00.000Z", snapshot: { action: selected.action, instructions: "Private instructions", inputs: [], settings: { profileId: selected.id, profileRevision: selected.revision, parameters: { aspectRatio: "16:9" }, outputCount: count }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: project.id, conversationId: `conversation_${suffix}` } }, materializedContext: { projectInstructions: "", entries: [] }, slots: Array.from({ length: count }, (_, index) => ({ id: `slot_${suffix}_${index}`, ordinal: index + 1, outcome: "queued", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 } })) });
  await database.collection("creation_requests").doc(captured.id).create(captured);
  await database.collection("creation_outbox").doc(captured.id).create(WorkflowOutboxSchema.parse({ schemaVersion: "vidra-execution/v2", ownerId: "creator", projectId: project.id, requestId: captured.id, state: "queued", profile: selected, deadlineAt: "2026-10-18T00:00:00.000Z", createdAt: captured.acceptedAt }));
  return captured;
}

it("two dispatchers invoke one provider and publish one immutable result/history slot", async () => {
  const captured = await accepted("compete");
  const calls = vi.fn(native.execute); const executor = { ...native, execute: calls };
  const first = new WorkflowExecutionService(store, executor, storage); const second = new WorkflowExecutionService(store, executor, storage);
  await Promise.all([first.start("creator", captured.id), second.start("creator", captured.id)]); await Promise.all([first.drain(), second.drain()]);
  expect(calls).toHaveBeenCalledTimes(1);
  const saved = await store.get("creator", captured.id); expect(saved.slots[0]).toMatchObject({ outcome: "completed", delivery: "ready", versionId: "version_compete_0" });
  const versions = await new MediaVersionIndex(database, projects).list("creator", captured.projectId); expect(versions).toHaveLength(1); expect(versions[0]).toMatchObject({ origin: { requestId: captured.id, slotId: "slot_compete_0" }, sourceInputs: [] });
  await first.reconcile("creator", captured.id); await first.drain(); expect(calls).toHaveBeenCalledTimes(1);
});

it("a lost/unknown provider outcome cannot authorize a second invocation after restart", async () => {
  const captured = await accepted("unknown"); const calls = vi.fn(async () => { throw new Error("Transport lost after provider acceptance"); });
  const executor = { available: () => true, execute: calls }; const service = new WorkflowExecutionService(store, executor, storage);
  await service.start("creator", captured.id); await service.drain(); expect((await store.get("creator", captured.id)).slots[0]).toMatchObject({ outcome: "needs-attention", error: { code: "outcome_unknown" } });
  const restarted = new WorkflowExecutionService(store, executor, storage); await restarted.reconcile("creator", captured.id); await restarted.drain(); expect(calls).toHaveBeenCalledTimes(1);
});

it("checkpointed output retries saving after refresh without invoking the provider", async () => {
  const captured = await accepted("delivery"); const calls = vi.fn(native.execute); let failed = true;
  const outputStorage: WorkflowOutputStorage = { materialize: async (attempt, output, context) => { if (failed) throw new Error("GCS temporarily down"); return storage.materialize(attempt, output, context); } };
  const service = new WorkflowExecutionService(store, { ...native, execute: calls }, outputStorage);
  await service.start("creator", captured.id); await service.drain(); expect((await store.get("creator", captured.id)).slots[0]?.delivery).toBe("storage-failed");
  failed = false; await service.reconcile("creator", captured.id); await service.drain(); expect((await store.get("creator", captured.id)).slots[0]?.delivery).toBe("ready"); expect(calls).toHaveBeenCalledTimes(1);
});

it("cancel before claim prevents dispatch; running cancellation stays explicitly unsupported", async () => {
  const queued = await accepted("cancel_queued"); const calls = vi.fn(native.execute); const service = new WorkflowExecutionService(store, { ...native, execute: calls }, storage);
  await service.cancel("creator", queued.id); await service.start("creator", queued.id); await service.drain(); expect(calls).not.toHaveBeenCalled();
  expect((await store.get("creator", queued.id)).slots[0]).toMatchObject({ outcome: "cancelled", cancellation: "confirmed" });
  const running = await accepted("cancel_running"); await store.claim("creator", running.id, running.slots[0]!.id);
  expect((await service.cancel("creator", running.id)).slots[0]).toMatchObject({ outcome: "running", cancellation: "unsupported" });
});

it("completion after trash is owned recovery and never restores the project or unrelated draft", async () => {
  const captured = await accepted("late_trash"); const claim = await store.claim("creator", captured.id, captured.slots[0]!.id); if (!claim.attempt) throw new Error("Missing claim");
  await projects.change("creator", captured.projectId, { expectedRevision: 1, status: "trashed" });
  const output = { kind: "image" as const, storagePath: "image-previews/creator/picture", model: "flux", provider: "replicate" };
  await store.produced(claim.attempt, output); await store.publish(claim.attempt, await storage.materialize(claim.attempt, output, { signal: AbortSignal.timeout(10000), deadlineAt: new Date(Date.now() + 10000).toISOString() }));
  expect((await store.recoveries("creator"))[0]).toMatchObject({ projectId: captured.projectId, association: "recovery" }); expect(await store.recoveries("other")).toEqual([]);
  expect((await projects.get("creator", captured.projectId)).status).toBe("trashed");
});

it("a timed-out claimed attempt becomes needs attention without redispatching and retains successful siblings", async () => {
  const captured = await accepted("partial", 2); const first = await store.claim("creator", captured.id, captured.slots[0]!.id); if (!first.attempt) throw new Error("Missing attempt");
  await database.collection("creation_requests").doc(captured.id).collection("execution_attempts").doc(first.attempt.slotId).set(ExecutionAttemptSchema.parse({ ...first.attempt, deadlineAt: "2026-10-10T00:00:00.000Z" }));
  const calls = vi.fn(native.execute); const service = new WorkflowExecutionService(store, { ...native, execute: calls }, storage);
  await service.start("creator", captured.id); await service.drain(); const saved = await store.get("creator", captured.id); expect(saved.slots[0]?.outcome).toBe("needs-attention"); expect(saved.slots[1]?.delivery).toBe("ready"); expect(calls).toHaveBeenCalledTimes(1);
});

it("text results are durable in ordinary conversation request history", async () => {
  const captured = await accepted("text", 1, true); const service = new WorkflowExecutionService(store, { available: () => true, execute: async () => ({ kind: "text", text: "An answer", provider: "controlled", model: "controlled" }) }, storage);
  await service.start("creator", captured.id); await service.drain(); expect((await store.get("creator", captured.id)).slots[0]).toMatchObject({ outcome: "completed", delivery: "ready", text: "An answer" });
});

it("captures only exact ready answers as context, counts their allowance and never applies them to a draft", async () => {
  const captured = await accepted("answer_context", 1, true);
  const answer = "Use warmer lighting. ".repeat(15);
  const service = new WorkflowExecutionService(store, { available: () => true, execute: async () => ({ kind: "text", text: answer, provider: "controlled", model: "controlled" }) }, storage);
  await service.start("creator", captured.id); await service.drain();
  const contexts = new CreationContextService(database, projects);
  const selected = { origin: "explicit", requestIds: [captured.id], projectInstructionsRevision: 1 };
  const materialized = await contexts.materialize("creator", captured.projectId, selected);
  expect(materialized.entries).toEqual([{ requestId: captured.id, instructions: "Private instructions", textOutputs: [{ slotId: captured.slots[0]!.id, text: answer }] }]);
  expect(instructionsFor({ ...captured, materializedContext: materialized }, catalog.get("text-ask")!)).toContain(answer);
  const conversations = new ConversationStore(database, projects); await conversations.create("creator", captured.projectId, { id: captured.conversationId, name: "Advice" });
  const drafts = new CreationDraftStore(database, projects, conversations);
  const draft = await drafts.create("creator", captured.projectId, captured.conversationId, { id: "draft_answer_context", content: { ...captured.snapshot, instructions: "Keep my own words", settings: { ...captured.snapshot.settings, parameters: {} }, context: selected } });
  const limited = { ...catalog.get("text-ask")!, maxContextCharacters: 100 };
  const preparation = createTestLifecycle({ database, projects, conversations, drafts, contexts, profiles: { get: () => limited }, media: new MediaVersionIndex(database, projects) });
  expect(await preparation.prepare("creator", captured.projectId, draft.id)).toMatchObject({ state: "blocked", reasons: [expect.objectContaining({ code: "context_limit" })] });
  expect((await drafts.get("creator", captured.projectId, draft.id)).instructions).toBe("Keep my own words");
  await expect(contexts.materialize("other", captured.projectId, selected)).rejects.toMatchObject({ code: "access_denied" });
});

it("deadline observation does not wait for or cancel an opaque native invocation", async () => {
  const captured = await accepted("hung"); let release!: () => void; let called!: () => void;
  const entered = new Promise<void>(resolve => { called = resolve; });
  const pending = new Promise<void>(resolve => { release = resolve; });
  const calls = vi.fn(async () => { called(); await pending; return { kind: "image" as const, storagePath: "image-previews/creator/late", provider: "replicate", model: "flux" }; });
  const service = new WorkflowExecutionService(store, { available: () => true, execute: calls }, storage, 2, () => Date.parse("2099-10-17T00:00:00.000Z"));
  await service.start("creator", captured.id); await entered;
  expect((await service.get("creator", captured.id)).slots[0]?.outcome).toBe("needs-attention"); expect(calls).toHaveBeenCalledTimes(1);
  release(); await service.drain();
  expect((await store.get("creator", captured.id)).slots[0]).toMatchObject({ outcome: "completed", delivery: "storage-failed" });
  await service.reconcile("creator", captured.id); await service.drain();
  expect((await store.get("creator", captured.id)).slots[0]?.delivery).toBe("ready"); expect(calls).toHaveBeenCalledTimes(1);
});

it("real prepare/submit HTTP admission reaches owned media and reloadable request history", async () => {
  const project = await projects.create("creator", { id: "project_route_dispatch", name: "API test" });
  const conversations = new ConversationStore(database, projects); const conversation = await conversations.create("creator", project.id, { id: "conversation_route_dispatch", name: "Ideas" });
  const drafts = new CreationDraftStore(database, projects, conversations);
  const draft = await drafts.create("creator", project.id, conversation.id, { id: "draft_route_dispatch", content: { action: "make-image", instructions: "A red boat", inputs: [], settings: { profileId: profile.id, profileRevision: profile.revision, parameters: { aspectRatio: "16:9" }, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: project.id, conversationId: conversation.id } } });
  const preparationDependencies = { database, projects, conversations, drafts, contexts: new CreationContextService(database, projects), profiles: catalog, media: new MediaVersionIndex(database, projects) };
  const calls = vi.fn(native.execute); const service = new WorkflowExecutionService(store, { ...native, execute: calls }, storage);
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { (req as RequestWithUser).user = { uid: "creator" }; next(); }); app.use("/requests", createCreationRequestRoutes(createTestLifecycle(preparationDependencies, service))); app.use(errorHandler);
  const prepared = await request(app).post("/requests/prepare").send({ projectId: project.id, draftId: draft.id }); expect(prepared.body.data.state).toBe("ready");
  const command = { projectId: project.id, submissionId: "submission_route_dispatch", draftId: draft.id, draftRevision: draft.revision, reviewedHash: prepared.body.data.reviewedHash };
  const first = await request(app).post("/requests").send(command); expect(first.status).toBe(200); await service.drain();
  const repeated = await request(app).post("/requests").send(command); expect(repeated.body.data.id).toBe(first.body.data.id); await service.drain(); expect(calls).toHaveBeenCalledTimes(1);
  const read = await request(app).get(`/requests/${first.body.data.id}`); expect(read.body.data.slots[0]).toMatchObject({ outcome: "completed", delivery: "ready" }); await service.drain();
  const history = await new RequestHistoryStore(database, projects).list("creator", project.id, conversation.id); expect(history[0]?.slots[0]?.versionId).toBe(read.body.data.slots[0].versionId);
});

it("dispatch concurrency is bounded while separate accepted requests wait", async () => {
  const requests = await Promise.all([accepted("bound_a"), accepted("bound_b"), accepted("bound_c")]);
  let release!: () => void; let entered!: () => void; let count = 0; let peak = 0;
  const twoRunning = new Promise<void>(resolve => { entered = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
  const execute = vi.fn(async () => { count += 1; peak = Math.max(peak, count); if (count === 2) entered(); await gate; count -= 1; return { kind: "image" as const, storagePath: "image-previews/creator/result", provider: "replicate", model: "flux" }; });
  const service = new WorkflowExecutionService(store, { available: () => true, execute }, storage, 2);
  await Promise.all(requests.map(captured => service.start("creator", captured.id))); await twoRunning; expect(execute).toHaveBeenCalledTimes(2);
  release(); await service.drain(); expect(execute).toHaveBeenCalledTimes(3); expect(peak).toBe(2);
});

it("status/cancel/reconcile reject anonymous and cross-owner access without leaking request data", async () => {
  const captured = await accepted("authorization"); const service = new WorkflowExecutionService(store, native, storage);
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { const owner = req.header("x-test-owner"); if (owner) (req as RequestWithUser).user = { uid: owner }; next(); });
  app.use("/requests", createCreationRequestRoutes(createTestLifecycle({ database, projects }, service))); app.use(errorHandler);
  for (const [method, suffix] of [["get", ""], ["post", "/cancel"], ["post", "/reconcile"], ["post", "/retry"]] as const) {
    expect((await request(app)[method](`/requests/${captured.id}${suffix}`).send({})).status).toBe(401);
    const denied = await request(app)[method](`/requests/${captured.id}${suffix}`).set("x-test-owner", "other").send({}); expect(denied.status).toBe(403); expect(JSON.stringify(denied.body)).not.toContain("Private instructions");
  }
  const invalid = await request(app).get("/requests/not-an-identity").set("x-test-owner", "creator"); expect(invalid.status).toBe(422);
});

it("repairs a native provider result after staging fails and the process restarts, without regeneration", async () => {
  const { NativeWorkflowExecutor } = await import("@services/creation-requests/execution");
  const captured = await accepted("native_staging");
  const run = vi.fn(async () => ({ predictionId: "prediction_confirmed", output: ["https://replicate.delivery/confirmed.webp"] }));
  const reserve = vi.fn(async () => true);
  const executor = new NativeWorkflowExecutor({ videos: null, ai: null, imageProviders: new Set(["replicate-flux-schnell"]), models: { runner: { run }, tools: { blackEditMask: vi.fn() } }, inputAccess: vi.fn(), spendGuard: { qualified: () => true, reserve } });
  const materialize = vi.fn(async (_attempt: ExecutionAttempt, output: NativeOutput): Promise<VerifiedOutput> => {
    expect(output).toMatchObject({ kind: "provider-media", sourceUrl: "https://replicate.delivery/confirmed.webp", mediaKind: "image", predictionId: "prediction_confirmed" });
    throw new Error("Staging is offline");
  });
  const first = new WorkflowExecutionService(store, executor, { materialize });
  await first.start("creator", captured.id); await first.drain();
  expect((await first.get("creator", captured.id)).slots[0]).toMatchObject({ outcome: "completed", delivery: "storage-failed" });
  await first.drain();
  expect((await store.attempts("creator", captured.id))[0]?.output).toMatchObject({ predictionId: "prediction_confirmed" });
  const restarted = new WorkflowExecutionService(store, executor, storage);
  await restarted.reconcile("creator", captured.id); await restarted.drain();
  expect((await store.get("creator", captured.id)).slots[0]).toMatchObject({ outcome: "completed", delivery: "ready" });
  expect(run).toHaveBeenCalledTimes(1); expect(reserve).toHaveBeenCalledTimes(1);
});

it("stops initial delivery at the attempt deadline and repairs known output under a new bounded window", async () => {
  const captured = await accepted("delivery_deadline");
  await database.collection("creation_outbox").doc(captured.id).update({ "profile.recovery.deadlineSeconds": 1 });
  const base = Date.now(); let clock = base;
  const timedStore = new WorkflowExecutionStore(database, new MediaVersionIndex(database, projects), () => new Date(base).toISOString());
  const execute = vi.fn(async () => { clock = base + 1000 - 25; return { kind: "image" as const, storagePath: "image-previews/creator/known", model: "flux", provider: "replicate" }; });
  let aborted = false;
  const materialize: WorkflowOutputStorage["materialize"] = async (_attempt, _output, context) => {
    expect(context.deadlineAt).toBe(new Date(base + 1000).toISOString());
    return new Promise((_resolve, reject) => { const stop = (): void => { aborted = true; reject(context.signal.reason); }; if (context.signal.aborted) stop(); else context.signal.addEventListener("abort", stop, { once: true }); });
  };
  const first = new WorkflowExecutionService(timedStore, { available: () => true, execute }, { materialize }, 2, () => clock);
  await first.start("creator", captured.id); await first.drain();
  expect(aborted).toBe(true); expect((await timedStore.get("creator", captured.id)).slots[0]).toMatchObject({ outcome: "completed", delivery: "storage-failed" });
  clock += 600000;
  const repaired = new WorkflowExecutionService(timedStore, { available: () => true, execute }, storage, 2, () => clock);
  await repaired.reconcile("creator", captured.id); await repaired.drain();
  expect((await timedStore.get("creator", captured.id)).slots[0]?.delivery).toBe("ready"); expect(execute).toHaveBeenCalledTimes(1);
});

it("shutdown aborts delivery while retaining confirmed output for a fresh process", async () => {
  const captured = await accepted("delivery_shutdown"); let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const execute = vi.fn(native.execute);
  const materialize: WorkflowOutputStorage["materialize"] = async (_attempt, _output, context) => {
    entered(); return new Promise((_resolve, reject) => { context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true }); });
  };
  const first = new WorkflowExecutionService(store, { ...native, execute }, { materialize });
  await first.start("creator", captured.id); await started;
  const stopping = new AbortController(); const drained = first.drain(stopping.signal); stopping.abort(new Error("Shutdown deadline")); await drained;
  expect((await store.get("creator", captured.id)).slots[0]).toMatchObject({ outcome: "completed", delivery: "storage-failed" });
  const restarted = new WorkflowExecutionService(store, { ...native, execute }, storage);
  await restarted.reconcile("creator", captured.id); await restarted.drain();
  expect((await store.get("creator", captured.id)).slots[0]?.delivery).toBe("ready"); expect(execute).toHaveBeenCalledTimes(1);
});

it("startup skips retired raw-key queued identities while completing valid accepted work", async () => {
  const retired = await accepted("retired_owner"); const valid = await accepted("valid_owner");
  await database.collection("creation_requests").doc(retired.id).update({ ownerId: "api-key:retired-key-fixture" });
  await database.collection("creation_outbox").doc(retired.id).update({ ownerId: "api-key:retired-key-fixture" });
  const execute = vi.fn(native.execute); const service = new WorkflowExecutionService(store, { ...native, execute }, storage);
  await service.initialize(); await service.drain();
  expect(execute.mock.calls.some(call => call[0]?.id === retired.id)).toBe(false);
  expect((await store.get("creator", valid.id)).slots[0]?.delivery).toBe("ready");
  await expect(store.get("api-key:retired-key-fixture", retired.id)).rejects.toThrow("unavailable");
});

it("keeps the previous serialized attempt format readable while retaining provider evidence", async () => {
  const captured = await accepted("compatible_evidence");
  const execute = vi.fn(async (): Promise<NativeOutput> => ({ kind: "provider-media", mediaKind: "image", sourceUrl: "https://provider.test/known.png", predictionId: "prediction_compatible", model: "flux", provider: "replicate" }));
  const service = new WorkflowExecutionService(store, { available: () => true, execute }, storage);
  await service.start("creator", captured.id); await service.drain();
  const slot = captured.slots[0]!;
  // Previous releases accept an absent optional output, but reject the new discriminant in that field.
  const serialized = (await database.collection("creation_requests").doc(captured.id).collection("execution_attempts").doc(slot.id).get()).data();
  expect(serialized?.state).toBe("published"); expect(serialized?.output).toBeUndefined();
  expect((await store.attempts("creator", captured.id))[0]?.output).toMatchObject({ kind: "provider-media", predictionId: "prediction_compatible" });
  expect((await service.get("creator", captured.id)).slots[0]?.delivery).toBe("ready"); await service.drain();
  expect(execute).toHaveBeenCalledTimes(1);
});
