import { afterAll, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database);
const conversations = new ConversationStore(database, projects);
const drafts = new CreationDraftStore(database, projects, conversations);
afterAll(async () => { await database.terminate(); });

it("WP-04 retains both competing draft changes and restores by appending a revision", async () => {
  await projects.create("creator", { id: "project_drafts", name: "Campaign" });
  await conversations.create("creator", "project_drafts", { id: "conversation_drafts", name: "Ideas" });
  const content = {
    action: "make-video", instructions: "Original words", inputs: [],
    settings: { profileId: "wan-t2v", profileRevision: "1", parameters: {}, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId: "project_drafts", conversationId: "conversation_drafts" },
  };
  await drafts.create("creator", "project_drafts", "conversation_drafts", { id: "draft_first", content });
  const results = await Promise.all([
    drafts.save("creator", "project_drafts", "draft_first", { expectedRevision: 1, content: { ...content, instructions: "First tab words" } }),
    drafts.save("creator", "project_drafts", "draft_first", { expectedRevision: 1, content: { ...content, instructions: "Second tab words" } }),
  ]);
  const conflict = results.find(result => result.state === "conflict");
  const saved = results.find(result => result.state === "saved");
  expect(conflict?.state).toBe("conflict");
  expect(saved?.state).toBe("saved");
  if (!conflict || conflict.state !== "conflict" || !saved || saved.state !== "saved") throw new Error("Expected one winner and one retained conflict");
  expect(conflict.retained.content.instructions).not.toBe(saved.draft.instructions);
  expect((await drafts.conflicts("creator", "project_drafts", "draft_first"))[0]?.content.instructions).toBe(conflict.retained.content.instructions);
  const restored = await drafts.restore("creator", "project_drafts", "draft_first", { expectedRevision: 2, sourceRevision: 1 });
  expect(restored.revision).toBe(3);
  expect(restored.instructions).toBe("Original words");
  expect((await drafts.revisions("creator", "project_drafts", "draft_first")).map(draft => draft.revision)).toEqual([1, 2, 3]);
  await expect(drafts.save("other-owner", "project_drafts", "draft_first", { expectedRevision: 3, content })).rejects.toMatchObject({ code: "access_denied" });
});
