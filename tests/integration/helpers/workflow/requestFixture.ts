import type { Firestore } from "firebase-admin/firestore";
import { AcceptedRequestSchema, type AcceptedRequest } from "@shared/schemas/workflow/request.schemas";

/** Independent history fixtures written at the persistence boundary. */
export async function seedRequest(database: Firestore, input: { id: string; instructions: string; sequence: number; ancestors?: AcceptedRequest[]; ownerId?: string }): Promise<AcceptedRequest> {
  const ancestors = input.ancestors ?? [];
  const parent = ancestors.at(-1);
  const request = AcceptedRequestSchema.parse({
    schemaVersion: "vidra-workflow/v2", id: input.id, ownerId: input.ownerId ?? "creator",
    projectId: "project_history", conversationId: "conversation_history", submissionId: `submission_${input.sequence}`,
    executionDraftId: `draft_${input.sequence}`, executionDraftRevision: 1, acceptanceSequence: input.sequence,
    snapshotHash: "a".repeat(64), acceptedAt: "2026-10-10T20:00:00.000Z",
    snapshot: {
      action: "make-image", instructions: input.instructions, inputs: [],
      settings: { profileId: "flux-schnell", profileRevision: "1", parameters: {}, outputCount: 1 },
      context: { origin: parent ? "branch" : "empty", requestIds: ancestors.map(ancestor => ancestor.id), ...(parent ? { parentRequestId: parent.id } : {}), projectInstructionsRevision: 1 },
      destination: { projectId: "project_history", conversationId: "conversation_history" },
    },
    materializedContext: { projectInstructions: "", entries: ancestors.map(ancestor => ({ requestId: ancestor.id, instructions: ancestor.snapshot.instructions })) },
    slots: [{ id: `slot_${input.sequence}`, ordinal: 1, outcome: "queued", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 } }],
  });
  await database.collection("creation_requests").doc(request.id).create(request);
  return request;
}
