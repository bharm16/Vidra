import { fetchRemoteMedia } from "@services/owned-media/RemoteMediaFetcher";
import type { PublicNetworkDependencies } from "@services/owned-media/PublicNetworkTransport";

export interface VeoInlineData {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export async function fetchAsVeoInline(
  url: string,
  kind: "image" | "video" = "image",
  network: PublicNetworkDependencies = {},
  signal?: AbortSignal,
): Promise<VeoInlineData> {
  signal?.throwIfAborted();
  const allowedTypes =
    kind === "image" ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;
  const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  const { buffer, contentType } = await fetchRemoteMedia({
    sourceUrl: url,
    fieldName: "veoInlineMediaUrl",
    allowedContentTypes: [...allowedTypes],
    maxBytes,
    ...(signal ? { signal } : {}),
  }, network);

  return {
    inlineData: {
      mimeType: contentType,
      data: buffer.toString("base64"),
    },
  };
}
