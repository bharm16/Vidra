import { expect, it } from "vitest";
import { ConversationListingSchema, ConversationSchema, ProjectSchema } from "../project.schemas";

it("WP-01 records exact legacy origin IDs without inferring identity from titles", () => {
  const project = {
    schemaVersion: "vidra-workflow/v2", id: "project_legacy", ownerId: "creator", revision: 1,
    name: "Evening campaign", status: "active", instructions: { revision: 1, text: "" },
    origin: { kind: "legacy-session", recordId: "original-session-id", authority: "legacy" },
    createdAt: "2026-10-10T20:00:00.000Z", updatedAt: "2026-10-10T20:00:00.000Z",
  };
  expect(ProjectSchema.parse(project).origin).toEqual({ kind: "legacy-session", recordId: "original-session-id", authority: "legacy" });
  expect(ProjectSchema.safeParse({ ...project, id: "original-session-id" }).success).toBe(false);
});

it("reads conversation listings with or without media counts and rejects invented counts", () => {
  const conversation = {
    schemaVersion: "vidra-workflow/v2", id: "conversation_first", projectId: "project_counts", ownerId: "creator", revision: 1,
    name: "First ideas", status: "active", acceptanceSequence: 0, initialContext: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    createdAt: "2026-10-18T20:00:00.000Z", updatedAt: "2026-10-18T20:00:00.000Z",
  };
  expect(ConversationListingSchema.parse(conversation).media).toBeUndefined();
  expect(ConversationListingSchema.parse({ ...conversation, media: { pictures: 3, clips: 4 } }).media).toEqual({ pictures: 3, clips: 4 });
  expect(ConversationListingSchema.safeParse({ ...conversation, media: { pictures: -1, clips: 0 } }).success).toBe(false);
  expect(ConversationListingSchema.safeParse({ ...conversation, media: { pictures: 1, clips: 0, audio: 2 } }).success).toBe(false);
  expect(ConversationSchema.safeParse({ ...conversation, media: { pictures: 1, clips: 0 } }).success).toBe(false);
});
