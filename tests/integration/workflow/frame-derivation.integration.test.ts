import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { runNative } from "@services/video-export/NativeProcess";
import { FrameOperationSchema, type WorkflowManagementStorage } from "@services/workflow-sharing/types";
import { deriveNativeFrame } from "@services/workflow-sharing/NativeFrameDeriver";

it("decodes a real requested frame from the pinned local source with immutable clip provenance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vidra-frame-test-"));
  try {
    const fixture = join(directory, "source.mp4");
    await runNative("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i", "color=c=red:s=32x24:r=2:d=1", "-f", "lavfi", "-i", "color=c=blue:s=32x24:r=2:d=1", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-an", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", fixture], { timeoutMs: 10000 });
    const data = await readFile(fixture);
    const source = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_source", ownerId: "creator", projectId: "project_frames", kind: "video", label: "Clip", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "source", storagePath: "users/creator/previews/videos/source.mp4", generation: "7", sha256: createHash("sha256").update(data).digest("hex"), bytes: data.length }, metadata: { state: "verified", width: 32, height: 24, durationSeconds: 2, audio: "absent", framesPerSecond: 2, probeVersion: "fixture" }, association: "linked", createdAt: "2026-10-17T00:00:00.000Z" });
    const operation = FrameOperationSchema.parse({ ownerId: "creator", projectId: source.projectId, sourceVersionId: source.id, id: "version_frame", timestampSeconds: 1.25, payloadHash: "a".repeat(64), token: "1341c9ed-ea51-4b5a-a30c-1b17e677782d", leaseUntil: "2026-10-17T01:00:00.000Z", createdAt: source.createdAt });
    const storage: WorkflowManagementStorage = { content: vi.fn(), downloadAccess: vi.fn(), existingFrame: vi.fn(), downloadSource: async (owner, selected, target) => { expect(owner).toBe("creator"); expect(selected.object).toEqual(source.object); await copyFile(fixture, target); }, storeFrame: async (captured, path, evidence) => { expect(captured.payloadHash).toBe(operation.payloadHash); const bytes = await readFile(path); expect(evidence.sha256).toBe(createHash("sha256").update(bytes).digest("hex")); const pixel = await sharp(bytes).extract({ left: 16, top: 12, width: 1, height: 1 }).raw().toBuffer(); expect(pixel[0]).toBeLessThan(20); expect(pixel[2]).toBeGreaterThan(200); return { object: { identity: "verified", assetId: captured.id, storagePath: "users/creator/previews/images/frame.png", generation: "8", sha256: evidence.sha256, bytes: evidence.bytes }, metadata: { state: "verified", width: evidence.width, height: evidence.height, durationSeconds: 0, audio: "absent", probeVersion: "real-png" } }; } };
    expect(await deriveNativeFrame(storage, operation, source)).toMatchObject({ object: { generation: "8" }, metadata: { width: 32, height: 24 } });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
