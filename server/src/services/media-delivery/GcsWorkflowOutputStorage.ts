import type { Bucket, FileMetadata } from "@google-cloud/storage";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { AUDIO_IMPORT_LIMITS, GENERATED_PICTURE_MAX_BYTES, GeneratedOutputCommandSchema, canonicalImportContentType } from "@shared/schemas/workflow/import.schemas";
import { isOwnedPicturePath, fetchRemoteMedia, openRemoteMedia, type PublicNetworkDependencies } from "@services/owned-media";
import { fileTypeFromBuffer } from "file-type";
import { verifyImportFile } from "@services/project-media/ProjectMediaStorage";
import type { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import { WorkflowError } from "@services/projects/WorkflowError";
import { VerifiedOutputSchema, type ExecutionAttempt, type NativeOutput, type VerifiedOutput, type WorkflowOutputStorage } from "@services/creation-requests/execution";

const MAX_BYTES = 500 * 1024 * 1024;
function code(error: unknown): unknown { return typeof error === "object" && error !== null && "code" in error ? error.code : undefined; }

/** Publishes owned bytes under deterministic slot paths; a 412 reconciles, never overwrites. */
export class GcsWorkflowOutputStorage implements WorkflowOutputStorage {
  constructor(private readonly bucket: Bucket, private readonly videos: Pick<VideoGenerationService, "getVideoContent"> | null, private readonly network: PublicNetworkDependencies = {}) {}

  async materialize(attempt: ExecutionAttempt, output: NativeOutput): Promise<VerifiedOutput> {
    if (output.kind === "text") throw new WorkflowError("invalid_settings", "Text does not have a media file.");
    const kind = output.kind === "provider-media" ? output.mediaKind : output.kind;
    const [folder, extension, filename, limit] = kind === "image" ? ["images", "webp", "Picture.webp", GENERATED_PICTURE_MAX_BYTES] : kind === "audio" ? ["audio", "mp3", "Audio.mp3", AUDIO_IMPORT_LIMITS.maxBytes] : ["videos", "mp4", "Clip.mp4", MAX_BYTES];
    const path = `users/${attempt.ownerId}/previews/${folder}/workflow-${attempt.slotId}.${extension}`;
    const destination = this.bucket.file(path);
    const provenance = { workflowRequestId: attempt.requestId, workflowSlotId: attempt.slotId, workflowSnapshotHash: attempt.snapshotHash };
    let metadata: FileMetadata | undefined;
    try { [metadata] = await destination.getMetadata(); } catch (error) { if (code(error) !== 404) throw error; }
    if (!metadata) {
      try {
        if (output.kind === "provider-media") {
          const allowed = kind === "image" ? ["image/png", "image/jpeg", "image/webp"] : kind === "audio" ? ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "video/mp4"] : ["video/mp4", "video/webm"];
          const options = { sourceUrl: output.sourceUrl, fieldName: "provider output", allowedContentTypes: [...allowed, "application/octet-stream"], maxBytes: limit, timeoutMs: 120000 };
          if (kind === "video") {
            const remote = await openRemoteMedia(options, this.network);
            try { await pipeline(remote.stream, destination.createWriteStream({ resumable: false, metadata: { contentType: remote.contentType, metadata: provenance }, preconditionOpts: { ifGenerationMatch: 0 } }), { signal: AbortSignal.timeout(120000) }); }
            finally { remote.cancel(); }
          } else {
            const remote = await fetchRemoteMedia(options, this.network);
            const sniffed = await fileTypeFromBuffer(remote.buffer);
            const contentType = canonicalImportContentType(sniffed?.mime ?? "");
            const accepted = kind === "audio" && contentType === "video/mp4" ? "audio/mp4" : contentType;
            if (!remote.buffer.length || !allowed.includes(contentType)) throw new WorkflowError("invalid_settings", "The produced file has an unexpected type.");
            await destination.save(remote.buffer, { resumable: false, metadata: { contentType: accepted, metadata: provenance }, preconditionOpts: { ifGenerationMatch: 0 } });
          }
        } else if (output.kind === "image" || output.kind === "audio") {
          const owned = output.kind === "image" ? isOwnedPicturePath(attempt.ownerId, output.storagePath) : output.storagePath.startsWith(`users/${attempt.ownerId}/previews/audio/`);
          if (!owned || output.storagePath.includes("..") || output.storagePath.includes("://")) throw new WorkflowError("access_denied", `The produced ${output.kind === "image" ? "picture" : "audio"} is not owned by this creator.`);
          const [source] = await this.bucket.file(output.storagePath).getMetadata();
          if (!source.generation || Number(source.size) <= 0 || Number(source.size) > limit) throw new WorkflowError("invalid_settings", `The produced ${output.kind === "image" ? "picture" : "audio"} is unavailable or too large.`);
          await this.bucket.file(output.storagePath, { generation: source.generation }).copy(destination, { preconditionOpts: { ifGenerationMatch: 0 }, ...(source.contentType ? { contentType: source.contentType } : {}), metadata: provenance });
        } else {
          const source = await this.videos?.getVideoContent(output.assetId);
          if (!source || (source.contentLength !== undefined && source.contentLength > MAX_BYTES)) throw new WorkflowError("input_unavailable", "The produced clip is unavailable or too large.");
          let count = 0;
          await pipeline(source.stream, new Transform({ transform(chunk: Buffer, _encoding, callback): void { count += chunk.length; callback(count > MAX_BYTES ? new Error("Produced clip exceeds the storage limit") : null, chunk); } }), destination.createWriteStream({ resumable: false, metadata: { contentType: source.contentType, metadata: provenance }, preconditionOpts: { ifGenerationMatch: 0 } }), { signal: AbortSignal.timeout(120000) });
        }
      } catch (error) { if (code(error) !== 412) throw error; }
      [metadata] = await destination.getMetadata();
    }
    if (metadata.metadata?.workflowRequestId !== attempt.requestId || metadata.metadata?.workflowSlotId !== attempt.slotId || metadata.metadata?.workflowSnapshotHash !== attempt.snapshotHash) throw new WorkflowError("submission_conflict", "This stored output belongs to another execution.");
    const bytes = z.number().int().positive().max(limit).parse(Number(metadata.size));
    const generation = z.string().min(1).parse(metadata.generation);
    const directory = await mkdtemp(join(tmpdir(), "vidra-output-"));
    try {
      const file = join(directory, "media");
      const hash = createHash("sha256");
      let received = 0;
      await pipeline(this.bucket.file(path, { generation }).createReadStream({ validation: "crc32c" }), new Transform({ transform(chunk: Buffer, _encoding, callback): void { received += chunk.length; hash.update(chunk); callback(received > bytes ? new Error("Stored output size changed") : null, chunk); } }), createWriteStream(file), { signal: AbortSignal.timeout(120000) });
      const command = GeneratedOutputCommandSchema.parse({ id: `import_${attempt.slotId.slice(5)}`, filename, contentType: metadata.contentType, bytes, sha256: hash.digest("hex") });
      const verified = await verifyImportFile(file, command, GeneratedOutputCommandSchema);
      return VerifiedOutputSchema.parse({ object: { identity: "verified", assetId: attempt.slotId, storagePath: path, generation, sha256: verified.sha256, bytes: verified.bytes }, metadata: verified.metadata });
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}
