import { afterAll, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { RequestHistoryStore } from "@services/media-history/RequestHistoryStore";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";
import { seedRequest } from "../helpers/workflow/requestFixture";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database);
const history = new RequestHistoryStore(database, projects);
afterAll(async () => { await database.terminate(); });

it("reads ordered owned request history and rejects another owner or project", async () => {
  await projects.create("creator", { id: "project_history", name: "History" });
  await projects.create("creator", { id: "project_other", name: "Other" });
  await seedRequest(database, { id: "request_second", instructions: "Second", sequence: 2 });
  await seedRequest(database, { id: "request_first", instructions: "First", sequence: 1 });
  expect((await history.list("creator", "project_history", "conversation_history")).map(request => request.snapshot.instructions)).toEqual(["First", "Second"]);
  expect((await history.get("creator", "project_history", "request_first")).snapshot.instructions).toBe("First");
  await expect(history.get("other", "project_history", "request_first")).rejects.toMatchObject({ code: "access_denied" });
  await expect(history.list("other", "project_history", "conversation_history")).rejects.toMatchObject({ code: "access_denied" });
  await expect(history.get("creator", "project_other", "request_first")).rejects.toMatchObject({ code: "access_denied" });
});

it("rejects accepted history whose stored request identity disagrees with its address", async () => {
  await projects.create("creator", { id: "project_history", name: "History" });
  const accepted = await seedRequest(database, { id: "request_bound", instructions: "Bound words", sequence: 10 });
  await database.collection("creation_requests").doc(accepted.id).set({ ...accepted, id: "request_alias" });
  await expect(history.get("creator", "project_history", "request_bound")).rejects.toMatchObject({ code: "access_denied" });
  await expect(history.list("creator", "project_history", "conversation_history")).rejects.toMatchObject({ code: "access_denied" });
});

it("counts each conversation's visible pictures and clips without counting another owner's media", async () => {
  await projects.create("creator", { id: "project_history", name: "History" });
  const first = await seedRequest(database, { id: "request_counted", instructions: "Counted", sequence: 20 });
  await database.collection("creation_requests").doc("request_elsewhere").create({ ...first, id: "request_elsewhere", conversationId: "conversation_elsewhere", snapshot: { ...first.snapshot, destination: { projectId: "project_history", conversationId: "conversation_elsewhere" } } });
  const version = (id: string, kind: "image" | "video", origin: object, extra: object = {}) => MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id, ownerId: "creator", projectId: "project_history", kind, label: id, origin, sourceInputs: [], object: { identity: "verified", assetId: id, storagePath: `users/creator/${id}`, generation: "1", sha256: "a".repeat(64), bytes: 10 }, metadata: { state: "verified", width: 64, height: 36, durationSeconds: kind === "video" ? 4 : 0, audio: "absent", probeVersion: "controlled" }, association: "linked", createdAt: "2026-10-18T20:00:00.000Z", ...extra });
  const rows = [
    version("version_picture_one", "image", { kind: "generated", requestId: "request_counted", slotId: "slot_20" }),
    version("version_picture_two", "image", { kind: "sketch", requestId: "request_counted", captureId: "capture_one" }),
    version("version_clip_one", "video", { kind: "generated", requestId: "request_counted", slotId: "slot_20" }),
    version("version_clip_hidden", "video", { kind: "generated", requestId: "request_counted", slotId: "slot_20" }, { hidden: true }),
    version("version_clip_elsewhere", "video", { kind: "generated", requestId: "request_elsewhere", slotId: "slot_20" }),
    version("version_upload", "image", { kind: "upload" }),
  ];
  for (const row of rows) await database.collection("creation_projects").doc("project_history").collection("media_versions").doc(row.id).set(row);
  // A foreign row in this project and an unknown request are never counted.
  await database.collection("creation_projects").doc("project_history").collection("media_versions").doc("version_foreign").set({ ...rows[2], id: "version_foreign", ownerId: "other" });
  await database.collection("creation_projects").doc("project_history").collection("media_versions").doc("version_orphan").set({ ...rows[2], id: "version_orphan", origin: { kind: "generated", requestId: "request_missing", slotId: "slot_20" } });
  const counts = await history.conversationMediaCounts("creator", "project_history");
  expect(Object.fromEntries(counts)).toEqual({ conversation_history: { pictures: 2, clips: 1 }, conversation_elsewhere: { pictures: 0, clips: 1 } });
  await expect(history.conversationMediaCounts("other", "project_history")).rejects.toMatchObject({ code: "access_denied" });
});
