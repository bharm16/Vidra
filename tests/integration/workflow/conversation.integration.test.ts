import { afterAll, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database);
const conversations = new ConversationStore(database, projects);
afterAll(async () => { await database.terminate(); });

it("WP-03 creates distinct conversations only within an owned writable project", async () => {
  await projects.create("creator", { id: "project_conversations", name: "Campaign" });
  const command = { id: "conversation_first", name: "First ideas" };
  const [first, replay] = await Promise.all([
    conversations.create("creator", "project_conversations", command),
    conversations.create("creator", "project_conversations", command),
  ]);
  expect(replay).toEqual(first);
  expect(first.acceptanceSequence).toBe(0);
  await conversations.create("creator", "project_conversations", { id: "conversation_second", name: "First ideas" });
  expect(await conversations.list("creator", "project_conversations")).toHaveLength(2);
  await expect(conversations.get("other-owner", "project_conversations", "conversation_first")).rejects.toMatchObject({ code: "access_denied" });
  await projects.change("creator", "project_conversations", { expectedRevision: 1, status: "trashed" });
  await expect(conversations.create("creator", "project_conversations", { id: "conversation_third", name: "Third" })).rejects.toMatchObject({ code: "read_only" });
  expect((await conversations.get("creator", "project_conversations", "conversation_first")).name).toBe("First ideas");
});
