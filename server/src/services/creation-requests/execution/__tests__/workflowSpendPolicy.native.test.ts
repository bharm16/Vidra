import type { Firestore } from "firebase-admin/firestore";
import { expect, it } from "vitest";
import { WorkflowCapabilityCatalog } from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";
import { REPLICATE_MODEL_DEFINITIONS } from "@services/creation-requests/replicate-models";
import { StudioWorkflowSpendGuard } from "../StudioWorkflowSpendGuard";
import { DEFAULT_WORKFLOW_SPEND_POLICY } from "../workflowSpendPolicy";

const now = (): number => Date.parse("2026-10-20T00:00:00.000Z");
const unusedDatabase = {} as unknown as Firestore;

it("qualifies every native Replicate model within the existing daily free-testing cap", () => {
  const guard = new StudioWorkflowSpendGuard(unusedDatabase, { dailyCapCents: 500 }, now);
  const catalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(), videoAvailable: () => false, textAvailable: false, replicateAvailable: true, spendGuard: guard });
  for (const { profile } of REPLICATE_MODEL_DEFINITIONS) {
    expect(catalog.get(profile.id)?.availability, profile.id).toBe("qualified");
    const ceiling = DEFAULT_WORKFLOW_SPEND_POLICY.ceilings.find(entry => entry.profileId === profile.id);
    expect(ceiling?.maximumCentsPerSlot, profile.id).toBeGreaterThan(0);
    expect(ceiling?.maximumCentsPerSlot, profile.id).toBeLessThanOrEqual(500);
  }
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
