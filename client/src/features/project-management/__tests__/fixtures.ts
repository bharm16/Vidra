import { ProjectSchema, ConversationSchema } from "@shared/schemas/workflow/project.schemas";
const at = "2026-10-17T00:00:00.000Z";
export const project = ProjectSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "project_one", ownerId: "creator", revision: 1, name: "Evening campaign", status: "active", instructions: { revision: 1, text: "Keep evening light." }, origin: { kind: "new" }, createdAt: at, updatedAt: at });
export const conversation = ConversationSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "conversation_one", projectId: project.id, ownerId: "creator", revision: 1, name: "First ideas", status: "active", acceptanceSequence: 0, initialContext: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, createdAt: at, updatedAt: at });
