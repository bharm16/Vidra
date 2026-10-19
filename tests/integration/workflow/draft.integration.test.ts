import { afterAll, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { DraftContentSchema, type CreationDraft, type DraftContent } from "@shared/schemas/workflow/draft.schemas";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database);
const conversations = new ConversationStore(database, projects);
const drafts = new CreationDraftStore(database, projects, conversations);
afterAll(async () => { await database.terminate(); });

async function createDraftFixture(suffix: string): Promise<{ draft: CreationDraft; content: DraftContent }> {
  const projectId = `project_${suffix}`;
  const conversationId = `conversation_${suffix}`;
  await projects.create("creator", { id: projectId, name: "Campaign" });
  await conversations.create("creator", projectId, { id: conversationId, name: "Ideas" });
  const content = DraftContentSchema.parse({
    action: "make-video", instructions: "Original words", inputs: [],
    settings: { profileId: "wan-t2v", profileRevision: "1", parameters: {}, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId, conversationId },
  });
  const draft = await drafts.create("creator", projectId, conversationId, { id: `draft_${suffix}`, content });
  return { draft, content };
}

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

it("refuses a second project binding for the same creator's global execution-draft identity", async () => {
  for (const suffix of ["one", "two"]) {
    await projects.create("creator", { id: `project_${suffix}`, name: suffix });
    await conversations.create("creator", `project_${suffix}`, { id: `conversation_${suffix}`, name: suffix });
  }
  const content = {
    action: "make-video", instructions: "A runner", inputs: [],
    settings: { profileId: "wan-t2v", profileRevision: "1", parameters: {}, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId: "project_one", conversationId: "conversation_one" },
  };
  await drafts.create("creator", "project_one", "conversation_one", { id: "draft_global", content });
  await expect(drafts.create("creator", "project_two", "conversation_two", { id: "draft_global", content: { ...content, destination: { projectId: "project_two", conversationId: "conversation_two" } } })).rejects.toMatchObject({ code: "submission_conflict" });
  expect(await drafts.list("creator", "project_two", "conversation_two")).toEqual([]);
});

it("rejects draft records whose stored identity disagrees with their address", async () => {
  const { draft, content } = await createDraftFixture("bound");
  await database.collection("creation_projects").doc(draft.projectId).collection("drafts").doc(draft.id).set({ ...draft, id: "draft_alias" });
  await expect(drafts.get("creator", draft.projectId, draft.id)).rejects.toMatchObject({ code: "access_denied" });
  await expect(drafts.list("creator", draft.projectId, draft.conversationId)).rejects.toMatchObject({ code: "access_denied" });
  await expect(drafts.save("creator", draft.projectId, draft.id, { expectedRevision: 1, content })).rejects.toMatchObject({ code: "access_denied" });
  await expect(drafts.create("creator", draft.projectId, draft.conversationId, { id: draft.id, content })).rejects.toMatchObject({ code: "access_denied" });
});

it.each(["revision", "conversation"])("refuses to restore saved draft history with a mismatched %s binding", async binding => {
  const { draft } = await createDraftFixture(`history_${binding}`);
  const corrupted = binding === "revision"
    ? { ...draft, revision: 2 }
    : { ...draft, conversationId: "conversation_elsewhere", destination: { ...draft.destination, conversationId: "conversation_elsewhere" } };
  await database.collection("creation_projects").doc(draft.projectId).collection("drafts").doc(draft.id).collection("revisions").doc("1").set(corrupted);
  await expect(drafts.restore("creator", draft.projectId, draft.id, { expectedRevision: 1, sourceRevision: 1 })).rejects.toMatchObject({ code: "access_denied" });
  await expect(drafts.revisions("creator", draft.projectId, draft.id)).rejects.toMatchObject({ code: "access_denied" });
  expect((await drafts.get("creator", draft.projectId, draft.id)).revision).toBe(1);
});

it.each(["owner", "draft", "identity", "destination"])("rejects retained draft conflicts with a mismatched %s binding", async binding => {
  const { draft, content } = await createDraftFixture(`conflict_${binding}`);
  await drafts.save("creator", draft.projectId, draft.id, { expectedRevision: 1, content: { ...content, instructions: "Winning words" } });
  const command = { expectedRevision: 1, content: { ...content, instructions: "Retained words" } };
  const result = await drafts.save("creator", draft.projectId, draft.id, command);
  if (result.state !== "conflict") throw new Error("Expected one retained draft conflict");
  const corrupted = binding === "owner" ? { ...result.retained, ownerId: "another-creator" }
    : binding === "draft" ? { ...result.retained, draftId: "draft_elsewhere" }
    : binding === "identity" ? { ...result.retained, id: `conflict_${"a".repeat(64)}` }
    : { ...result.retained, content: { ...result.retained.content, destination: { projectId: "project_elsewhere", conversationId: "conversation_elsewhere" } } };
  await database.collection("creation_projects").doc(draft.projectId).collection("drafts").doc(draft.id).collection("conflicts").doc(result.retained.id).set(corrupted);
  await expect(drafts.conflicts("creator", draft.projectId, draft.id)).rejects.toMatchObject({ code: "access_denied" });
  await expect(drafts.save("creator", draft.projectId, draft.id, command)).rejects.toMatchObject({ code: "access_denied" });
  expect((await drafts.get("creator", draft.projectId, draft.id)).instructions).toBe("Winning words");
});

it("atomically binds a competing global draft identity to exactly one project", async () => {
  const bindings = [
    { projectId: "project_identity_race_one", conversationId: "conversation_identity_race_one" },
    { projectId: "project_identity_race_two", conversationId: "conversation_identity_race_two" },
  ];
  for (const binding of bindings) {
    await projects.create("creator", { id: binding.projectId, name: "Campaign" });
    await conversations.create("creator", binding.projectId, { id: binding.conversationId, name: "Ideas" });
  }
  const results = await Promise.allSettled(bindings.map(binding => drafts.create("creator", binding.projectId, binding.conversationId, { id: "draft_identity_race", content: {
    action: "make-video", instructions: "Two windows", inputs: [],
    settings: { profileId: "wan-t2v", profileRevision: "1", parameters: {}, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: binding,
  } })));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toMatchObject([{ reason: { code: "submission_conflict" } }]);
  const retained = await Promise.all(bindings.map(binding => drafts.list("creator", binding.projectId, binding.conversationId)));
  expect(retained.map(rows => rows.length).sort()).toEqual([0, 1]);
  expect(retained.flat().map(draft => draft.id)).toEqual(["draft_identity_race"]);
});

it("preserves draft words while project trash blocks authoring and explicit restoration reopens it", async () => {
  const { draft, content } = await createDraftFixture("restore_project");
  const trashed = await projects.change("creator", draft.projectId, { expectedRevision: 1, status: "trashed" });
  await expect(drafts.save("creator", draft.projectId, draft.id, { expectedRevision: 1, content: { ...content, instructions: "Unsaved words" } })).rejects.toMatchObject({ code: "read_only" });
  expect((await drafts.get("creator", draft.projectId, draft.id)).instructions).toBe("Original words");
  await expect(projects.change("creator", draft.projectId, { expectedRevision: trashed.revision, name: "A silent restore" })).rejects.toMatchObject({ code: "read_only" });
  const restored = await projects.change("creator", draft.projectId, { expectedRevision: trashed.revision, status: "active" });
  expect(restored.sharingEpoch).toBe(1);
  expect(await drafts.save("creator", draft.projectId, draft.id, { expectedRevision: 1, content: { ...content, instructions: "Explicitly saved words" } })).toMatchObject({ state: "saved", draft: { revision: 2, instructions: "Explicitly saved words" } });
});

it("rejects a draft retargeted away from its existing global conversation binding", async () => {
  const { draft, content } = await createDraftFixture("registry_binding");
  const other = await conversations.create("creator", draft.projectId, { id: "conversation_registry_other", name: "Other ideas" });
  const destination = { projectId: draft.projectId, conversationId: other.id };
  await database.collection("creation_projects").doc(draft.projectId).collection("drafts").doc(draft.id).set({ ...draft, conversationId: other.id, destination });
  await expect(drafts.get("creator", draft.projectId, draft.id)).rejects.toMatchObject({ code: "access_denied" });
  await expect(drafts.list("creator", draft.projectId, other.id)).rejects.toMatchObject({ code: "access_denied" });
  await expect(drafts.save("creator", draft.projectId, draft.id, { expectedRevision: 1, content: { ...content, destination } })).rejects.toMatchObject({ code: "access_denied" });
});
