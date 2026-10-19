import type { Bucket } from "@google-cloud/storage";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { OwnedObjectSchema, type MediaMetadata } from "@shared/schemas/workflow/media.schemas";
import { SketchPictureDataUriSchema } from "@shared/schemas/workflow/sketch.schemas";
import { WorkflowError } from "@services/projects/WorkflowError";

export interface VerifiedSketchPicture { bytes: Buffer; mime: string; sha256: string; width: number; height: number; }
export type VerifiedSketchObject = Extract<z.infer<typeof OwnedObjectSchema>, { identity: "verified" }>;
export interface ProjectSketchStorage {
  put(path: string, picture: VerifiedSketchPicture, intentHash: string): Promise<VerifiedSketchObject>;
}

/** Decode the whole picture, with a bounded pixel count; magic bytes alone are insufficient. */
export async function verifySketchPicture(input: unknown): Promise<VerifiedSketchPicture> {
  const uri = SketchPictureDataUriSchema.parse(input);
  const separator = uri.indexOf(",");
  const mime = uri.slice(5, uri.indexOf(";"));
  const encoded = uri.slice(separator + 1);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024 || bytes.toString("base64") !== encoded) throw new WorkflowError("invalid_settings", "This Sketch picture is too large or unreadable.");
  try {
    const picture = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
    const metadata = await picture.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 || `image/${metadata.format}` !== mime) throw new Error("Picture type mismatch");
    await picture.stats();
    return { bytes, mime, width: metadata.width, height: metadata.height, sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch { throw new WorkflowError("invalid_settings", "This Sketch picture is unreadable. Keep the displayed output and retry saving."); }
}

export function sketchPictureMetadata(picture: VerifiedSketchPicture): MediaMetadata {
  return { state: "verified", width: picture.width, height: picture.height, durationSeconds: 0, audio: "absent", probeVersion: "sketch-sharp-v1" };
}

/** A retry can only recover the exact object; it can never replace its bytes. */
export class GcsProjectSketchStorage implements ProjectSketchStorage {
  constructor(private readonly bucket: Bucket) {}
  async put(path: string, picture: VerifiedSketchPicture, intentHash: string): Promise<VerifiedSketchObject> {
    const file = this.bucket.file(path);
    try {
      await file.save(picture.bytes, { resumable: false, validation: "crc32c", contentType: picture.mime, metadata: { metadata: { sketchIntentHash: intentHash, sketchSha256: picture.sha256 } }, preconditionOpts: { ifGenerationMatch: 0 } });
    } catch (error) { if (!(typeof error === "object" && error !== null && "code" in error && error.code === 412)) throw error; }
    const [metadata] = await file.getMetadata();
    if (metadata.metadata?.sketchIntentHash !== intentHash || metadata.metadata?.sketchSha256 !== picture.sha256 || Number(metadata.size) !== picture.bytes.length || metadata.contentType !== picture.mime) throw new WorkflowError("submission_conflict", "This saved Sketch identity contains different bytes.");
    const generation = z.string().min(1).parse(metadata.generation);
    // Verify stored bytes on reconciliation too; metadata is not content proof.
    const [stored] = await this.bucket.file(path, { generation }).download({ validation: "crc32c" });
    if (stored.length !== picture.bytes.length || createHash("sha256").update(stored).digest("hex") !== picture.sha256) throw new WorkflowError("submission_conflict", "The saved Sketch picture could not be verified.");
    const object = OwnedObjectSchema.parse({ identity: "verified", assetId: path.split("/").at(-1), storagePath: path, generation, sha256: picture.sha256, bytes: picture.bytes.length });
    if (object.identity !== "verified") throw new WorkflowError("submission_conflict", "The stored Sketch identity could not be verified.");
    return object;
  }
}
