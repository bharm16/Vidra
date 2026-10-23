import { afterAll, expect, it, vi } from "vitest";
import { AcceptedRequestSchema, type AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { ProjectStore } from "@services/projects/ProjectStore";
import { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { WorkflowCapabilityCatalog, workflowRuntimeProfiles } from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";
import { REPLICATE_MODEL_DEFINITIONS } from "@services/creation-requests/replicate-models";
import { WorkflowOutboxSchema } from "@services/admission/idempotency/workflowReceipts";
import { WorkflowExecutionStore } from "@services/creation-requests/execution/WorkflowExecutionStore";
import { WorkflowExecutionService } from "@services/creation-requests/execution/WorkflowExecutionService";
import { NativeWorkflowExecutor } from "@services/creation-requests/execution/NativeWorkflowExecutor";
import { StudioWorkflowSpendGuard } from "@services/creation-requests/execution/StudioWorkflowSpendGuard";
import { DEFAULT_WORKFLOW_SPEND_POLICY, workflowSpendMappingHash } from "@services/creation-requests/execution/workflowSpendPolicy";
import type { WorkflowOutputStorage } from "@services/creation-requests/execution/types";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase(); const projects = new ProjectStore(database);
const NOW = "2026-10-17T12:00:00.000Z"; const DAY = "2026-10-17";
const store = new WorkflowExecutionStore(database, new MediaVersionIndex(database, projects), () => NOW);
const guard = new StudioWorkflowSpendGuard(database, { dailyCapCents: 500 }, () => Date.parse(NOW));
const catalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(["replicate-flux-schnell", "replicate-flux-kontext-fast"]), videoAvailable: () => true, textAvailable: true, textProvider: "controlled", textModel: "controlled-text", replicateAvailable: true, spendGuard: guard });
const outputStorage: WorkflowOutputStorage = { materialize: vi.fn() };
afterAll(async () => { await database.terminate(); });

async function accepted(suffix: string, owner = `spender_${suffix}`, profile: CapabilityProfile = catalog.get("flux-schnell")!): Promise<AcceptedRequest> {
  const project = await projects.create(owner, { id: `project_spend_${suffix}`, name: "Budget test" });
  const parameters = Object.fromEntries(Object.entries(profile.parameters).flatMap(([key, value]) => value.policy === "fixed" ? [[key, value.value]] : value.policy === "editable" ? [[key, value.defaultValue]] : []));
  const request = AcceptedRequestSchema.parse({ schemaVersion: "vidra-workflow/v2", id: `request_spend_${suffix}`, ownerId: owner, projectId: project.id, conversationId: `conversation_spend_${suffix}`, submissionId: `submission_spend_${suffix}`, executionDraftId: `draft_spend_${suffix}`, executionDraftRevision: 1, acceptanceSequence: 1, snapshotHash: "a".repeat(64), acceptedAt: NOW, snapshot: { action: profile.action, instructions: "A boat", inputs: [], settings: { profileId: profile.id, profileRevision: profile.revision, parameters, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: project.id, conversationId: `conversation_spend_${suffix}` } }, materializedContext: { projectInstructions: "", entries: [] }, slots: [{ id: `slot_spend_${suffix}`, ordinal: 1, outcome: "queued", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 } }] });
  await database.collection("creation_requests").doc(request.id).create(request);
  await database.collection("creation_outbox").doc(request.id).create(WorkflowOutboxSchema.parse({ schemaVersion: "vidra-execution/v2", ownerId: owner, projectId: project.id, requestId: request.id, state: "queued", profile, deadlineAt: "2026-10-18T00:00:00.000Z", createdAt: NOW }));
  return request;
}
async function usage(owner: string): Promise<number> { return Number((await database.collection("studio_usage").doc(`${owner}_${DAY}`).get()).data()?.reservedCents ?? 0); }

it("an exhausted existing Studio allowance blocks native pictures before the provider and creates no second counter", async () => {
  const request = await accepted("exhausted");
  await database.collection("studio_usage").doc(`${request.ownerId}_${DAY}`).create({ userId: request.ownerId, day: DAY, reservedCents: 500 });
  const images = { generatePreview: vi.fn() };
  const executor = new NativeWorkflowExecutor({ images, videos: null, ai: null, imageProviders: new Set(["replicate-flux-schnell"]), spendGuard: guard, inputAccess: vi.fn() });
  const service = new WorkflowExecutionService(store, executor, outputStorage);
  await service.start(request.ownerId, request.id); await service.drain();
  expect(images.generatePreview).not.toHaveBeenCalled(); expect(await usage(request.ownerId)).toBe(500);
  expect((await store.get(request.ownerId, request.id)).slots[0]).toMatchObject({ outcome: "failed", error: { code: "not_started", message: expect.stringContaining("daily free-testing allowance") } });
  expect((await store.attempts(request.ownerId, request.id))[0]?.spend).toBeUndefined();
});

it("concurrent canonical slots share the same last Studio cent while a replay reserves only once", async () => {
  const owner = "spender_race"; const first = await accepted("race_a", owner); const second = await accepted("race_b", owner);
  await database.collection("studio_usage").doc(`${owner}_${DAY}`).create({ userId: owner, day: DAY, reservedCents: 499 });
  const claimed = await Promise.all([store.claim(owner, first.id, first.slots[0]!.id), store.claim(owner, second.id, second.slots[0]!.id)]);
  const outcomes = await Promise.allSettled(claimed.map(item => guard.reserve(item.request, item.request.slots[0]!, catalog.get("flux-schnell")!)));
  expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1); expect(await usage(owner)).toBe(500);
  const winner = claimed.find((_item, index) => outcomes[index]?.status === "fulfilled")!;
  expect(await Promise.all([guard.reserve(winner.request, winner.request.slots[0]!, catalog.get("flux-schnell")!), guard.reserve(winner.request, winner.request.slots[0]!, catalog.get("flux-schnell")!)])).toEqual([false, false]);
  expect(await usage(owner)).toBe(500); expect((await store.attempts(owner, winner.request.id))[0]?.spend).toMatchObject({ authority: "studio_usage/v1", cents: 1, day: DAY });
});

it("unknown native outcomes keep the one reservation and cannot obtain a free redispatch after refresh", async () => {
  const request = await accepted("unknown"); const images = { generatePreview: vi.fn(async () => { throw new Error("Response lost after provider acceptance"); }) };
  const executor = new NativeWorkflowExecutor({ images, videos: null, ai: null, imageProviders: new Set(["replicate-flux-schnell"]), spendGuard: guard, inputAccess: vi.fn() });
  const service = new WorkflowExecutionService(store, executor, outputStorage);
  await service.start(request.ownerId, request.id); await service.drain();
  expect(images.generatePreview).toHaveBeenCalledTimes(1); expect(await usage(request.ownerId)).toBe(1); expect((await store.get(request.ownerId, request.id)).slots[0]?.outcome).toBe("needs-attention");
  await service.reconcile(request.ownerId, request.id); await service.drain(); expect(images.generatePreview).toHaveBeenCalledTimes(1); expect(await usage(request.ownerId)).toBe(1);
  await expect(executor.execute(request, request.slots[0]!, catalog.get("flux-schnell")!, "A boat")).rejects.toThrow("already has a provider reservation"); expect(images.generatePreview).toHaveBeenCalledTimes(1);
});

it("video uses its maximum-settings ceiling before any native call", async () => {
  const profile = catalog.get("wan-2.2-t2v")!; const request = await accepted("video", "spender_video", profile);
  await database.collection("studio_usage").doc(`${request.ownerId}_${DAY}`).create({ userId: request.ownerId, day: DAY, reservedCents: 481 });
  const videos = { getModelAvailability: () => ({ id: profile.endpoint, available: true }), generateVideo: vi.fn() };
  const service = new WorkflowExecutionService(store, new NativeWorkflowExecutor({ images: null, videos, ai: null, imageProviders: new Set(), spendGuard: guard, inputAccess: vi.fn() }), outputStorage);
  await service.start(request.ownerId, request.id); await service.drain(); expect(videos.generateVideo).not.toHaveBeenCalled(); expect(await usage(request.ownerId)).toBe(481);
});

it("missing, expired or changed mappings fail closed, including unqualified text costs", () => {
  const unstorable = new Set(REPLICATE_MODEL_DEFINITIONS.flatMap(definition => definition.unavailableReason ? [definition.profile.id] : []));
  expect(catalog.list().filter(profile => profile.mode !== "text-assistance" && !unstorable.has(profile.id)).every(profile => profile.availability === "qualified")).toBe(true);
  expect(catalog.list().filter(profile => profile.mode === "text-assistance").every(profile => profile.availability === "unavailable")).toBe(true);
  const profile = catalog.get("wan-2.5-i2v")!;
  expect(guard.qualified({ ...profile, parameters: { ...profile.parameters, durationSeconds: { policy: "editable", domain: { kind: "enum", values: [5, 10, 30] }, defaultValue: 5 } } })).toBe(false);
  expect(new StudioWorkflowSpendGuard(database, { dailyCapCents: 500 }, () => Date.parse("2027-01-01T00:00:00.000Z")).qualified(profile)).toBe(false);
  const executor = new NativeWorkflowExecutor({ images: { generatePreview: vi.fn() }, videos: null, ai: null, imageProviders: new Set(["replicate-flux-schnell"]), inputAccess: vi.fn() });
  expect(executor.available(catalog.get("flux-schnell")!)).toBe(false);
});

it("an explicitly qualified text ceiling shares the same cap and cannot bypass it through Ask", async () => {
  const textProfile = workflowRuntimeProfiles({ imageProviders: new Set(), videoAvailable: () => false, textAvailable: true, textProvider: "controlled", textModel: "controlled-text", spendGuard: { qualified: () => true } }).find(profile => profile.id === "text-ask")!;
  const textGuard = new StudioWorkflowSpendGuard(database, { dailyCapCents: 500, policy: { ...DEFAULT_WORKFLOW_SPEND_POLICY, revision: "controlled-text-test", ceilings: [...DEFAULT_WORKFLOW_SPEND_POLICY.ceilings, { profileId: textProfile.id, profileRevision: textProfile.revision, mappingHash: workflowSpendMappingHash(textProfile), maximumCentsPerSlot: 5, source: "https://controlled.test/pricing" }] } }, () => Date.parse(NOW));
  const request = await accepted("text", "spender_text", textProfile);
  await database.collection("studio_usage").doc(`${request.ownerId}_${DAY}`).create({ userId: request.ownerId, day: DAY, reservedCents: 496 });
  const execute = vi.fn(); const ai = { execute, resolveExecution: () => ({ client: "controlled", provider: "openai" as const, model: "controlled-text", viaFallback: false }), getAvailableClients: () => ["controlled"] };
  const service = new WorkflowExecutionService(store, new NativeWorkflowExecutor({ images: null, videos: null, ai, imageProviders: new Set(), spendGuard: textGuard, inputAccess: vi.fn() }), outputStorage);
  await service.start(request.ownerId, request.id); await service.drain(); expect(execute).not.toHaveBeenCalled(); expect(await usage(request.ownerId)).toBe(496);
});

it("a Gemini Omni clip over 11 s is still delivered but holds its profile on every instance, before any further spend", async () => {
  const profile = catalog.get("gemini-omni-1.1-t2v")!; const run = vi.fn(async (): Promise<unknown> => "https://replicate.delivery/clip.mp4");
  const models = { runner: { run }, outputs: { storePicture: vi.fn(), storeAudio: vi.fn(), storeVideo: vi.fn(async () => "native-video-asset") }, tools: { blackEditMask: vi.fn() } };
  const native = (spendGuard: StudioWorkflowSpendGuard): NativeWorkflowExecutor => new NativeWorkflowExecutor({ images: null, videos: null, ai: null, imageProviders: new Set(), spendGuard, models, inputAccess: vi.fn() });
  const twelveSeconds: WorkflowOutputStorage = { materialize: async attempt => ({ object: { identity: "verified", assetId: attempt.slotId, storagePath: `users/${attempt.ownerId}/previews/videos/workflow-${attempt.slotId}.mp4`, generation: "1", sha256: "b".repeat(64), bytes: 20 }, metadata: { state: "verified", width: 1280, height: 720, durationSeconds: 12, audio: "present", probeVersion: "controlled" } }) };
  const first = new StudioWorkflowSpendGuard(database, { dailyCapCents: 500 }, () => Date.parse(NOW)); const request = await accepted("omni_long", "spender_omni", profile);
  const service = new WorkflowExecutionService(store, native(first), twelveSeconds); await service.start(request.ownerId, request.id); await service.drain();
  expect((await store.get(request.ownerId, request.id)).slots[0]).toMatchObject({ outcome: "completed", delivery: "ready" }); expect(await usage(request.ownerId)).toBe(495);
  expect((await database.collection("workflow_spend_holds").doc(profile.id).get()).data()).toMatchObject({ maximumOutputSeconds: 11, observedSeconds: 12, requestId: request.id });
  expect(first.qualified(profile)).toBe(false);
  const restarted = new StudioWorkflowSpendGuard(database, { dailyCapCents: 500 }, () => Date.parse(NOW)); const next = await accepted("omni_next", "spender_omni_next", profile);
  const again = new WorkflowExecutionService(store, native(restarted), twelveSeconds); await again.start(next.ownerId, next.id); await again.drain();
  expect(run).toHaveBeenCalledTimes(1); expect(await usage(next.ownerId)).toBe(0); expect(restarted.qualified(profile)).toBe(false);
  expect((await store.get(next.ownerId, next.id)).slots[0]).toMatchObject({ outcome: "failed", error: { code: "not_started", message: expect.stringContaining("unavailable during bounded free testing") } });
});
