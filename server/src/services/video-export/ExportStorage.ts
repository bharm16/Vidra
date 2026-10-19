import type { Bucket } from "@google-cloud/storage";
import { createReadStream, createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { WorkflowError } from "@services/projects/WorkflowError";
import { SourceUnavailableError } from "./SourceUnavailableError";

export interface ExportObject { storagePath: string; generation: string; sha256: string; bytes: number; }
export interface ExportStorage {
  download(ownerId: string, source: MediaVersion, target: string, signal: AbortSignal): Promise<void>;
  remove(storagePath: string, generation: string): Promise<void>;
  inspect(storagePath: string): Promise<ExportObject | undefined>;
  store(storagePath: string, localPath: string, evidence: { sha256: string; bytes: number }): Promise<ExportObject>;
  access(ownerId: string, storagePath: string, generation?: string): Promise<{ url: string; expiresAt: string }>;
}
export async function hashLocalFile(path: string): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash("sha256"); let bytes = 0;
  for await (const chunk of createReadStream(path)) { hash.update(chunk); bytes += Buffer.byteLength(chunk); }
  return { sha256: hash.digest("hex"), bytes };
}
/** Sources and destinations are immutable object generations, never public URLs. */
export class GcsExportStorage implements ExportStorage {
  constructor(private readonly bucket: Bucket) {}
  async download(ownerId: string, source: MediaVersion, target: string, signal: AbortSignal): Promise<void> {
    if (source.ownerId !== ownerId || source.object.identity !== "verified") throw new SourceUnavailableError(source.id, `Source ${source.id} is unavailable.`);
    const object = source.object; let bytes = 0; const hash = createHash("sha256");
    const bounded = new Transform({ transform(chunk: Buffer, _encoding, callback): void { bytes += chunk.length; if (bytes > object.bytes || bytes > 512 * 1024 * 1024) { callback(new Error("Source byte limit exceeded")); return; } hash.update(chunk); callback(null, chunk); } });
    try { await pipeline(this.bucket.file(object.storagePath, { generation: object.generation }).createReadStream({ validation: "crc32c" }), bounded, createWriteStream(target, { flags: "wx", mode: 0o600 }), { signal }); }
    catch (error) { if (typeof error === "object" && error !== null && "code" in error && error.code === 404) throw new SourceUnavailableError(source.id, `Source ${source.id} is unavailable.`); throw error; }
    if (bytes !== object.bytes || hash.digest("hex") !== object.sha256) throw new SourceUnavailableError(source.id, `Source ${source.id} no longer matches the pinned bytes.`);
  }
  async remove(storagePath: string, generation: string): Promise<void> { if (!/^users\/[^/]+\/video-previews\//.test(storagePath)) throw new Error("Only derived editor previews can be retired by this cache."); await this.bucket.file(storagePath).delete({ ifGenerationMatch: generation, ignoreNotFound: true }); }
  async inspect(storagePath: string): Promise<ExportObject | undefined> {
    const file = this.bucket.file(storagePath);
    try { const [row] = await file.getMetadata(); const sha256 = row.metadata?.sha256; if (!row.generation || typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256) || !Number(row.size)) throw new WorkflowError("input_unavailable", "The stored export cannot be verified."); return { storagePath, generation: String(row.generation), sha256, bytes: Number(row.size) }; }
    catch (error) { if (typeof error === "object" && error !== null && "code" in error && error.code === 404) return undefined; throw error; }
  }
  async store(storagePath: string, localPath: string, evidence: { sha256: string; bytes: number }): Promise<ExportObject> {
    try { await pipeline(createReadStream(localPath), this.bucket.file(storagePath).createWriteStream({ resumable: false, validation: "crc32c", preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: "video/mp4", metadata: { sha256: evidence.sha256 } } })); }
    catch (error) { if (!(typeof error === "object" && error !== null && "code" in error && error.code === 412)) throw error; }
    const stored = await this.inspect(storagePath);
    if (!stored || stored.bytes !== evidence.bytes || stored.sha256 !== evidence.sha256) throw new WorkflowError("input_unavailable", "This export object conflicts with the verified rendered output."); return stored;
  }
  async access(ownerId: string, storagePath: string, generation?: string): Promise<{ url: string; expiresAt: string }> {
    if (!storagePath.startsWith(`users/${ownerId}/exports/`) && !storagePath.startsWith(`users/${ownerId}/video-previews/`)) throw new WorkflowError("access_denied", "This export is unavailable.");
    const expires = Date.now() + 15 * 60_000; const [url] = await this.bucket.file(storagePath).getSignedUrl({ version: "v4", action: "read", expires, responseDisposition: "attachment; filename=vidra-video.mp4", ...(generation ? { queryParams: { generation } } : {}) }); return { url, expiresAt: new Date(expires).toISOString() };
  }
}
