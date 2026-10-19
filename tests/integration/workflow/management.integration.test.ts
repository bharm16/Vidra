import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { ProjectMediaService } from "@services/project-media/ProjectMediaService";
import { WorkflowManagementService } from "@services/workflow-sharing/WorkflowManagementService";
import { parseByteRange, type StoredFrame, type WorkflowContent, type WorkflowManagementStorage } from "@services/workflow-sharing/types";
import { createWorkflowManagementRoutes } from "@routes/workflow-management.routes";
import { createPublicWorkflowSharingRoutes } from "@routes/public-workflow-sharing.routes";
import { createProjectRoutes } from "@routes/projects.routes";
import type { RequestWithUser } from "@middleware/intake";
import { errorHandler } from "@middleware/errorHandler";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database); const conversations = new ConversationStore(database, projects); const media = new MediaVersionIndex(database, projects);
const drafts = new CreationDraftStore(database, projects, conversations);
const library = new ProjectMediaService(database, projects, media, { start: vi.fn(), exists: vi.fn(), cancelSession: vi.fn(), offset: vi.fn(), inspect: vi.fn(), copy: vi.fn() });
const buffer = Buffer.from("0123456789");
const storedFrame: StoredFrame = { object: { identity: "verified", assetId: "frame", storagePath: "users/creator/previews/images/frame.png", generation: "4", sha256: "d".repeat(64), bytes: 30 }, metadata: { state: "verified", width: 32, height: 24, durationSeconds: 0, audio: "absent", probeVersion: "controlled" } };
const objects: WorkflowManagementStorage = { content: vi.fn(async (_share, range): Promise<WorkflowContent> => { const selected = parseByteRange(range, buffer.length); return { stream: Readable.from([selected ? buffer.subarray(selected.start, selected.end + 1) : buffer]), contentType: "video/mp4", bytes: buffer.length, ...(selected ? { range: selected } : {}) }; }), downloadAccess: vi.fn(async () => ({ url: "https://owned.test/attachment", expiresAt: "2026-10-18T00:00:00.000Z" })), downloadSource: vi.fn(), existingFrame: vi.fn(async () => storedFrame), storeFrame: vi.fn(async () => storedFrame) };
const service = new WorkflowManagementService(database, projects, conversations, media, objects);
const app = express(); app.use(express.json()); app.use((req, _res, next) => { const owner = req.header("x-test-owner"); if (owner) (req as RequestWithUser).user = { uid: owner }; next(); }); app.use("/projects", createWorkflowManagementRoutes(service)); app.use("/projects", createProjectRoutes({ projects, conversations, drafts, media, library, mediaActions: service })); app.use("/public", createPublicWorkflowSharingRoutes(service, { publicBaseUrl: "https://vidra.test" })); app.use(errorHandler);
afterAll(async () => { await database.terminate(); });
beforeAll(async () => { await projects.create("creator", { id: "project_manage", name: "Campaign" }); await projects.create("other", { id: "project_other_manage", name: "Private" }); await conversations.create("creator", "project_manage", { id: "conversation_manage", name: "Ideas" }); });

async function version(id: string, input: Partial<MediaVersion> = {}): Promise<MediaVersion> {
  const saved = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id, ownerId: "creator", projectId: "project_manage", kind: "image", label: "Initial public label", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: id, storagePath: `users/creator/previews/images/${id}.png`, generation: "1", sha256: "a".repeat(64), bytes: buffer.length }, metadata: { state: "verified", width: 32, height: 24, durationSeconds: 2, audio: "absent", probeVersion: "controlled" }, association: "linked", createdAt: "2026-10-17T00:00:00.000Z", ...input });
  await database.collection("creation_projects").doc(saved.projectId).collection("media_versions").doc(saved.id).set(saved); return saved;
}

it("conversation rename/archive/restore uses CAS and retains all accepted history metadata", async () => {
  const first = await service.conversation("creator", "project_manage", "conversation_manage", { expectedRevision: 1, name: "Renamed", status: "archived" });
  expect(first).toMatchObject({ name: "Renamed", status: "archived", revision: 2, acceptanceSequence: 0 });
  await expect(service.conversation("creator", "project_manage", first.id, { expectedRevision: 1, status: "active" })).rejects.toMatchObject({ code: "revision_conflict" });
  const restored = await service.conversation("creator", "project_manage", first.id, { expectedRevision: 2, status: "active" }); expect(restored).toMatchObject({ status: "active", revision: 3, name: "Renamed" });
  await expect(service.conversation("other", "project_manage", first.id, { expectedRevision: 3, name: "Stolen" })).rejects.toMatchObject({ code: "access_denied" });
});

it("organization changes preserve immutable bytes/ancestry and preferred races leave one flag in the exact family", async () => {
  const parent = await version("version_parent"); const child = await version("version_child", { sourceInputs: [{ role: "primary", state: "resolved", versionId: parent.id }] }); const sibling = await version("version_sibling", { sourceInputs: [{ role: "primary", state: "resolved", versionId: parent.id }] });
  const reference = await version("version_reference", { sourceInputs: [{ role: "reference", state: "resolved", versionId: parent.id }] });
  const renamed = await service.changeMedia("creator", "project_manage", child.id, { label: "Final picture", favorite: true, hidden: true }); expect(renamed).toMatchObject({ label: "Final picture", favorite: true, hidden: true, object: child.object, origin: child.origin, sourceInputs: child.sourceInputs });
  await Promise.all([service.preferred("creator", "project_manage", child.id), service.preferred("creator", "project_manage", sibling.id)]);
  const versions = await media.list("creator", "project_manage"); expect(versions.filter(item => [parent.id, child.id, sibling.id].includes(item.id) && item.preferred)).toHaveLength(1); expect(versions.find(item => item.id === reference.id)?.preferred).toBeUndefined();
});

it("publication is idempotent, snapshots exact bytes/label and revocation denies each Range request", async () => {
  const source = await version("version_shared", { kind: "video", label: "Public clip" }); const id = randomUUID();
  const [first, repeated] = await Promise.all([service.publish("creator", "project_manage", { id, versionId: source.id }), service.publish("creator", "project_manage", { id, versionId: source.id })]); expect(repeated).toEqual(first);
  await service.changeMedia("creator", "project_manage", source.id, { label: "Private later name", hidden: true });
  const publicRead = await request(app).get(`/public/${id}`); expect(publicRead.status).toBe(200); expect(publicRead.body.data).toMatchObject({ id, label: "Public clip", url: `https://vidra.test/api/public/workflow-shares/${id}/content` }); expect(JSON.stringify(publicRead.body)).not.toMatch(/Private later name|ownerId|projectId|storagePath|sourceInputs/);
  const part = await request(app).get(`/public/${id}/content`).set("Range", "bytes=2-5"); expect(part.status).toBe(206); expect(part.headers["content-range"]).toBe("bytes 2-5/10"); expect(part.headers["cache-control"]).toContain("no-store"); expect(part.headers["x-content-type-options"]).toBe("nosniff"); expect(part.body).toEqual(Buffer.from("2345"));
  const bad = await request(app).get(`/public/${id}/content`).set("Range", "bytes=100-200"); expect(bad.status).toBe(416);
  await service.revoke("creator", "project_manage", id); const calls = vi.mocked(objects.content).mock.calls.length;
  expect((await request(app).get(`/public/${id}/content`).set("Range", "bytes=0-1")).status).toBe(404); expect(vi.mocked(objects.content).mock.calls.length).toBe(calls); expect((await request(app).get(`/public/${id}`)).status).toBe(404);
  expect((await service.publish("creator", "project_manage", { id, versionId: source.id })).revoked).toBe(true);
  await expect(service.publish("creator", "project_manage", { id, versionId: "version_parent" })).rejects.toMatchObject({ code: "submission_conflict" });
});

it("project trash immediately denies old publications and restore never reactivates them", async () => {
  const source = await version("version_trash_share", { projectId: ProjectIdSchema.parse("project_trash_share") });
  await projects.create("creator", { id: source.projectId, name: "Trash case" }); const id = randomUUID(); await service.publish("creator", source.projectId, { id, versionId: source.id });
  await projects.change("creator", source.projectId, { expectedRevision: 1, status: "trashed" }); await expect(service.publicVersion(id, "https://vidra.test")).rejects.toMatchObject({ code: "not_found" });
  await projects.change("creator", source.projectId, { expectedRevision: 2, status: "active" }); await expect(service.publicVersion(id, "https://vidra.test")).rejects.toMatchObject({ code: "not_found" });
  expect((await service.shares("creator", source.projectId))[0]?.revoked).toBe(true);
  expect((await service.publish("creator", source.projectId, { id, versionId: source.id })).revoked).toBe(true);
});

it("publication racing project trash cannot leave an accessible public grant", async () => {
  const project = await projects.create("creator", { id: "project_share_race", name: "Race" });
  const source = await version("version_share_race", { projectId: project.id }); const id = randomUUID();
  const outcomes = await Promise.allSettled([service.publish("creator", project.id, { id, versionId: source.id }), projects.change("creator", project.id, { expectedRevision: 1, status: "trashed" })]);
  expect(outcomes[1]?.status).toBe("fulfilled"); await expect(service.publicVersion(id, "https://vidra.test")).rejects.toMatchObject({ code: "not_found" });
  const before = vi.mocked(objects.content).mock.calls.length; expect((await request(app).get(`/public/${id}/content`).set("Range", "bytes=0-1")).status).toBe(404); expect(vi.mocked(objects.content).mock.calls.length).toBe(before);
});

it("a chosen publication identity cannot alias a legacy public link and bypass later revocation", async () => {
  const source = await version("version_legacy_collision"); const id = randomUUID();
  await database.collection("shares").doc(id).create({ description: "Private old prompt", storagePath: "old/media" });
  await expect(service.publish("creator", "project_manage", { id, versionId: source.id })).rejects.toMatchObject({ code: "submission_conflict" });
  expect((await database.collection("workflow_publications").doc(id).get()).exists).toBe(false);
});

it("frame identity records exact source/time and lost responses cannot overwrite another version", async () => {
  const source = await version("version_frame_source", { kind: "video" });
  const frame = await service.frame("creator", "project_manage", source.id, { id: "version_frame_result", timestampSeconds: 1.25 });
  expect(frame).toMatchObject({ kind: "image", origin: { kind: "frame", versionId: source.id, timestampSeconds: 1.25 }, sourceInputs: [{ role: "clip", versionId: source.id }] });
  expect(await service.frame("creator", "project_manage", source.id, { id: frame.id, timestampSeconds: 1.25 })).toEqual(frame);
  await expect(service.frame("creator", "project_manage", source.id, { id: frame.id, timestampSeconds: 0.5 })).rejects.toMatchObject({ code: "submission_conflict" });
  await expect(service.frame("creator", "project_manage", source.id, { id: "version_frame_end", timestampSeconds: 2 })).rejects.toMatchObject({ code: "input_unavailable" });
  await expect(service.frame("other", "project_manage", source.id, { id: "version_stolen_frame", timestampSeconds: 0 })).rejects.toMatchObject({ code: "access_denied" });
});

it("management HTTP boundaries deny anonymous/foreign ownership and reject immutable-field mutation", async () => {
  for (const [method, suffix, body] of [["patch", "/media/version_parent", { favorite: true }], ["post", "/media/version_parent/preferred", {}], ["post", "/shares", { id: randomUUID(), versionId: "version_parent" }], ["post", "/media/version_frame_source/frame", { id: "version_stolen", timestampSeconds: 0 }], ["patch", "/conversations/conversation_manage", { expectedRevision: 3, name: "Stolen" }]] as const) {
    expect((await request(app)[method](`/projects/project_manage${suffix}`).send(body)).status).toBe(401);
    const denied = await request(app)[method](`/projects/project_manage${suffix}`).set("x-test-owner", "other").send(body); expect(denied.status).toBe(403); expect(JSON.stringify(denied.body)).not.toMatch(/Initial public label|Private later name|users\/creator/);
  }
  expect((await request(app).patch("/projects/project_manage/media/version_parent").set("x-test-owner", "creator").send({ object: { storagePath: "foreign" } })).status).toBe(400);
  const original = await media.get("creator", "project_manage", "version_parent");
  const changed = await request(app).patch("/projects/project_manage/media/version_parent").set("x-test-owner", "creator").send({ label: "Canonical route label", favorite: true, hidden: false });
  expect(changed.status).toBe(200); expect(changed.body.data).toMatchObject({ label: "Canonical route label", favorite: true, hidden: false, object: original?.object, origin: original?.origin, sourceInputs: original?.sourceInputs });
});
