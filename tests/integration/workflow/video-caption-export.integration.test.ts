import "../../../server/src/config/native-fonts";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { z } from "zod";
import { VideoCaptionValidationDetailsSchema, VideoCompositionSchema, VideoTextSchema, type VideoExport } from "@shared/schemas/workflow/video-edit.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { ProjectStore } from "@services/projects/ProjectStore";
import { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { VideoEditStore } from "@services/video-editing/VideoEditStore";
import { VideoExportService } from "@services/video-export/VideoExportService";
import { NativeVideoRenderer } from "@services/video-export/NativeVideoRenderer";
import { hashLocalFile, type ExportObject, type ExportStorage } from "@services/video-export/ExportStorage";
import { createVideoEditRoutes } from "@routes/video-edits.routes";
import { errorHandler } from "@middleware/errorHandler";
import type { RequestWithUser } from "@middleware/intake";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database), media = new MediaVersionIndex(database, projects), edits = new VideoEditStore(database, projects, media);
const root = await mkdtemp(join(tmpdir(), "vidra-caption-export-proof-"));
const picture = join(root, "source.png"), outputPaths = new Map<string, string>(), objects = new Map<string, ExportObject>();
const storage: ExportStorage = {
  download: async (_owner, source, target) => { if (source.id !== "version_caption_source") throw new Error("Unexpected source identity."); await copyFile(picture, target); },
  store: async (storagePath, path, evidence) => { const target = join(root, `output-${objects.size}.mp4`); await copyFile(path, target); outputPaths.set(storagePath, target); const object = { storagePath, generation: "1", ...evidence }; objects.set(storagePath, object); return object; },
  inspect: async path => objects.get(path), remove: async () => undefined,
  access: async () => { throw new Error("No public or download grant is needed for this admission proof."); },
};
const renderer = new NativeVideoRenderer(storage);
const service = new VideoExportService(database, projects, edits, media, storage, renderer);
const auxiliaryServices: VideoExportService[] = [];
function appFor(exports: VideoExportService) {
  const app = express(); app.use(express.json());
  app.use((req: RequestWithUser, _res, next) => { const owner = req.header("x-owner"); if (owner) req.user = { uid: owner }; next(); });
  app.use("/projects", createVideoEditRoutes({ edits, exports, projects })); app.use(errorHandler); return app;
}
const app = appFor(service);
const caption = VideoTextSchema.parse({ id: "caption_glyph", text: "Make room for evening.", anchor: { kind: "item", itemId: "still" }, startFrame: 0, endFrame: 30, x: .05, y: .8, width: .9, height: .12, fontSize: 43.636, fontWeight: 500, fontFamily: "Inter", letterSpacingEm: 0, lineHeightEm: 1.3, color: "#f7f7f7", align: "center" });
const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "still", versionId: "version_caption_source", kind: "picture", inFrame: 0, outFrame: 0, displayFrames: 30, fit: "fit", sourceAudio: { muted: true, gain: 1 } }], text: [caption] });
const envelope = (suffix: string, revision = 1) => ({ submissionId: `submission_${suffix}`, executionDraftId: `draft_${suffix}`, executionDraftRevision: 1, revision, preset: "landscape" });
async function ready(id: string): Promise<VideoExport> {
  let result: VideoExport | undefined;
  await expect.poll(async () => { result = await service.get("creator", "project_caption", id); return result.state; }, { timeout: 20_000, interval: 50 }).toBe("ready");
  if (!result) throw new Error("The native export did not return its stored evidence."); return result;
}
beforeAll(async () => {
  await projects.create("creator", { id: "project_caption", name: "Private captions" });
  await sharp({ create: { width: 64, height: 36, channels: 3, background: "#304050" } }).png().toFile(picture);
  const source = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_caption_source", ownerId: "creator", projectId: "project_caption", kind: "image", label: "Exact source picture", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "caption_source", storagePath: "users/creator/caption_source.png", generation: "1", ...await hashLocalFile(picture) }, metadata: { state: "verified", width: 64, height: 36, durationSeconds: 0, audio: "absent", probeVersion: "native-proof" }, association: "linked", createdAt: "2026-10-18T00:00:00.000Z" });
  await database.collection("creation_projects").doc("project_caption").collection("media_versions").doc(source.id).set(source);
});
afterAll(async () => { await service.drain(10_000); for (const auxiliary of auxiliaryServices) await auxiliary.drain(10_000); await rm(root, { recursive: true, force: true }); await database.terminate(); });

it("returns owner-bound cue validation at 422 without changing saved revisions, accepted exports or execution receipts", async () => {
  const edit = await edits.create("creator", "project_caption", { id: "edit_caption_policy", name: "Private caption edit", composition });
  const accepted = await service.create("creator", "project_caption", edit.id, envelope("caption_previous"));
  const previous = await ready(accepted.id), storedPath = outputPaths.get(previous.stored?.storagePath ?? "");
  if (!storedPath) throw new Error("The earlier accepted native export was not stored.");
  const originalBytes = await readFile(storedPath);
  const unsupported = await edits.save("creator", "project_caption", edit.id, { operationId: "unsupported_caption", expectedRevision: 1, command: { kind: "text", text: { ...caption, text: "Make room for evening. 🌇🦊🌇" } } });
  const invalid = await edits.save("creator", "project_caption", edit.id, { operationId: "overflow_caption", expectedRevision: unsupported.revision, command: { kind: "text", text: { ...caption, id: "caption_overflow", text: "Too many words ".repeat(8), width: .03, height: .015 } } });
  const revisions = await edits.revisions("creator", "project_caption", edit.id), exports = await service.list("creator", "project_caption");
  const rejectedEnvelope = envelope("caption_rejected", invalid.revision);
  const response = await request(app).post(`/projects/project_caption/video-edits/${edit.id}/exports`).set("x-owner", "creator").send(rejectedEnvelope);
  expect(response.status).toBe(422);
  const failure = z.object({ success: z.literal(false), code: z.literal("invalid_settings"), error: z.string(), details: z.string() }).parse(response.body);
  expect(VideoCaptionValidationDetailsSchema.parse(JSON.parse(failure.details))).toEqual({ kind: "video-caption-validation", ownerId: "creator", projectId: "project_caption", editId: edit.id, revision: invalid.revision, issues: [
    { elementId: "caption_glyph", code: "text_render_policy", message: expect.stringContaining("does not support"), unsupportedCodePoints: [0x1f307, 0x1f98a] },
    { elementId: "caption_overflow", code: "text_render_policy", message: expect.stringContaining("overflow") },
  ] });
  expect(await edits.get("creator", "project_caption", edit.id)).toEqual(invalid);
  expect(await edits.revisions("creator", "project_caption", edit.id)).toEqual(revisions);
  expect(await service.list("creator", "project_caption")).toEqual(exports);
  expect(await service.get("creator", "project_caption", previous.id)).toEqual(previous);
  expect(await service.create("creator", "project_caption", edit.id, envelope("caption_previous"))).toEqual(previous);
  expect((await readFile(storedPath)).equals(originalBytes)).toBe(true);
  // A definitive rejection consumed neither action identity. The same envelope
  // can accept the explicitly repaired saved revision, with its new payload.
  const supported = await edits.save("creator", "project_caption", edit.id, { operationId: "repair_glyph", expectedRevision: invalid.revision, command: { kind: "text", text: caption } });
  const repaired = await edits.save("creator", "project_caption", edit.id, { operationId: "remove_overflow", expectedRevision: supported.revision, command: { kind: "remove_text", textId: "caption_overflow" } });
  const current = await service.create("creator", "project_caption", edit.id, { ...rejectedEnvelope, revision: repaired.revision });
  expect((await ready(current.id)).revision).toBe(repaired.revision);
  expect((await edits.revision("creator", "project_caption", edit.id, invalid.revision)).composition).toEqual(invalid.composition);
  expect(await service.get("creator", "project_caption", previous.id)).toEqual(previous);
  expect((await readFile(storedPath)).equals(originalBytes)).toBe(true);
}, 60_000);

it("denies another owner before native caption or executable inspection and omits private cue details", async () => {
  const edit = await edits.create("creator", "project_caption", { id: "edit_caption_private", name: "Private caption", composition: { ...composition, text: [{ ...caption, text: "Private words 🌇" }] } });
  const unavailable = new NativeVideoRenderer(storage, join(root, "missing-ffmpeg"));
  const deniedService = new VideoExportService(database, projects, edits, media, storage, unavailable); auxiliaryServices.push(deniedService);
  const response = await request(appFor(deniedService)).post(`/projects/project_caption/video-edits/${edit.id}/exports`).set("x-owner", "intruder").send(envelope("caption_intruder"));
  expect(response.status).toBe(403);
  expect(response.body).toMatchObject({ success: false, code: "access_denied" });
  expect(response.body).not.toHaveProperty("details");
  expect(JSON.stringify(response.body)).not.toContain("Private words");
  expect(JSON.stringify(response.body)).not.toContain("caption_glyph");
});

it("keeps a genuinely missing native executable at 503 without accepting or consuming the export action", async () => {
  const edit = await edits.create("creator", "project_caption", { id: "edit_caption_backend", name: "Native backend", composition });
  const unavailable = new NativeVideoRenderer(storage, join(root, "missing-ffmpeg"));
  const missingService = new VideoExportService(database, projects, edits, media, storage, unavailable); auxiliaryServices.push(missingService);
  const before = await service.list("creator", "project_caption"), action = envelope("caption_backend");
  const response = await request(appFor(missingService)).post(`/projects/project_caption/video-edits/${edit.id}/exports`).set("x-owner", "creator").send(action);
  expect(response.status).toBe(503);
  expect(response.body).toMatchObject({ success: false, code: "capability_unavailable" });
  expect(response.body).not.toHaveProperty("details");
  expect(await service.list("creator", "project_caption")).toEqual(before);
  expect(await edits.get("creator", "project_caption", edit.id)).toEqual(edit);
  const accepted = await service.create("creator", "project_caption", edit.id, action);
  expect((await ready(accepted.id)).revision).toBe(1);
}, 30_000);

it.runIf(process.platform === "darwin")("keeps an unqualified Pango font backend at 503 without caption-policy details", async () => {
  const edit = await edits.create("creator", "project_caption", { id: "edit_caption_font_backend", name: "Native font backend", composition });
  const before = await service.list("creator", "project_caption");
  try {
    vi.stubEnv("PANGOCAIRO_BACKEND", "coretext");
    const response = await request(app).post(`/projects/project_caption/video-edits/${edit.id}/exports`).set("x-owner", "creator").send(envelope("caption_font_backend"));
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ success: false, code: "capability_unavailable", error: expect.stringContaining("native font backend is not qualified") });
    expect(response.body).not.toHaveProperty("details");
    expect(await service.list("creator", "project_caption")).toEqual(before);
    expect(await edits.get("creator", "project_caption", edit.id)).toEqual(edit);
  } finally { vi.unstubAllEnvs(); }
});
