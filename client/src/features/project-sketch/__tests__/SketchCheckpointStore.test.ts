import { expect, it } from "vitest";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { hasUnsavedSketch, type SketchCheckpoint } from "../api/SketchCheckpointStore";

const picture = "data:image/png;base64,AAAA";
const inputs = { prompt: "Exact words", strength: 0.5, steps: 4, seed: 1 };
const pending = { captureId: "capture_one", displayedFrameId: "preview:1", displayedAt: "2026-10-19T00:00:00.000Z", outputDataUri: picture, drawingDataUri: picture, inputs };
const saved = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_sketch_one", ownerId: "creator", projectId: "project_one", kind: "image", label: "Sketch picture", origin: { kind: "sketch-capture", captureId: "capture_one" }, sourceInputs: [], object: { identity: "verified", assetId: "one", storagePath: "users/creator/one.png", generation: "1", sha256: "a".repeat(64), bytes: 10 }, metadata: { state: "verified", width: 8, height: 8, durationSeconds: 0, audio: "absent", probeVersion: "test" }, association: "linked", createdAt: "2026-10-19T00:00:00.000Z" });
const row = (key: string, extra: Partial<SketchCheckpoint> = {}): SketchCheckpoint => ({ key, inputs, ...extra });

it("reports a pressed save the server has not confirmed", () => {
  expect(hasUnsavedSketch("creator", [row("creator:project_one", { pending })])).toBe(true);
});

it("ignores confirmed saves, plain drawings and another account whose id begins with this one", () => {
  expect(hasUnsavedSketch("creator", [
    row("creator:project_one", { pending, saved }),
    row("creator:project_two", { drawingDataUri: picture }),
    row("creator:project_x:project_three", { pending }),
  ])).toBe(false);
});
