import type { Bucket } from "@google-cloud/storage";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { z } from "zod";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { ExportStorage } from "@services/video-export/ExportStorage";
import { WorkflowError } from "@services/projects/WorkflowError";
import { isOwnedPicturePath } from "@services/owned-media";
import { StoredFrameSchema, parseByteRange, type FrameOperation, type StoredFrame, type StoredShare, type WorkflowContent, type WorkflowManagementStorage } from "./types";
import { mediaDownloadName } from "@shared/workflow/mediaFilename";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"]);
function errorCode(error: unknown): unknown { return typeof error === "object" && error !== null && "code" in error ? error.code : undefined; }

export class GcsWorkflowManagementStorage implements WorkflowManagementStorage {
  constructor(private readonly bucket: Bucket, private readonly sources: Pick<ExportStorage, "download">) {}

  async content(share: StoredShare, range?: string): Promise<WorkflowContent> {
    if (share.object.identity !== "verified" || !isOwnedPicturePath(share.ownerId, share.object.storagePath)) throw new WorkflowError("not_found", "This shared media is unavailable.");
    const file = this.bucket.file(share.object.storagePath, { generation: share.object.generation });
    let metadata;
    try { [metadata] = await file.getMetadata(); } catch { throw new WorkflowError("not_found", "This shared media is unavailable."); }
    const contentType = z.string().parse(metadata.contentType);
    if (!ALLOWED.has(contentType) || Number(metadata.size) !== share.object.bytes) throw new WorkflowError("not_found", "This shared media is unavailable.");
    const selected = parseByteRange(range, share.object.bytes);
    const stream: Readable = file.createReadStream({ ...(selected ? { start: selected.start, end: selected.end, validation: false } : { validation: "crc32c" }) });
    return { stream, contentType, bytes: share.object.bytes, ...(selected ? { range: selected } : {}) };
  }

  async downloadAccess(ownerId: string, version: MediaVersion): Promise<{ url: string; expiresAt: string }> {
    if (version.ownerId !== ownerId || !isOwnedPicturePath(ownerId, version.object.storagePath)) throw new WorkflowError("access_denied", "This file is unavailable.");
    const generation = version.object.identity === "verified" ? version.object.generation : undefined;
    const file = this.bucket.file(version.object.storagePath, generation ? { generation } : {});
    try { await file.getMetadata(); } catch { throw new WorkflowError("not_found", "This stored file is unavailable."); }
    const expiry = Date.now() + 15 * 60_000;
    const [url] = await file.getSignedUrl({ version: "v4", action: "read", expires: expiry, responseDisposition: `attachment; filename="vidra-media"; filename*=UTF-8''${encodeURIComponent(mediaDownloadName(version))}`, ...(generation ? { queryParams: { generation } } : {}) });
    return { url, expiresAt: new Date(expiry).toISOString() };
  }

  async downloadSource(ownerId: string, source: MediaVersion, target: string, signal: AbortSignal): Promise<void> { return this.sources.download(ownerId, source, target, signal); }

  private framePath(operation: FrameOperation): string { return `users/${operation.ownerId}/previews/images/frame-${operation.id}.png`; }

  async existingFrame(operation: FrameOperation): Promise<StoredFrame | undefined> {
    const path = this.framePath(operation);
    let row;
    try { [row] = await this.bucket.file(path).getMetadata(); } catch (error) { if (errorCode(error) === 404) return undefined; throw error; }
    if (row.metadata?.framePayloadHash !== operation.payloadHash || row.contentType !== "image/png") throw new WorkflowError("submission_conflict", "This frame identity belongs to another source or time.");
    return StoredFrameSchema.parse({ object: { identity: "verified", assetId: operation.id, storagePath: path, generation: row.generation, sha256: row.metadata.sha256, bytes: z.number().int().positive().max(10 * 1024 * 1024).parse(Number(row.size)) }, metadata: { state: "verified", width: Number(row.metadata.width), height: Number(row.metadata.height), durationSeconds: 0, audio: "absent", probeVersion: "vidra-frame/png-v1" } });
  }

  async storeFrame(operation: FrameOperation, path: string, evidence: { sha256: string; bytes: number; width: number; height: number }, signal?: AbortSignal): Promise<StoredFrame> {
    z.number().int().positive().max(10 * 1024 * 1024).parse(evidence.bytes);
    try {
      await pipeline(createReadStream(path), this.bucket.file(this.framePath(operation)).createWriteStream({ resumable: false, validation: "crc32c", preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: "image/png", metadata: { framePayloadHash: operation.payloadHash, sha256: evidence.sha256, width: String(evidence.width), height: String(evidence.height) } } }), { signal: AbortSignal.any([AbortSignal.timeout(60000), ...(signal ? [signal] : [])]) });
    } catch (error) { if (errorCode(error) !== 412) throw error; }
    const stored = await this.existingFrame(operation);
    if (!stored || stored.object.identity !== "verified" || stored.object.sha256 !== evidence.sha256 || stored.object.bytes !== evidence.bytes) throw new WorkflowError("submission_conflict", "This stored frame does not match the decoded pixels.");
    return stored;
  }
}
