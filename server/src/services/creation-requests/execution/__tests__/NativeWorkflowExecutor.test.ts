import { expect, it, vi } from "vitest";
import { isParameterValueInDomain } from "@shared/schemas/workflow/capability.schemas";
import { AcceptedRequestSchema } from "@shared/schemas/workflow/request.schemas";
import {
  WorkflowCapabilityCatalog,
  isWorkflowProfileRuntimeAvailable,
  resolveWorkflowAdapterBinding,
} from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";
import { NativeWorkflowExecutor, type NativeWorkflowExecutorDeps } from "../NativeWorkflowExecutor";
import { instructionsFor } from "../types";

const qualifiedSpend = { qualified: (): boolean => true, reserve: vi.fn(async (): Promise<boolean> => true) };
const catalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(["replicate-flux-schnell", "replicate-flux-kontext-fast"]), videoAvailable: () => true, textAvailable: true, spendGuard: qualifiedSpend });
function captured(profileId: string): ReturnType<typeof AcceptedRequestSchema.parse> {
  const profile = catalog.get(profileId);
  if (!profile) throw new Error("Missing fixture profile");
  const parameters = Object.fromEntries(Object.entries(profile.parameters).flatMap(([key, value]) => value.policy === "fixed" ? [[key, value.value]] : value.policy === "editable" ? [[key, value.defaultValue]] : []));
  return AcceptedRequestSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "request_native", ownerId: "creator", projectId: "project_native", conversationId: "conversation_native", submissionId: "submission_native", executionDraftId: "draft_native", executionDraftRevision: 1, acceptanceSequence: 1, snapshotHash: "a".repeat(64), acceptedAt: "2026-10-17T00:00:00.000Z", snapshot: { action: profile.action, instructions: "A red boat", inputs: profile.inputs.map(input => ({ role: input.role, state: "resolved", versionId: "version_source" })), settings: { profileId: profile.id, profileRevision: profile.revision, parameters, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_native", conversationId: "conversation_native" } }, materializedContext: { projectInstructions: "", entries: [] }, slots: [{ id: "slot_native", ordinal: 1, outcome: "running", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 } }] });
}
function dependencies(): NativeWorkflowExecutorDeps {
  return { prepareVideoInput: vi.fn(async (url: string) => url), models: nativeModels(), videos: { getModelAvailability: () => ({ id: "wan", available: true }) }, ai: null, imageProviders: new Set(["replicate-flux-schnell", "replicate-flux-kontext-fast"]), inputAccess: vi.fn(async () => "https://media.test/owned-input.png"), spendGuard: qualifiedSpend };
}

it("uses the explicit native image provider without a picture-to-clip prerequisite", async () => {
  const deps = dependencies(); const executor = new NativeWorkflowExecutor(deps); const request = captured("flux-schnell");
  await expect(executor.execute(request, request.slots[0]!, catalog.get("flux-schnell")!, "A red boat")).resolves.toMatchObject({ kind: "provider-media", mediaKind: "image", sourceUrl: "https://replicate.delivery/result.png" });
  expect(deps.models?.runner.run).toHaveBeenCalledWith(expect.objectContaining({ model: "black-forest-labs/flux-schnell", input: expect.objectContaining({ prompt: "A red boat", aspect_ratio: "16:9" }) }));
  expect(deps.inputAccess).not.toHaveBeenCalled();
});

it("maps exact text-video parameters directly and retains start-frame ownership for animation", async () => {
  const deps = dependencies(); const executor = new NativeWorkflowExecutor(deps); const text = captured("wan-2.2-t2v");
  await executor.execute(text, text.slots[0]!, catalog.get("wan-2.2-t2v")!, "A red boat");
  expect(deps.models?.runner.run).toHaveBeenLastCalledWith(expect.objectContaining({ model: "wan-video/wan-2.2-t2v-fast", input: expect.objectContaining({ resolution: "720p", num_frames: 81, frames_per_second: 16, optimize_prompt: false }) }));
  const animation = captured("wan-2.5-i2v"); await executor.execute(animation, animation.slots[0]!, catalog.get("wan-2.5-i2v")!, "A red boat");
  expect(deps.inputAccess).toHaveBeenCalledWith("creator", "project_native", "version_source");
  expect(deps.models?.runner.run).toHaveBeenLastCalledWith(expect.objectContaining({ model: "wan-video/wan-2.5-i2v", input: expect.objectContaining({ image: "https://media.test/owned-input.png", duration: 5, resolution: "720p" }) }));
});

it("fails before native invocation when an exact input loses access", async () => {
  const deps = dependencies(); deps.inputAccess = vi.fn(async () => { throw new Error("private owner data"); }); const executor = new NativeWorkflowExecutor(deps); const request = captured("flux-kontext-fast");
  await expect(executor.execute(request, request.slots[0]!, catalog.get("flux-kontext-fast")!, "Edit")).rejects.toThrow("This selected input is unavailable");
  expect(deps.models?.runner.run).not.toHaveBeenCalled();
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
  expect(deps.models?.runner.run).not.toHaveBeenCalled();
});

it("shares parameter domain validation and adapter binding across catalog and executor", () => {
  expect(isParameterValueInDomain({ kind: "range", min: 0.1, max: 1.0, step: 0.1 }, 0.3)).toBe(true);
  expect(isParameterValueInDomain({ kind: "range", min: 0.1, max: 1.0, step: 0.1 }, 0.35)).toBe(false);
  expect(resolveWorkflowAdapterBinding(catalog.get("flux-kontext-fast")!)).toEqual({
    kind: "image",
    providerId: "replicate-flux-kontext-fast",
    requiresPrimaryImage: true,
  });
  expect(
    isWorkflowProfileRuntimeAvailable(catalog.get("flux-schnell")!, {
      imageProviders: new Set(["replicate-flux-schnell"]),
      videoAvailable: () => false,
      textAvailable: false,
      spendGuard: qualifiedSpend,
    }),
  ).toBe(true);
});

const nativeCatalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(), videoAvailable: () => false, textAvailable: false, replicateAvailable: true, spendGuard: qualifiedSpend });
function nativeModels(result: unknown = ["https://replicate.delivery/result.png"]): NonNullable<NativeWorkflowExecutorDeps["models"]> & { runner: { run: ReturnType<typeof vi.fn> } } {
  return { runner: { run: vi.fn(async () => ({ predictionId: "prediction_native", output: result })) }, tools: { blackEditMask: vi.fn(async () => "data:image/png;base64,TUFTSw==") } };
}

it("runs an exact native model after its checks and stages the result under the owner", async () => {
  const models = nativeModels(); const reserve = vi.fn(async (): Promise<boolean> => true);
  const executor = new NativeWorkflowExecutor({ ...dependencies(), models, spendGuard: { qualified: () => true, reserve } });
  const request = captured("nano-banana-2.1-edit");
  await expect(executor.execute(request, request.slots[0]!, nativeCatalog.get("nano-banana-2.1-edit")!, "Warm it up")).resolves.toEqual({ kind: "provider-media", mediaKind: "image", sourceUrl: "https://replicate.delivery/result.png", predictionId: "prediction_native", model: "google/nano-banana-2.1", provider: "replicate" });
  expect(reserve).toHaveBeenCalledTimes(1);
  expect(models.runner.run).toHaveBeenCalledWith(expect.objectContaining({ model: "google/nano-banana-2.1", userId: "creator", input: expect.objectContaining({ prompt: "Warm it up", image_input: ["https://media.test/owned-input.png", "https://media.test/owned-input.png"] }) }));
});

it("refuses a native request before reserving spend or calling the model", async () => {
  const models = nativeModels(); const reserve = vi.fn(async (): Promise<boolean> => true);
  const executor = new NativeWorkflowExecutor({ ...dependencies(), models, spendGuard: { qualified: () => true, reserve } });
  const request = captured("topaz-image-upscale");
  await expect(executor.execute(request, request.slots[0]!, nativeCatalog.get("topaz-image-upscale")!, "")).rejects.toThrow("size must be checked");
  expect(reserve).not.toHaveBeenCalled(); expect(models.runner.run).not.toHaveBeenCalled();
});

it("offers native models only while a Replicate runner is configured", () => {
  expect(new NativeWorkflowExecutor({ ...dependencies(), models: null }).available(nativeCatalog.get("wan-3-t2v")!)).toBe(false);
  expect(new NativeWorkflowExecutor({ ...dependencies(), models: nativeModels() }).available(nativeCatalog.get("wan-3-t2v")!)).toBe(true);
  expect(catalog.get("wan-3-t2v")?.availability).toBe("unavailable");
});

it("delivers transcripts as text and voiceovers as staged audio", async () => {
  const transcript = nativeModels({ text: "Hi.", language_code: "en", language_probability: 1, words: [{ text: "Hi.", type: "word", start: 0, end: 0.4 }] });
  const scribe = captured("elevenlabs-scribe-v2");
  await expect(new NativeWorkflowExecutor({ ...dependencies(), models: transcript }).execute(scribe, scribe.slots[0]!, nativeCatalog.get("elevenlabs-scribe-v2")!, "")).resolves.toMatchObject({ kind: "text", text: expect.stringMatching(/^WEBVTT/), model: "elevenlabs/scribe-v2" });
  const voice = nativeModels("https://replicate.delivery/voice.mp3");
  const script = captured("elevenlabs-v3");
  await expect(new NativeWorkflowExecutor({ ...dependencies(), models: voice }).execute(script, script.slots[0]!, nativeCatalog.get("elevenlabs-v3")!, "Context\n\nA red boat")).resolves.toEqual({ kind: "provider-media", mediaKind: "audio", sourceUrl: "https://replicate.delivery/voice.mp3", predictionId: "prediction_native", model: "elevenlabs/v3", provider: "replicate" });
  expect(voice.runner.run).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ prompt: "A red boat" }) }));
});

it("sends a picture or clip model only the project instructions and current words, keeping history for text answers", () => {
  const withHistory = (profileId: string): ReturnType<typeof AcceptedRequestSchema.parse> => { const base = captured(profileId); return AcceptedRequestSchema.parse({ ...base, snapshot: { ...base.snapshot, context: { origin: "branch", parentRequestId: "request_earlier", requestIds: ["request_earlier"], projectInstructionsRevision: 1 } }, materializedContext: { projectInstructions: "Warm film look", entries: [{ requestId: "request_earlier", instructions: "A golden retriever on a beach" }] } }); };
  const picture = catalog.get("flux-schnell"); const text = catalog.get("text-ask");
  if (!picture || !text) throw new Error("Missing fixture profiles");
  expect(instructionsFor(withHistory("flux-schnell"), picture)).toBe("Project instructions:\nWarm film look\n\nA red boat");
  expect(instructionsFor(withHistory("text-ask"), text)).toContain("Previous request:\nA golden retriever on a beach");
});

it("returns confirmed provider evidence before any media staging can fail", async () => {
  const models = nativeModels();
  const executor = new NativeWorkflowExecutor({ ...dependencies(), models });
  const request = captured("nano-banana-2.1-edit");
  await expect(executor.execute(request, request.slots[0]!, nativeCatalog.get("nano-banana-2.1-edit")!, "Warm it up")).resolves.toMatchObject({
    kind: "provider-media", mediaKind: "image", sourceUrl: "https://replicate.delivery/result.png",
  });
});

it("refuses failed extensionless start-frame preparation before reserving or invoking", async () => {
  const deps = dependencies(); const reserve = vi.fn(async () => true);
  deps.prepareVideoInput = vi.fn(async () => { throw new Error("Input transport failed"); });
  deps.inputAccess = vi.fn(async () => "https://media.test/extensionless"); deps.spendGuard = { qualified: () => true, reserve };
  const request = captured("wan-2.5-i2v");
  await expect(new NativeWorkflowExecutor(deps).execute(request, request.slots[0]!, catalog.get("wan-2.5-i2v")!, "Boat")).rejects.toThrow("start frame could not be prepared");
  expect(reserve).not.toHaveBeenCalled(); expect(deps.models?.runner.run).not.toHaveBeenCalled();
});

it("refuses retired raw-key owners before reserving or sending a native model request", async () => {
  const deps = dependencies(); const reserve = vi.fn(async () => true); deps.spendGuard = { qualified: () => true, reserve };
  const request = { ...captured("flux-schnell"), ownerId: "api-key:retired-key-fixture" };
  await expect(new NativeWorkflowExecutor(deps).execute(request, request.slots[0]!, catalog.get("flux-schnell")!, "Boat")).rejects.toThrow("owner is unavailable");
  expect(reserve).not.toHaveBeenCalled(); expect(deps.models?.runner.run).not.toHaveBeenCalled();
});
