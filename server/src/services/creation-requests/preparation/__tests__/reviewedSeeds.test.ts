import { expect, it } from "vitest";
import { PreparedActionSchema } from "@shared/schemas/workflow/preparation.schemas";
import { WorkflowCapabilityCatalog } from "../WorkflowCapabilityCatalog";

it("rejects a reviewed slot plan that disagrees with its fixed seed policy", () => {
  const source = new WorkflowCapabilityCatalog().get("flux-schnell")!;
  const profile = { ...source, availability: "qualified", output: { kind: "image", maxCount: 2 }, parameters: { ...source.parameters, seed: { policy: "fixed", value: 7 } } };
  const ready = { state: "ready", draftId: "draft_reviewed", draftRevision: 1,
    snapshot: { action: "make-image", instructions: "Boat", inputs: [], settings: { profileId: source.id, profileRevision: source.revision, parameters: { seed: 7 }, outputCount: 2 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_reviewed", conversationId: "conversation_reviewed" } },
    materializedContext: { projectInstructions: "", entries: [] }, reviewedHash: "a".repeat(64), profile, slotPlan: [{ ordinal: 1, seed: 7 }, { ordinal: 2, seed: 7 }],
  };
  expect(PreparedActionSchema.parse(ready).state).toBe("ready");
  expect(() => PreparedActionSchema.parse({ ...ready, slotPlan: [{ ordinal: 1, seed: 7 }, { ordinal: 2, seed: 8 }] })).toThrow("The effective slot seed must match the reviewed seed policy and domain");
});
