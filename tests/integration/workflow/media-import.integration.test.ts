import express from "express";
import request from "supertest";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { CapabilityProfileSchema } from "@shared/schemas/workflow/capability.schemas";
import { CreationContextService } from "@services/creation-context/CreationContextService";
import { ActionPreparationService } from "@services/creation-requests/preparation/ActionPreparationService";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { ProjectMediaService } from "@services/project-media/ProjectMediaService";
import type { ProjectMediaStorage, VerifiedImport } from "@services/project-media/ProjectMediaStorage";
import { WorkflowError } from "@services/projects/WorkflowError";
import { ImportCommandSchema } from "@shared/schemas/workflow/import.schemas";
import { createProjectRoutes } from "@routes/projects.routes";
import { errorHandler } from "@middleware/errorHandler";
import type { RequestWithUser } from "@middleware/intake";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";
const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database);
const conversations = new ConversationStore(database, projects);
const drafts = new CreationDraftStore(database, projects, conversations);
const media = new MediaVersionIndex(database, projects);
const storage: ProjectMediaStorage = { cancelSession: vi.fn(async () => undefined), start: vi.fn(async () => "https://storage.googleapis.com/upload/resumable-test"), exists: vi.fn(async () => false), offset: vi.fn(async () => 32), inspect: vi.fn(async (_path, command): Promise<VerifiedImport> => ({ generation: "1", sha256: command.sha256, bytes: command.bytes, metadata: { state: "verified", width: 64, height: 36, durationSeconds: 0, audio: "absent", probeVersion: "controlled" } })), copy: vi.fn(async () => "2") };
const service = new ProjectMediaService(database, projects, media, storage);
const app = express(); app.use(express.json()); app.use((req: RequestWithUser, _res, next) => { const owner = req.header("x-test-owner"); if (owner) req.user = { uid: owner }; next(); }); app.use("/projects", createProjectRoutes({ projects, conversations, drafts, media, library: service })); app.use(errorHandler);
const command = (id: string): ReturnType<typeof ImportCommandSchema.parse> => ImportCommandSchema.parse({ id: `import_${id}`, filename: "Private picture.png", contentType: "image/png", bytes: 100, sha256: "a".repeat(64) });
beforeAll(async () => { await projects.create("creator", { id: "project_import", name: "Source" }); await projects.create("creator", { id: "project_target", name: "Target" }); await projects.create("other", { id: "project_other", name: "Other owner" }); });
afterAll(async () => { await database.terminate(); });
it("MEDIA-02 resumes one intent and converges lost completion responses", async () => {
  const first = await service.begin("creator", "project_import", command("once"));
  expect(first.offset).toBe(0);
  const resumed = await service.begin("creator", "project_import", command("once")); expect(resumed.offset).toBe(32); expect(resumed.record.versionId).toBe(first.record.versionId);
  const results = await Promise.all([service.finish("creator", "project_import", "import_once"), service.finish("creator", "project_import", "import_once")]); expect(results[0]).toEqual(results[1]); expect((await media.list("creator", "project_import")).filter(row => row.id === first.record.versionId)).toHaveLength(1);
});
it("MEDIA-03 refuses a same-name file with different bytes under the original identity", async () => { await service.begin("creator", "project_import", command("fingerprint")); await expect(service.begin("creator", "project_import", { ...command("fingerprint"), sha256: "b".repeat(64) })).rejects.toMatchObject({ code: "submission_conflict" }); });
it("recovers completed bytes even after their resumable session expires", async () => { await service.begin("creator", "project_import", command("completed")); vi.mocked(storage.exists).mockResolvedValueOnce(true); expect((await service.begin("creator", "project_import", command("completed"))).offset).toBe(100); });
it("rejected content never enters the usable index", async () => { await service.begin("creator", "project_import", command("bad")); vi.mocked(storage.inspect).mockRejectedValueOnce(new WorkflowError("invalid_settings", "This file isn't supported")); await expect(service.finish("creator", "project_import", "import_bad")).rejects.toMatchObject({ code: "invalid_settings" }); expect(await media.get("creator", "project_import", "version_bad")).toBeUndefined(); expect((await service.begin("creator", "project_import", command("bad"))).record.state).toBe("rejected"); });
it("hide and restore preserve the exact object, ancestry and access identity", async () => { const original = await service.finish("creator", "project_import", "import_once"); const hidden = await service.visibility("creator", "project_import", original.id, true); expect(hidden).toEqual({ ...original, hidden: true }); expect(await service.visibility("creator", "project_import", original.id, false)).toEqual({ ...original, hidden: false }); });
it("HISTORY-11 creates one independent owned copy without private instructions", async () => { const original = await service.finish("creator", "project_import", "import_once"); const input = { targetProjectId: "project_target", id: "version_copy" }; const copy = await service.copy("creator", "project_import", original.id, input); expect(await service.copy("creator", "project_import", original.id, input)).toEqual(copy); expect(copy).toMatchObject({ ownerId: "creator", projectId: "project_target", sourceInputs: [], origin: { kind: "copy", projectId: "project_import", versionId: original.id }, object: { identity: "verified", generation: "2" } }); expect(copy.object.storagePath).not.toBe(original.object.storagePath); expect(await media.get("creator", "project_import", original.id)).toEqual(original); expect(await conversations.list("creator", "project_target")).toEqual([]); });
it("MEDIA-04/05 upload lifecycle never changes draft roles, including late cancellation completion", async () => {
  await conversations.create("creator", "project_import", { id: "conversation_upload", name: "Upload work" });
  const content = { action: "make-video", instructions: "Keep my direction", inputs: [{ state: "importing", role: "start-frame", importId: "import_late" }], settings: { profileId: "unselected", profileRevision: "unresolved", parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_import", conversationId: "conversation_upload" } };
  const a = await drafts.create("creator", "project_import", "conversation_upload", { id: "draft_upload_a", content }); const b = await drafts.create("creator", "project_import", "conversation_upload", { id: "draft_upload_b", content });
  await service.begin("creator", "project_import", command("late")); await drafts.save("creator", "project_import", a.id, { expectedRevision: a.revision, content: { ...content, inputs: [] } }); await service.cancel("creator", "project_import", "import_late"); const late = await service.finish("creator", "project_import", "import_late"); expect(late.id).toBe("version_late"); expect((await drafts.get("creator", "project_import", a.id)).inputs).toEqual([]); expect((await drafts.get("creator", "project_import", b.id)).inputs).toEqual(b.inputs);
});
it("HTTP boundaries reject anonymous, malformed, cross-owner and foreign-destination mutations without leaking data", async () => {
  for (const route of ["/projects/project_import/imports", "/projects/project_import/media"]) expect((await request(app).get(route)).status).toBe(401);
  expect((await request(app).post("/projects/project_import/imports").set("x-test-owner", "creator").send({ ...command("invalid"), bytes: -1 })).status).toBe(400);
  for (const [method, route, body] of [["post", "/projects/project_import/imports", command("stolen")], ["post", "/projects/project_import/imports/import_once/finish", {}], ["post", "/projects/project_import/imports/import_once/cancel", {}], ["patch", "/projects/project_import/media/version_once", { hidden: true }], ["post", "/projects/project_import/media/version_once/copy", { id: "version_stolen", targetProjectId: "project_target" }]] as const) {
    const response = await request(app)[method](route).set("x-test-owner", "other").send(body); expect(response.status).toBe(403); expect(JSON.stringify(response.body)).not.toContain("Private picture"); expect(JSON.stringify(response.body)).not.toContain("resumable-test");
  }
  await expect(service.copy("creator", "project_import", "version_once", { id: "version_foreign", targetProjectId: "project_other" })).rejects.toMatchObject({ code: "access_denied" });
});
it("trashed projects reject new imports, hide and copy destinations", async () => { await projects.create("creator", { id: "project_trashed", name: "Trash" }); await projects.change("creator", "project_trashed", { expectedRevision: 1, status: "trashed" }); await expect(service.begin("creator", "project_trashed", command("trashed"))).rejects.toMatchObject({ code: "read_only" }); await expect(service.copy("creator", "project_import", "version_once", { id: "version_trashcopy", targetProjectId: "project_trashed" })).rejects.toMatchObject({ code: "read_only" }); });

it("cancelling before the start response records a tombstone that blocks a delayed begin", async () => { await service.cancel("creator", "project_import", "import_early_cancel", command("early_cancel")); expect((await service.begin("creator", "project_import", command("early_cancel"))).record.state).toBe("cancelled"); });

it("pending imports resolve only at preparation, while cancelled late files remain unavailable in both drafts", async () => {
 const profile = CapabilityProfileSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "import-profile", revision: "1", label: "Controlled", action: "make-video", provider: "controlled", endpoint: "controlled/video", mode: "image-to-video", availability: "qualified", inputs: [{ role: "start-frame", kinds: ["image"], minCount: 1, maxCount: 1 }], output: { kind: "video", maxCount: 1 }, maxContextCharacters: 32000, parameters: {}, recovery: { start: "supported", status: "supported", cancel: "supported", result: "supported", deadlineSeconds: 60 }, generatedAudio: "unsupported", pricing: { mode: "free", maximumCreditsPerSlot: 0 } });
 const preparation = new ActionPreparationService({ database, projects, conversations, drafts, contexts: new CreationContextService(database, projects), profiles: { get: () => profile }, media });
 await service.begin("creator", "project_import", command("prepared"));
 const content = { action: "make-video", instructions: "Use only the chosen picture", inputs: [{ state: "importing", role: "start-frame", importId: "import_prepared" }], settings: { profileId: profile.id, profileRevision: profile.revision, parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_import", conversationId: "conversation_upload" } };
 const draft = await drafts.create("creator", "project_import", "conversation_upload", { id: "draft_import_prepared", content });
 const pending = await preparation.prepare("creator", "project_import", draft.id); expect(pending).toMatchObject({ state: "blocked", reasons: expect.arrayContaining([expect.objectContaining({ code: "input_pending" })]) });
 await service.finish("creator", "project_import", "import_prepared");
 const ready = await preparation.prepare("creator", "project_import", draft.id); expect(ready).toMatchObject({ state: "ready", snapshot: { inputs: [{ state: "resolved", role: "start-frame", versionId: "version_prepared" }] } });
 expect((await drafts.get("creator", "project_import", draft.id)).inputs).toEqual(draft.inputs);
 await service.cancel("creator", "project_import", "import_prepared"); expect(await preparation.prepare("creator", "project_import", draft.id)).toMatchObject({ state: "blocked", reasons: expect.arrayContaining([expect.objectContaining({ code: "input_missing" })]) });
});

it("competing copy commands cannot bind one target identity to different source bytes", async () => {
 await service.begin("creator", "project_import", command("other_source")); const other = await service.finish("creator", "project_import", "import_other_source");
 const results = await Promise.allSettled([service.copy("creator", "project_import", "version_once", { id: "version_racing_copy", targetProjectId: "project_target" }), service.copy("creator", "project_import", other.id, { id: "version_racing_copy", targetProjectId: "project_target" })]);
 expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1); expect(results.filter(result => result.status === "rejected")).toMatchObject([{ reason: { code: "submission_conflict" } }]);
});
it("a copy cannot be mistaken for a completed import sharing its version id", async () => {
 await service.copy("creator", "project_import", "version_once", { id: "version_collision", targetProjectId: "project_target" }); await service.begin("creator", "project_target", command("collision"));
 await expect(service.finish("creator", "project_target", "import_collision")).rejects.toMatchObject({ code: "submission_conflict" });
});
it("retains uncertain cancellation for recovery and admits a late stored file without restoring its role", async () => {
 await service.begin("creator", "project_import", command("cancel_unknown")); vi.mocked(storage.cancelSession).mockRejectedValueOnce(new WorkflowError("capability_unavailable", "Cancellation was not confirmed"));
 await expect(service.cancel("creator", "project_import", "import_cancel_unknown")).rejects.toMatchObject({ code: "capability_unavailable" });
 expect((await service.list("creator", "project_import")).some(row => row.id === "import_cancel_unknown" && row.state === "cancelled")).toBe(true);
 vi.mocked(storage.exists).mockResolvedValueOnce(true); await service.cancel("creator", "project_import", "import_cancel_unknown"); expect(await media.get("creator", "project_import", "version_cancel_unknown")).toMatchObject({ origin: { kind: "upload" } });
 expect((await service.list("creator", "project_import")).some(row => row.id === "import_cancel_unknown")).toBe(false);
});

it("audio resumes into one immutable audio version, copies independently and never derives storage paths from filenames", async () => {
 const audio = { ...command("audio"), filename: "../../Private audio.mp3", contentType: "audio/mpeg" };
 const first = await service.begin("creator", "project_import", audio); expect(first.record.storagePath).toBe("users/creator/previews/audio/project_import-upload-version_audio.mp3"); expect(first.record.storagePath).not.toContain("Private audio");
 expect((await service.begin("creator", "project_import", audio)).offset).toBe(32);
 vi.mocked(storage.inspect).mockResolvedValueOnce({ generation: "audio_generation", sha256: audio.sha256, bytes: audio.bytes, metadata: { state: "verified", contentType: "audio/mpeg", audio: "present", durationSeconds: 2, probeVersion: "controlled-audio" } });
 const ready = await service.finish("creator", "project_import", "import_audio"); expect(ready).toMatchObject({ kind: "audio", metadata: { state: "verified", contentType: "audio/mpeg", audio: "present", durationSeconds: 2 } }); expect(ready.metadata).not.toHaveProperty("width");
 expect(await service.finish("creator", "project_import", "import_audio")).toEqual(ready);
 const copy = await service.copy("creator", "project_import", ready.id, { id: "version_audio_copy", targetProjectId: "project_target" });
 expect(copy.kind).toBe("audio"); expect(copy.object.storagePath).toBe("users/creator/previews/audio/project_target-copy-version_audio_copy.mp3"); expect(storage.copy).toHaveBeenLastCalledWith(ready.object.storagePath, copy.object.storagePath, "audio_generation");
 expect(copy.metadata).toEqual(ready.metadata); expect(await media.get("creator", "project_target", copy.id)).toEqual(copy);
 expect(await media.get("creator", "project_import", ready.id)).toEqual(ready);
});
it("audio HTTP boundaries reject oversized, anonymous and foreign-owner requests without storage grants or private filenames", async () => {
 const input = { ...command("audio_denied"), filename: "Private audio.wav", contentType: "audio/wav" };
 const starts = vi.mocked(storage.start).mock.calls.length;
 expect((await request(app).post("/projects/project_import/imports").send(input)).status).toBe(401);
 expect((await request(app).post("/projects/project_import/imports").set("x-test-owner", "creator").send({ ...input, bytes: 100 * 1024 * 1024 + 1 })).status).toBe(400);
 const denied = await request(app).post("/projects/project_import/imports").set("x-test-owner", "other").send(input); expect(denied.status).toBe(403); expect(JSON.stringify(denied.body)).not.toContain("Private audio"); expect(vi.mocked(storage.start).mock.calls.length).toBe(starts);
 const foreignFinish = await request(app).post("/projects/project_import/imports/import_audio/finish").set("x-test-owner", "other").send({}); expect(foreignFinish.status).toBe(403); expect(JSON.stringify(foreignFinish.body)).not.toContain("Private audio");
 await expect(service.copy("creator", "project_import", "version_audio", { id: "version_audio_stolen", targetProjectId: "project_other" })).rejects.toMatchObject({ code: "access_denied" });
});
it("audio cancellation retains its import identity and a late file cannot revive a cancelled association", async () => {
 const input = { ...command("audio_cancelled"), filename: "Track.m4a", contentType: "audio/mp4" };
 await service.cancel("creator", "project_import", input.id, input); expect((await service.begin("creator", "project_import", input)).record).toMatchObject({ state: "cancelled", storagePath: "users/creator/previews/audio/project_import-upload-version_audio_cancelled.m4a" });
 vi.mocked(storage.inspect).mockResolvedValueOnce({ generation: "late_audio", sha256: input.sha256, bytes: input.bytes, metadata: { state: "verified", audio: "present", durationSeconds: 2, probeVersion: "controlled-audio" } });
 const late = await service.finish("creator", "project_import", input.id); expect(late.kind).toBe("audio"); expect((await service.begin("creator", "project_import", input)).record.state).toBe("cancelled");
});
