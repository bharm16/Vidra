import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { Bucket } from "@google-cloud/storage";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
import { WorkflowCapabilityCatalog } from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";
import { ExecutionAttemptSchema } from "@services/creation-requests/execution/types";
import { GcsWorkflowOutputStorage } from "../GcsWorkflowOutputStorage";

const profile = new WorkflowCapabilityCatalog().get("flux-schnell")!;
const attempt = ExecutionAttemptSchema.parse({ requestId: "request_storage", slotId: "slot_storage", ownerId: "creator", projectId: "project_storage", token: "fenced-attempt", snapshotHash: "a".repeat(64), state: "produced", startedAt: "2026-10-17T00:00:00.000Z", deadlineAt: "2026-10-17T01:00:00.000Z", profile, sentInstructions: "Boat" });

it("creates one deterministic owned file and verifies actual bytes/geometry again after a lost response", async () => {
  const bytes = await sharp({ create: { width: 19, height: 13, channels: 3, background: "red" } }).webp().toBuffer();
  const sourcePath = "image-previews/creator/native-picture";
  const targetPath = "users/creator/previews/images/workflow-slot_storage.webp";
  const records = new Map<string, { data: Buffer; metadata: { generation: string; size: number; contentType: string; metadata?: Record<string, string> } }>([[sourcePath, { data: bytes, metadata: { generation: "1", size: bytes.length, contentType: "image/webp" } }]]);
  const copy = vi.fn(async (target: { name: string }, options: { preconditionOpts: { ifGenerationMatch: number }; metadata: Record<string, string> }) => { expect(options.preconditionOpts.ifGenerationMatch).toBe(0); records.set(target.name, { data: bytes, metadata: { generation: "2", size: bytes.length, contentType: "image/webp", metadata: options.metadata } }); });
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
