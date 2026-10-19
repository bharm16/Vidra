import { expect, it, vi } from "vitest";
import { AcceptedRequestSchema } from "@shared/schemas/workflow/request.schemas";
import { WorkflowCapabilityCatalog } from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";
import { NativeWorkflowExecutor, type NativeWorkflowExecutorDeps } from "../NativeWorkflowExecutor";

const qualifiedSpend = { qualified: (): boolean => true, reserve: vi.fn(async (): Promise<boolean> => true) };
const catalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(["replicate-flux-schnell", "replicate-flux-kontext-fast"]), videoAvailable: () => true, textAvailable: true, spendGuard: qualifiedSpend });
function captured(profileId: string): ReturnType<typeof AcceptedRequestSchema.parse> {
  const profile = catalog.get(profileId);
  if (!profile) throw new Error("Missing fixture profile");
  const parameters = Object.fromEntries(Object.entries(profile.parameters).flatMap(([key, value]) => value.policy === "fixed" ? [[key, value.value]] : value.policy === "editable" ? [[key, value.defaultValue]] : []));
  return AcceptedRequestSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "request_native", ownerId: "creator", projectId: "project_native", conversationId: "conversation_native", submissionId: "submission_native", executionDraftId: "draft_native", executionDraftRevision: 1, acceptanceSequence: 1, snapshotHash: "a".repeat(64), acceptedAt: "2026-10-17T00:00:00.000Z", snapshot: { action: profile.action, instructions: "A red boat", inputs: profile.inputs.map(input => ({ role: input.role, state: "resolved", versionId: "version_source" })), settings: { profileId: profile.id, profileRevision: profile.revision, parameters, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_native", conversationId: "conversation_native" } }, materializedContext: { projectInstructions: "", entries: [] }, slots: [{ id: "slot_native", ordinal: 1, outcome: "running", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 } }] });
}
function dependencies(): NativeWorkflowExecutorDeps {
  return { images: { generatePreview: vi.fn(async () => ({ imageUrl: "https://media.test/picture", storagePath: "image-previews/creator/picture", metadata: { model: "black-forest-labs/flux-schnell", duration: 1, aspectRatio: "16:9", generatedAt: "2026-10-17T00:00:00.000Z" } })) }, videos: { generateVideo: vi.fn(async () => ({ assetId: "native-clip", videoUrl: "https://media.test/clip", contentType: "video/mp4" })), getModelAvailability: () => ({ id: "wan", available: true }) }, ai: null, imageProviders: new Set(["replicate-flux-schnell", "replicate-flux-kontext-fast"]), inputAccess: vi.fn(async () => "https://media.test/owned-input"), spendGuard: qualifiedSpend };
}

it("uses the explicit native image provider without a picture-to-clip prerequisite", async () => {
  const deps = dependencies(); const executor = new NativeWorkflowExecutor(deps); const request = captured("flux-schnell");
  await expect(executor.execute(request, request.slots[0]!, catalog.get("flux-schnell")!, "A red boat")).resolves.toMatchObject({ kind: "image", storagePath: "image-previews/creator/picture" });
  expect(deps.images?.generatePreview).toHaveBeenCalledWith("A red boat", { userId: "creator", provider: "replicate-flux-schnell", aspectRatio: "16:9" });
  expect(deps.videos?.generateVideo).not.toHaveBeenCalled(); expect(deps.inputAccess).not.toHaveBeenCalled();
});

it("maps exact text-video parameters directly and retains start-frame ownership for animation", async () => {
  const deps = dependencies(); const executor = new NativeWorkflowExecutor(deps); const text = captured("wan-2.2-t2v");
  await executor.execute(text, text.slots[0]!, catalog.get("wan-2.2-t2v")!, "A red boat");
  expect(deps.videos?.generateVideo).toHaveBeenLastCalledWith("A red boat", expect.objectContaining({ model: "wan-video/wan-2.2-t2v-fast", size: "1280*720", numFrames: 81, fps: 16, promptExtend: false }));
  const animation = captured("wan-2.5-i2v"); await executor.execute(animation, animation.slots[0]!, catalog.get("wan-2.5-i2v")!, "A red boat");
  expect(deps.inputAccess).toHaveBeenCalledWith("creator", "project_native", "version_source");
  expect(deps.videos?.generateVideo).toHaveBeenLastCalledWith("A red boat", expect.objectContaining({ startImage: "https://media.test/owned-input", seconds: "5", size: "720p" }));
});

it("fails before native invocation when an exact input loses access", async () => {
  const deps = dependencies(); deps.inputAccess = vi.fn(async () => { throw new Error("private owner data"); }); const executor = new NativeWorkflowExecutor(deps); const request = captured("flux-kontext-fast");
  await expect(executor.execute(request, request.slots[0]!, catalog.get("flux-kontext-fast")!, "Edit")).rejects.toThrow("This selected input is unavailable");
  expect(deps.images?.generatePreview).not.toHaveBeenCalled();
});

it("offers only configured mapped actions and does not advertise native cancellation or unknown settings", () => {
  const missing = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(), videoAvailable: () => false, textAvailable: false });
  expect(missing.list().every(profile => profile.availability === "unavailable")).toBe(true);
  expect(catalog.get("flux-schnell")?.parameters.aspectRatio).toMatchObject({ domain: { values: expect.not.arrayContaining(["3:4", "4:3"]) } });
  expect(catalog.list().every(profile => profile.recovery.cancel === "unsupported")).toBe(true);
});

it("executes text advice once through aiService without its JSON default or cross-provider fallback", async () => {
  const deps = dependencies();
  const resolved = { client: "openai", provider: "openai" as const, model: "text-model", viaFallback: false };
  const execute = vi.fn(async () => ({ text: "Use warmer lighting.", metadata: {}, executedBy: resolved }));
  deps.ai = { execute, resolveExecution: () => resolved, getAvailableClients: () => ["openai"] };
  const textCatalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(), videoAvailable: () => false, textAvailable: true, textProvider: "openai", textModel: "text-model", spendGuard: qualifiedSpend });
  const profile = textCatalog.get("text-ask")!;
  const request = AcceptedRequestSchema.parse({ ...captured("text-ask"), snapshot: { ...captured("text-ask").snapshot, settings: { profileId: profile.id, profileRevision: profile.revision, outputCount: 1, parameters: {} } } });
  const executor = new NativeWorkflowExecutor(deps);
  await expect(executor.execute(request, request.slots[0]!, profile, "How can I improve the lighting?")).resolves.toMatchObject({ kind: "text", text: "Use warmer lighting.", provider: "openai", model: "text-model" });
  expect(execute).toHaveBeenCalledTimes(1); expect(execute).toHaveBeenCalledWith("studio_turn", expect.objectContaining({ responseFormat: { type: "text" }, maxRetries: 0 }));
  expect(deps.images?.generatePreview).not.toHaveBeenCalled(); expect(deps.videos?.generateVideo).not.toHaveBeenCalled();
});
