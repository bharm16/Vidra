import type { Bucket, FileMetadata } from "@google-cloud/storage";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { ImportCommandSchema } from "@shared/schemas/workflow/import.schemas";
import { isOwnedPicturePath } from "@services/owned-media";
import { verifyImportFile } from "@services/project-media/ProjectMediaStorage";
import type { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import { WorkflowError } from "@services/projects/WorkflowError";
import { VerifiedOutputSchema, type ExecutionAttempt, type NativeOutput, type VerifiedOutput, type WorkflowOutputStorage } from "@services/creation-requests/execution/types";

const MAX_BYTES = 500 * 1024 * 1024;
function code(error: unknown): unknown { return typeof error === "object" && error !== null && "code" in error ? error.code : undefined; }

/** Publishes owned bytes under deterministic slot paths; a 412 reconciles, never overwrites. */
export class GcsWorkflowOutputStorage implements WorkflowOutputStorage {
  constructor(private readonly bucket: Bucket, private readonly videos: Pick<VideoGenerationService, "getVideoContent"> | null) {}

  async materialize(attempt: ExecutionAttempt, output: NativeOutput): Promise<VerifiedOutput> {
    if (output.kind === "text") throw new WorkflowError("invalid_settings", "Text does not have a media file.");
    const path = `users/${attempt.ownerId}/previews/${output.kind === "image" ? "images" : "videos"}/workflow-${attempt.slotId}.${output.kind === "image" ? "webp" : "mp4"}`;
    const destination = this.bucket.file(path);
    const provenance = { workflowRequestId: attempt.requestId, workflowSlotId: attempt.slotId, workflowSnapshotHash: attempt.snapshotHash };
    let metadata: FileMetadata | undefined;
    try { [metadata] = await destination.getMetadata(); } catch (error) { if (code(error) !== 404) throw error; }
    if (!metadata) {
      try {
        if (output.kind === "image") {
          if (!isOwnedPicturePath(attempt.ownerId, output.storagePath) || output.storagePath.includes("..") || output.storagePath.includes("://")) throw new WorkflowError("access_denied", "The produced picture is not owned by this creator.");
          const [source] = await this.bucket.file(output.storagePath).getMetadata();
          if (!source.generation || Number(source.size) <= 0 || Number(source.size) > 10 * 1024 * 1024) throw new WorkflowError("invalid_settings", "The produced picture is unavailable or too large.");
          await this.bucket.file(output.storagePath, { generation: source.generation }).copy(destination, { preconditionOpts: { ifGenerationMatch: 0 }, metadata: provenance });
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
    const bytes = z.number().int().positive().max(output.kind === "image" ? 10 * 1024 * 1024 : MAX_BYTES).parse(Number(metadata.size));
    const generation = z.string().min(1).parse(metadata.generation);
    const directory = await mkdtemp(join(tmpdir(), "vidra-output-"));
    try {
      const file = join(directory, "media");
      const hash = createHash("sha256");
      let received = 0;
      await pipeline(this.bucket.file(path, { generation }).createReadStream({ validation: "crc32c" }), new Transform({ transform(chunk: Buffer, _encoding, callback): void { received += chunk.length; hash.update(chunk); callback(received > bytes ? new Error("Stored output size changed") : null, chunk); } }), createWriteStream(file), { signal: AbortSignal.timeout(120000) });
      const command = ImportCommandSchema.parse({ id: `import_${attempt.slotId.slice(5)}`, filename: output.kind === "image" ? "Picture.webp" : "Clip.mp4", contentType: metadata.contentType, bytes, sha256: hash.digest("hex") });
      const verified = await verifyImportFile(file, command);
      return VerifiedOutputSchema.parse({ object: { identity: "verified", assetId: attempt.slotId, storagePath: path, generation, sha256: verified.sha256, bytes: verified.bytes }, metadata: verified.metadata });
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}
