import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { assertNoLegacyApiKeyData } from "@utils/apiKeyUser";
import {
  requestPublicMedia,
  type PublicNetworkDependencies,
} from "./PublicNetworkTransport";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_REDIRECTS = 3;

export interface RemoteMediaFetchOptions {
  sourceUrl: string;
  fieldName: string;
  allowedContentTypes: readonly string[];
  maxBytes: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface FetchedRemoteMedia {
  buffer: Buffer;
  contentType: string;
  sourceUrl: string;
}

export interface RemoteMediaStream {
  stream: Readable;
  contentType: string;
  contentLength?: number;
  sourceUrl: string;
  cancel: (reason?: Error) => void;
}

function decodedBody(body: Readable, encoding: string | null): Readable {
  if (!encoding || encoding === "identity") return body;
  const decoder = encoding === "gzip" ? createGunzip()
    : encoding === "deflate" ? createInflate()
    : encoding === "br" ? createBrotliDecompress()
    : undefined;
  if (!decoder) throw new Error("Unsupported remote media content encoding");
  body.on("error", error => decoder.destroy(error));
  decoder.on("error", () => undefined);
  decoder.once("close", () => body.destroy());
  return body.pipe(decoder);
}

/** A streaming ingestion capability: all redirects/DNS and actual bytes are bounded. */
export async function openRemoteMedia(
  options: RemoteMediaFetchOptions,
  dependencies: PublicNetworkDependencies = {},
): Promise<RemoteMediaStream> {
  assertNoLegacyApiKeyData(options.sourceUrl);
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
    throw new Error("Remote media maximum size must be positive");
  }
  const controller = new AbortController();
  let body: Readable | undefined;
  let stream: Readable | undefined;
  const externalAbort = (): void => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) externalAbort();
  else options.signal?.addEventListener("abort", externalAbort, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new Error("Remote media request timed out")),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  timeout.unref();
  const aborted = (): void => {
    const error = controller.signal.reason instanceof Error
      ? controller.signal.reason
      : new Error("Remote media request aborted");
    body?.destroy(error);
    stream?.destroy(error);
  };
  controller.signal.addEventListener("abort", aborted, { once: true });
  const dispose = (): void => {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", externalAbort);
    controller.signal.removeEventListener("abort", aborted);
  };
  const cancel = (reason?: Error): void => {
    controller.abort(reason);
    body?.destroy();
    stream?.destroy();
    dispose();
  };

  try {
    let nextUrl = new URL(options.sourceUrl);
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const response = await requestPublicMedia(
        nextUrl, options.fieldName, controller.signal, dependencies,
      );
      body = response.body;
      body.on("error", () => undefined);
      controller.signal.throwIfAborted();
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        body.destroy();
        if (!location) throw new Error("Remote media redirect is missing a location");
        assertNoLegacyApiKeyData(location);
        if (redirects === MAX_REDIRECTS) throw new Error("Remote media exceeded the redirect limit");
        nextUrl = new URL(location, nextUrl);
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Failed to fetch remote media: ${response.status} ${response.statusText}`);
      }
      const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
      if (!options.allowedContentTypes.includes(contentType)) {
        throw new Error(`Invalid remote media content type: ${contentType || "unknown"}`);
      }
      const rawLength = response.headers.get("content-length");
      const contentLength = rawLength !== null && /^\d+$/.test(rawLength) ? Number(rawLength) : undefined;
      const sizeError = (): Error => new Error(`Remote media exceeds maximum size of ${options.maxBytes} bytes`);
      if (contentLength !== undefined && contentLength > options.maxBytes) throw sizeError();
      const input = decodedBody(
        body, response.headers.get("content-encoding")?.trim().toLowerCase() ?? null,
      );
      let received = 0;
      async function* bounded(): AsyncGenerator<Buffer> {
        try {
          for await (const chunk of input) {
            controller.signal.throwIfAborted();
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            received += bytes.length;
            if (received > options.maxBytes) throw sizeError();
            yield bytes;
          }
        } finally {
          input.destroy();
          body?.destroy();
          dispose();
        }
      }
      stream = Readable.from(bounded(), { objectMode: false });
      stream.on("error", () => undefined);
      stream.once("close", () => {
        input.destroy();
        body?.destroy();
        dispose();
      });
      return {
        stream,
        contentType,
        ...(contentLength !== undefined ? { contentLength } : {}),
        sourceUrl: nextUrl.href,
        cancel,
      };
    }
    throw new Error("Remote media exceeded the redirect limit");
  } catch (error) {
    cancel(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/** Only small purpose-bounded inputs are buffered; storage copies use the stream. */
export async function fetchRemoteMedia(
  options: RemoteMediaFetchOptions,
  dependencies: PublicNetworkDependencies = {},
): Promise<FetchedRemoteMedia> {
  const remote = await openRemoteMedia(options, dependencies);
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of remote.stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      chunks.push(bytes);
    }
    return {
      buffer: Buffer.concat(chunks, size),
      contentType: remote.contentType,
      sourceUrl: remote.sourceUrl,
    };
  } finally {
    remote.cancel();
  }
}
