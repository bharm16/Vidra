import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { Bucket } from "@google-cloud/storage";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
import { WorkflowCapabilityCatalog } from "@services/creation-requests/catalog";
import { ExecutionAttemptSchema } from "@services/creation-requests/execution";
import { GcsWorkflowOutputStorage } from "../GcsWorkflowOutputStorage";

const profile = new WorkflowCapabilityCatalog().get("flux-schnell")!;
const attempt = ExecutionAttemptSchema.parse({ requestId: "request_storage", slotId: "slot_storage", ownerId: "creator", projectId: "project_storage", token: "fenced-attempt", snapshotHash: "a".repeat(64), state: "produced", startedAt: "2026-10-17T00:00:00.000Z", deadlineAt: "2026-10-17T01:00:00.000Z", profile, sentInstructions: "Boat" });

it("creates one deterministic owned file and verifies actual bytes/geometry again after a lost response", async () => {
  const bytes = await sharp({ create: { width: 19, height: 13, channels: 3, background: "red" } }).webp().toBuffer();
  const sourcePath = "image-previews/creator/native-picture";
  const targetPath = "users/creator/previews/images/workflow-slot_storage.webp";
  const records = new Map<string, { data: Buffer; metadata: { generation: string; size: number; contentType?: string; metadata?: Record<string, string> } }>([[sourcePath, { data: bytes, metadata: { generation: "1", size: bytes.length, contentType: "image/webp" } }]]);
  // A GCS copy that supplies metadata replaces the destination resource, keeping only the content type it is given.
  const copy = vi.fn(async (target: { name: string }, options: { preconditionOpts: { ifGenerationMatch: number }; contentType?: string; metadata: Record<string, string> }) => { expect(options.preconditionOpts.ifGenerationMatch).toBe(0); records.set(target.name, { data: bytes, metadata: { generation: "2", size: bytes.length, ...(options.contentType ? { contentType: options.contentType } : {}), metadata: options.metadata } }); });
  const bucket = { file: (name: string) => ({ name, copy, getMetadata: async () => { const stored = records.get(name); if (!stored) throw Object.assign(new Error("Absent"), { code: 404 }); return [stored.metadata]; }, createReadStream: () => Readable.from([records.get(name)!.data]) }) } as unknown as Bucket;
  const storage = new GcsWorkflowOutputStorage(bucket, null);
  const output = { kind: "image" as const, storagePath: sourcePath, model: "flux", provider: "replicate" };
  const first = await storage.materialize(attempt, output);
  expect(first.object).toMatchObject({ identity: "verified", storagePath: targetPath, generation: "2", sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
  expect(first.metadata).toMatchObject({ state: "verified", width: 19, height: 13, audio: "absent" });
  expect(await storage.materialize(attempt, output)).toEqual(first); expect(copy).toHaveBeenCalledTimes(1);
  records.get(targetPath)!.metadata.metadata!.workflowRequestId = "request_other";
  await expect(storage.materialize(attempt, output)).rejects.toMatchObject({ code: "submission_conflict" }); expect(copy).toHaveBeenCalledTimes(1);
});

it("rejects a foreign owner's generated source before reading or copying it", async () => {
  const copy = vi.fn(); const sourceRead = vi.fn();
  const bucket = { file: (name: string) => ({ getMetadata: async () => { if (name.startsWith("users/creator/")) throw Object.assign(new Error("Absent"), { code: 404 }); sourceRead(); return [{ generation: "1", size: 8 }]; }, copy }) } as unknown as Bucket;
  const storage = new GcsWorkflowOutputStorage(bucket, null);
  await expect(storage.materialize(attempt, { kind: "image", storagePath: "image-previews/another-owner/private", model: "flux", provider: "replicate" })).rejects.toMatchObject({ code: "access_denied" }); expect(copy).not.toHaveBeenCalled(); expect(sourceRead).not.toHaveBeenCalled();
});

it("rejects produced audio outside the owner's own audio folder before reading or copying it", async () => {
  const copy = vi.fn(); const sourceRead = vi.fn();
  const bucket = { file: (name: string) => ({ getMetadata: async () => { if (name.startsWith("users/creator/previews/audio/workflow-")) throw Object.assign(new Error("Absent"), { code: 404 }); sourceRead(); return [{ generation: "1", size: 8 }]; }, copy }) } as unknown as Bucket;
  const storage = new GcsWorkflowOutputStorage(bucket, null);
  for (const storagePath of ["users/another-owner/previews/audio/native-slot", "users/creator/previews/images/native-slot"]) {
    await expect(storage.materialize(attempt, { kind: "audio", storagePath, model: "elevenlabs/v3", provider: "replicate" })).rejects.toMatchObject({ code: "access_denied" });
  }
  expect(copy).not.toHaveBeenCalled(); expect(sourceRead).not.toHaveBeenCalled();
});

it("reuses the exact remote result after a successful upload loses its response", async () => {
  const { controlledNetwork } = await import("@services/owned-media/__tests__/controlledNetwork");
  const bytes = await sharp({ create: { width: 19, height: 13, channels: 3, background: "red" } }).png().toBuffer();
  let saved: { generation: string; size: number; contentType: string; metadata: Record<string, string> } | undefined;
  const save = vi.fn(async (_bytes: Buffer, options: { metadata: { contentType: string; metadata: Record<string, string> } }) => { saved = { generation: "2", size: bytes.length, ...options.metadata }; throw new Error("Upload response was lost"); });
  const bucket = { file: () => ({ getMetadata: async () => { if (!saved) throw Object.assign(new Error("Absent"), { code: 404 }); return [saved]; }, save, createReadStream: () => Readable.from([bytes]) }) } as unknown as Bucket;
  const network = controlledNetwork(() => ({ headers: { "content-type": "application/octet-stream" }, body: Readable.from([bytes]) }));
  const storage = new GcsWorkflowOutputStorage(bucket, null, network);
  const output = { kind: "provider-media" as const, mediaKind: "image" as const, sourceUrl: "https://replicate.delivery/produced.png", model: "native", provider: "replicate" };
  await expect(storage.materialize(attempt, output)).rejects.toThrow("Upload response was lost");
  expect((await storage.materialize(attempt, output)).metadata).toMatchObject({ state: "verified", width: 19, height: 13 });
  expect(save).toHaveBeenCalledTimes(1); expect(network.request).toHaveBeenCalledTimes(1);
});
