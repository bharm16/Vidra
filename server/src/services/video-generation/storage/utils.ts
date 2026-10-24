import { openRemoteMedia, type PublicNetworkDependencies } from "@services/owned-media";
import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";
import type { StoredVideoAsset, VideoAssetStore } from "./types";

type LogSink = {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

export function toNodeReadableStream(
  body: ReadableStream<Uint8Array> | null,
  signal?: AbortSignal,
): NodeJS.ReadableStream {
  if (!body) {
    throw new Error("Response body is empty");
  }
  return Readable.fromWeb(body, signal ? { signal } : {});
}

export async function storeVideoFromUrl(
  assetStore: VideoAssetStore,
  url: string,
  log?: LogSink,
  signal?: AbortSignal,
  network: PublicNetworkDependencies = {},
): Promise<StoredVideoAsset> {
  const remote = await openRemoteMedia({ sourceUrl: url, fieldName: "provider video", allowedContentTypes: ["video/mp4", "video/webm"], maxBytes: 500 * 1024 * 1024, ...(signal ? { signal } : {}) }, network);
  log?.info("Storing provider video", { contentType: remote.contentType });
  try { return await assetStore.storeFromStream(remote.stream, remote.contentType); }
  finally { remote.cancel(); }
}
