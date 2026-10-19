import type { Bucket } from "@google-cloud/storage";
import { Readable } from "node:stream";
import { expect, it, vi } from "vitest";
import { StoredShareSchema, parseByteRange } from "../types";
import { GcsWorkflowManagementStorage } from "../GcsWorkflowManagementStorage";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";

const share = StoredShareSchema.parse({ id: "1341c9ed-ea51-4b5a-a30c-1b17e677782d", ownerId: "creator", projectId: "project_share", versionId: "version_share", sharingEpoch: 0, revoked: false, kind: "video", label: "Clip", createdAt: "2026-10-17T00:00:00.000Z", object: { identity: "verified", assetId: "clip", storagePath: "users/creator/previews/videos/clip.mp4", generation: "4", sha256: "a".repeat(64), bytes: 10 } });

it("streams the exact pinned generation and requested byte interval without a signed grant", async () => {
  const read = vi.fn(() => Readable.from([Buffer.from("123")]));
  const file = vi.fn(() => ({ getMetadata: async () => [{ contentType: "video/mp4", size: "10", generation: "4" }], createReadStream: read }));
  const storage = new GcsWorkflowManagementStorage({ file } as unknown as Bucket, { download: vi.fn() });
  const content = await storage.content(share, "bytes=1-3");
  expect(file).toHaveBeenCalledWith(share.object.storagePath, { generation: "4" }); expect(read).toHaveBeenCalledWith({ start: 1, end: 3, validation: false }); expect(content).toMatchObject({ bytes: 10, range: { start: 1, end: 3 }, contentType: "video/mp4" });
  const chunks: Buffer[] = []; for await (const chunk of content.stream) chunks.push(Buffer.from(chunk)); expect(Buffer.concat(chunks).toString()).toBe("123");
});

it("refuses executable media and foreign private download grants", async () => {
  const stream = vi.fn(); const signed = vi.fn();
  const storage = new GcsWorkflowManagementStorage({ file: () => ({ getMetadata: async () => [{ contentType: "image/svg+xml", size: "10" }], createReadStream: stream, getSignedUrl: signed }) } as unknown as Bucket, { download: vi.fn() });
  await expect(storage.content(share)).rejects.toMatchObject({ code: "not_found" }); expect(stream).not.toHaveBeenCalled();
  const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: share.versionId, ownerId: share.ownerId, projectId: share.projectId, kind: share.kind, label: share.label, object: share.object, origin: { kind: "upload" }, sourceInputs: [], metadata: { state: "pending" }, association: "linked", createdAt: share.createdAt });
  await expect(storage.downloadAccess("other", version)).rejects.toMatchObject({ code: "access_denied" }); expect(signed).not.toHaveBeenCalled();
});

it("accepts one suffix/open range and rejects multi, empty, overflow and unsatisfiable ranges", () => {
  expect(parseByteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 }); expect(parseByteRange("bytes=7-", 10)).toEqual({ start: 7, end: 9 }); expect(parseByteRange("bytes=7-100", 10)).toEqual({ start: 7, end: 9 });
  for (const range of ["bytes=-0", "bytes=-", "bytes=3-2", "bytes=10-", "bytes=0-2,4-6", "bytes=99999999999999999999-", "not-a-range"]) expect(() => parseByteRange(range, 10)).toThrow("This byte range is unavailable.");
});
