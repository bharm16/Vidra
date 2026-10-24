import { afterAll, describe, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { libraryProjectId } from "@services/projects/libraryProject";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase();
const store = new ProjectStore(database);
afterAll(async () => { await database.terminate(); });

describe("WP-03 owner-scoped project command boundary", () => {
  it("HISTORY-01 converges repeated creation and keeps equally named projects distinct", async () => {
    const command = { id: "project_first", name: "Evening campaign" };
    const results = await Promise.all([store.create("creator", command), store.create("creator", command)]);
    expect(results[0]?.id).toBe("project_first");
    expect(results[1]).toEqual(results[0]);
    const second = await store.create("creator", { id: "project_second", name: "Evening campaign" });
    expect(second.id).toBe("project_second");
    expect((await store.list("creator")).map(project => project.id).sort()).toEqual(["project_first", "project_second"]);
    await expect(store.get("other-owner", "project_first")).rejects.toMatchObject({ code: "access_denied" });
    expect(await store.list("other-owner")).toEqual([]);
  });

  it("preserves the winner of competing project changes and rejects an unauthorized change", async () => {
    await store.create("creator", { id: "project_race", name: "Original" });
    const changes = await Promise.allSettled([
      store.change("creator", "project_race", { expectedRevision: 1, name: "First change" }),
      store.change("creator", "project_race", { expectedRevision: 1, name: "Second change" }),
    ]);
    expect(changes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(changes.filter(result => result.status === "rejected")).toMatchObject([{ reason: { code: "revision_conflict" } }]);
    await expect(store.change("other-owner", "project_race", { expectedRevision: 2, name: "Stolen" })).rejects.toMatchObject({ code: "access_denied" });
    const current = await store.get("creator", "project_race");
    expect(current.revision).toBe(2);
    expect(current.name).not.toBe("Stolen");
  });

  it("rejects project records whose stored identity disagrees with their address", async () => {
    const project = await store.create("creator", { id: "project_bound", name: "Bound project" });
    await database.collection("creation_projects").doc(project.id).set({ ...project, id: "project_alias" });
    await expect(store.get("creator", "project_bound")).rejects.toMatchObject({ code: "access_denied" });
    await expect(store.create("creator", { id: "project_bound", name: "Bound project" })).rejects.toMatchObject({ code: "access_denied" });
    await expect(store.change("creator", "project_bound", { expectedRevision: 1, name: "A new name" })).rejects.toMatchObject({ code: "access_denied" });
    await expect(store.list("creator")).rejects.toMatchObject({ code: "access_denied" });
  });
});

describe("owner library", () => {
  it("converges concurrent first use on one library that stays out of the project list", async () => {
    const [first, second] = await Promise.all([store.ensureLibrary("library-owner"), store.ensureLibrary("library-owner")]);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ id: libraryProjectId("library-owner"), ownerId: "library-owner", role: "library", status: "active", origin: { kind: "new" } });
    expect(await store.ensureLibrary("library-owner")).toEqual(first);
    await store.create("library-owner", { id: "project_named", name: "Named" });
    expect((await store.list("library-owner")).map(project => project.id)).toEqual(["project_named"]);
  });

  it("derives a valid id from owner ids that contain separators", async () => {
    const library = await store.ensureLibrary("api-key:replay-cross-mode-key");
    expect(library.id).toBe(libraryProjectId("api-key:replay-cross-mode-key"));
    expect(library.id).not.toBe(libraryProjectId("library-owner"));
  });

  it("cannot be renamed, trashed or read by another owner", async () => {
    const library = await store.ensureLibrary("library-guarded");
    await expect(store.change("library-guarded", library.id, { expectedRevision: 1, name: "Renamed" })).rejects.toMatchObject({ code: "read_only" });
    await expect(store.change("library-guarded", library.id, { expectedRevision: 1, status: "trashed" })).rejects.toMatchObject({ code: "read_only" });
    await expect(store.get("library-intruder", library.id)).rejects.toMatchObject({ code: "access_denied" });
    await expect(store.change("library-intruder", library.id, { expectedRevision: 1, status: "trashed" })).rejects.toMatchObject({ code: "access_denied" });
    expect((await store.get("library-guarded", library.id)).status).toBe("active");
  });

  it("refuses an ordinary project stored at a library address", async () => {
    const id = libraryProjectId("library-squatted");
    await database.collection("creation_projects").doc(id).set({
      schemaVersion: "vidra-workflow/v2", id, ownerId: "library-squatted", revision: 1, name: "Not a library", status: "active",
      sharingEpoch: 0, instructions: { revision: 1, text: "" }, origin: { kind: "new" }, createdAt: "2026-10-19T00:00:00.000Z", updatedAt: "2026-10-19T00:00:00.000Z",
    });
    await expect(store.ensureLibrary("library-squatted")).rejects.toMatchObject({ code: "access_denied" });
  });

  it("holds conversations and drafts like any project", async () => {
    const conversations = new ConversationStore(database, store);
    const drafts = new CreationDraftStore(database, store, conversations);
    const library = await store.ensureLibrary("library-writer");
    const conversation = await conversations.create("library-writer", library.id, { id: "conversation_library", name: "New conversation" });
    expect(conversation.projectId).toBe(library.id);
    const draft = await drafts.create("library-writer", library.id, conversation.id, {
      id: "draft_library", content: { action: "make-video", instructions: "A lighthouse at dusk", inputs: [], settings: { profileId: "wan-t2v", profileRevision: "1", parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: library.id, conversationId: conversation.id } },
    });
    expect(draft).toMatchObject({ id: "draft_library", projectId: library.id });
    await expect(conversations.create("library-intruder", library.id, { id: "conversation_stolen", name: "Stolen" })).rejects.toMatchObject({ code: "access_denied" });
  });
});

it("keeps every owned project reachable after the first 200 records", async () => {
  const tied = new ProjectStore(database, () => "2026-10-24T00:00:00.000Z");
  await Promise.all(Array.from({ length: 205 }, (_, index) => tied.create("large-library-owner", { id: `project_page_${String(index).padStart(3, "0")}`, name: `Project ${index}` })));
  const records = await store.list("large-library-owner");
  expect(records).toHaveLength(205);
  expect(records.some(row => row.id === "project_page_204")).toBe(true);
});

it("binds a continuation to its owner and lists tied timestamps without omissions", async () => {
  const first = await store.page("large-library-owner", { limit: 100 });
  expect(first.items).toHaveLength(100); expect(first.nextCursor).toBeTruthy();
  const next = await store.page("large-library-owner", { cursor: first.nextCursor, limit: 100 });
  expect(next.items).toHaveLength(100);
  expect(new Set([...first.items, ...next.items].map(row => row.id)).size).toBe(200);
  await expect(store.page("other-owner", { cursor: first.nextCursor })).rejects.toMatchObject({ code: "invalid_settings" });
});
