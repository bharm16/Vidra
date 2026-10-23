import type { Firestore } from "firebase-admin/firestore";
import { expect, it, vi } from "vitest";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { WorkflowCapabilityCatalog } from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";
import { REPLICATE_MODEL_DEFINITIONS } from "@services/creation-requests/replicate-models";
import { StudioWorkflowSpendGuard } from "../StudioWorkflowSpendGuard";
import { ExecutionAttemptSchema, type ExecutionAttempt, type VerifiedOutput } from "../types";
import { DEFAULT_WORKFLOW_SPEND_POLICY } from "../workflowSpendPolicy";

const now = (): number => Date.parse("2026-10-20T00:00:00.000Z");
const unusedDatabase = {} as unknown as Firestore;
function produced(profile: CapabilityProfile): ExecutionAttempt {
  return ExecutionAttemptSchema.parse({ requestId: "request_omni", slotId: "slot_omni", ownerId: "creator", projectId: "project_omni", token: "token_omni", snapshotHash: "a".repeat(64), state: "produced", startedAt: "2026-10-20T00:00:00.000Z", deadlineAt: "2026-10-20T00:30:00.000Z", profile, sentInstructions: "A red boat", output: { kind: "video", assetId: "native-video-asset", model: profile.endpoint, provider: "replicate" } });
}
function clip(durationSeconds: number): VerifiedOutput {
  return { object: { identity: "verified", assetId: "slot_omni", storagePath: "users/creator/previews/videos/workflow-slot_omni.mp4", generation: "1", sha256: "b".repeat(64), bytes: 20 }, metadata: { state: "verified", width: 1280, height: 720, durationSeconds, audio: "present", probeVersion: "controlled" } };
}

it("qualifies every native Replicate model within the existing daily free-testing cap", () => {
  const guard = new StudioWorkflowSpendGuard(unusedDatabase, { dailyCapCents: 500 }, now);
  const catalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(), videoAvailable: () => false, textAvailable: false, replicateAvailable: true, spendGuard: guard });
  for (const { profile, unavailableReason } of REPLICATE_MODEL_DEFINITIONS) {
    expect(catalog.get(profile.id)?.availability, profile.id).toBe(unavailableReason ? "unavailable" : "qualified");
    const ceiling = DEFAULT_WORKFLOW_SPEND_POLICY.ceilings.find(entry => entry.profileId === profile.id);
    expect(ceiling?.maximumCentsPerSlot, profile.id).toBeGreaterThan(0);
    expect(ceiling?.maximumCentsPerSlot, profile.id).toBeLessThanOrEqual(500);
  }
});

it("keeps vector (SVG) models unavailable while their output cannot be stored, though their ceilings qualify", () => {
  const guard = new StudioWorkflowSpendGuard(unusedDatabase, { dailyCapCents: 500 }, now);
  const catalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(), videoAvailable: () => false, textAvailable: false, replicateAvailable: true, spendGuard: guard });
  for (const id of ["recraft-v4.1-svg", "recraft-v4.1-pro-svg", "recraft-vectorize"]) {
    const profile = catalog.get(id)!;
    expect(profile.availability, id).toBe("unavailable");
    expect(profile.unavailableReason, id).toMatch(/SVG/);
    expect(guard.qualified({ ...profile, availability: "qualified" }), id).toBe(true);
  }
  expect(catalog.get("recraft-v4.1")?.availability).toBe("qualified");
  expect(catalog.get("recraft-remove-background")?.availability).toBe("qualified");
});

it("fails closed when a native model's offered settings change or exceed a smaller cap", () => {
  const guard = new StudioWorkflowSpendGuard(unusedDatabase, { dailyCapCents: 500 }, now);
  const catalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(), videoAvailable: () => false, textAvailable: false, replicateAvailable: true, spendGuard: guard });
  const gemini = catalog.get("gemini-omni-1.1-t2v")!;
  expect(guard.qualified({ ...gemini, parameters: { ...gemini.parameters, resolution: { policy: "fixed", value: "8k" } } })).toBe(false);
  const smallCap = new StudioWorkflowSpendGuard(unusedDatabase, { dailyCapCents: 100 }, now);
  expect(smallCap.qualified(gemini)).toBe(false);
  expect(smallCap.qualified(catalog.get("lyria-3")!)).toBe(true);
});

it("holds Gemini Omni once a verified clip runs over 11 s, and never a model without that bound", async () => {
  const set = vi.fn(async () => undefined);
  const database = { collection: () => ({ doc: () => ({ set }) }) } as unknown as Firestore;
  const guard = new StudioWorkflowSpendGuard(database, { dailyCapCents: 500 }, now);
  const catalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(), videoAvailable: () => false, textAvailable: false, replicateAvailable: true, spendGuard: guard });
  const gemini = catalog.get("gemini-omni-1.1-t2v")!; const wan = catalog.get("wan-3-t2v")!;
  await guard.checkOutput(produced(gemini), clip(11)); await guard.checkOutput(produced(wan), clip(20));
  expect(set).not.toHaveBeenCalled(); expect(guard.qualified(gemini)).toBe(true);
  await guard.checkOutput(produced(gemini), clip(11.5));
  expect(set).toHaveBeenCalledWith(expect.objectContaining({ profileId: gemini.id, maximumOutputSeconds: 11, observedSeconds: 11.5, requestId: "request_omni", slotId: "slot_omni" }));
  expect(guard.qualified(gemini)).toBe(false); expect(guard.qualified(wan)).toBe(true);
});

it("learns holds other servers stored at start and on each refresh, and starts even when they can't be read", async () => {
  vi.useFakeTimers();
  try {
    const stored = ["gemini-omni-1.1-i2v"];
    const guard = new StudioWorkflowSpendGuard({ collection: () => ({ get: async () => ({ docs: stored.map(id => ({ id })) }) }) } as unknown as Firestore, { dailyCapCents: 500 }, now);
    const catalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(), videoAvailable: () => false, textAvailable: false, replicateAvailable: true, spendGuard: guard });
    const text = catalog.get("gemini-omni-1.1-t2v")!; const image = catalog.get("gemini-omni-1.1-i2v")!;
    await guard.start(60_000);
    expect(guard.qualified(image)).toBe(false); expect(guard.qualified(text)).toBe(true);
    stored.push(text.id); await vi.advanceTimersByTimeAsync(60_000);
    expect(guard.qualified(text)).toBe(false);
    guard.stop();
    const unreadable = new StudioWorkflowSpendGuard({ collection: () => ({ get: async () => { throw new Error("Firestore unavailable"); } }) } as unknown as Firestore, { dailyCapCents: 500 }, now);
    await expect(unreadable.start(60_000)).resolves.toBeUndefined(); expect(unreadable.qualified(text)).toBe(true);
    unreadable.stop();
  } finally { vi.useRealTimers(); }
});
