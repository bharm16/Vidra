import type { Bucket } from "@google-cloud/storage";
import { fileTypeFromBuffer } from "file-type";
import {
  AUDIO_IMPORT_LIMITS,
  GENERATED_PICTURE_MAX_BYTES,
  canonicalImportContentType,
} from "@shared/schemas/workflow/import.schemas";
import { logger } from "@infrastructure/Logger";
import type { VideoAssetStore } from "@services/video-generation/storage";
import { storeVideoFromUrl } from "@services/video-generation/storage/utils";

const PICTURE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
]);

/** Where an exact native model's result is staged before delivery publishes it. */
export interface NativeModelOutputStore {
  storePicture(ownerId: string, slotId: string, url: string): Promise<string>;
  storeAudio(ownerId: string, slotId: string, url: string): Promise<string>;
  /** Returns the video asset id that delivery streams from. */
  storeVideo(url: string): Promise<string>;
}

function code(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}

/** Stages provider files under the owner's own paths; a 412 keeps the first copy. */
export class GcsNativeModelOutputStore implements NativeModelOutputStore {
  private readonly log = logger.child({ service: "GcsNativeModelOutputStore" });

  constructor(
    private readonly bucket: Bucket,
    private readonly videos: VideoAssetStore,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  storePicture(ownerId: string, slotId: string, url: string): Promise<string> {
    return this.stage(
      `users/${ownerId}/previews/images/native-${slotId}`,
      url,
      PICTURE_TYPES,
      GENERATED_PICTURE_MAX_BYTES,
    );
  }

  storeAudio(ownerId: string, slotId: string, url: string): Promise<string> {
    return this.stage(
      `users/${ownerId}/previews/audio/native-${slotId}`,
      url,
      AUDIO_TYPES,
      AUDIO_IMPORT_LIMITS.maxBytes,
    );
  }

  async storeVideo(url: string): Promise<string> {
    return (await storeVideoFromUrl(this.videos, url, this.log)).id;
  }

  private async stage(
    path: string,
    url: string,
    types: ReadonlySet<string>,
    maxBytes: number,
  ): Promise<string> {
    const response = await this.fetchImpl(url, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok)
      throw new Error(
        `The produced file could not be downloaded (${response.status})`,
      );
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > maxBytes)
      throw new Error("The produced file exceeds the storage limit");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > maxBytes)
      throw new Error(
        "The produced file is empty or exceeds the storage limit",
      );
    const sniffed = (await fileTypeFromBuffer(bytes))?.mime;
    const contentType = canonicalImportContentType(
      sniffed ?? response.headers.get("content-type") ?? "",
    );
    const accepted =
      contentType === "video/mp4" && types.has("audio/mp4")
        ? "audio/mp4"
        : contentType;
    if (!types.has(accepted))
      throw new Error(
        `The produced file has an unexpected type (${contentType || "unknown"})`,
      );
    try {
      await this.bucket
        .file(path)
        .save(bytes, {
          resumable: false,
          metadata: { contentType: accepted },
          preconditionOpts: { ifGenerationMatch: 0 },
        });
    } catch (error) {
      if (code(error) !== 412) throw error;
    }
    return path;
  }
}
