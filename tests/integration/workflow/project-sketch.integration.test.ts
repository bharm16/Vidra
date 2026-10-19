import sharp from "sharp";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";
import { ProjectStore } from "@services/projects/ProjectStore";
import { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { ProjectSketchService } from "@services/project-sketch/ProjectSketchService";
import type { ProjectSketchStorage } from "@services/project-sketch/ProjectSketchStorage";
import { ProjectSketchCaptureRecordSchema, type ProjectSketchCaptureCommand } from "@shared/schemas/workflow/sketch.schemas";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database); const media = new MediaVersionIndex(database, projects);
const storage: ProjectSketchStorage = { put: vi.fn(async (path, picture) => ({ identity: "verified" as const, assetId: path.split("/").at(-1) ?? "picture", storagePath: path, generation: "1", sha256: picture.sha256, bytes: picture.bytes.length })) };
const service = new ProjectSketchService(database, projects, storage);
let picture: string;
const command = (id: string): ProjectSketchCaptureCommand => ({ captureId: `capture_${id}`, displayedFrameId: "preview-session:17", displayedAt: "2026-10-17T01:02:03.000Z", outputDataUri: picture, drawingDataUri: picture, inputs: { prompt: "Exact original words", strength: .875, steps: 8, seed: 42 } });
beforeAll(async () => { picture = `data:image/png;base64,${(await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toBuffer()).toString("base64")}`; await projects.create("owner", { id: "project_sketch", name: "Sketch" }); });
afterAll(async () => { await database.terminate(); });

it("M07 concurrent presses and lost responses publish one immutable owned version with its exact provenance", async () => {
  const captured = command("same");
  const results = await Promise.all([service.accept("owner", "project_sketch", captured), service.accept("owner", "project_sketch", captured)]);
  expect(results[0]).toEqual(results[1]); expect(await service.accept("owner", "project_sketch", captured)).toEqual(results[0]);
  expect((await media.list("owner", "project_sketch")).filter(row => row.id === results[0]?.id)).toHaveLength(1);
  const record = ProjectSketchCaptureRecordSchema.parse((await database.collection("creation_projects").doc("project_sketch").collection("sketch_captures").doc(captured.captureId).get()).data());
  expect(record).toMatchObject({ state: "saved", inputs: captured.inputs, displayedAt: captured.displayedAt, displayedFrameId: captured.displayedFrameId, drawingObject: { identity: "verified" } });
  expect(results[0]).toMatchObject({ origin: { kind: "sketch-capture", captureId: captured.captureId }, sourceInputs: [], association: "linked" });
});
it("same capture identity cannot be rebound to a later frame or altered settings", async () => {
  for (const changed of [{ displayedFrameId: "later-frame" }, { inputs: { ...command("same").inputs, seed: 99 } }, { displayedAt: "2026-10-17T02:00:00.000Z" }]) await expect(service.accept("owner", "project_sketch", { ...command("same"), ...changed })).rejects.toMatchObject({ code: "submission_conflict" });
});
it("unauthorized owners never reach storage or decode another owner's capture", async () => {
  const calls = vi.mocked(storage.put).mock.calls.length;
  await expect(service.accept("stranger", "project_sketch", command("private"))).rejects.toMatchObject({ code: "access_denied" });
  expect(vi.mocked(storage.put).mock.calls.length).toBe(calls);
});
it("invalid content never creates a media version or a capture record", async () => {
  await expect(service.accept("owner", "project_sketch", { ...command("invalid"), outputDataUri: "data:image/png;base64,YQ==" })).rejects.toMatchObject({ code: "invalid_settings" });
  expect(await media.get("owner", "project_sketch", "version_sketch_invalid")).toBeUndefined();
});
it("accepted output survives a storage transport failure and project trash between reservation and publication", async () => {
  await projects.create("owner", { id: "project_sketch_race", name: "Race" });
  const put = storage.put;
  vi.mocked(storage.put).mockImplementationOnce(async (path, output, hash) => { await projects.change("owner", "project_sketch_race", { expectedRevision: 1, status: "trashed" }); throw new Error(`controlled connection loss ${hash.slice(0, 4)} ${output.bytes.length} ${path.length}`); });
  await expect(service.accept("owner", "project_sketch_race", command("race"))).rejects.toThrow("controlled connection loss");
  const version = await service.accept("owner", "project_sketch_race", command("race"));
  expect(version).toMatchObject({ association: "recovery", origin: { kind: "sketch-capture", captureId: "capture_race" } });
  await expect(service.accept("owner", "project_sketch_race", command("new_in_trash"))).rejects.toMatchObject({ code: "read_only" });
  expect(storage.put).toBe(put);
});
