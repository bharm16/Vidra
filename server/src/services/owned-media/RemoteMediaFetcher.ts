import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { assertUrlSafe } from "@server/shared/urlValidation";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_REDIRECTS = 3;

export interface RemoteMediaFetchOptions {
  sourceUrl: string;
  fieldName: string;
  allowedContentTypes: readonly string[];
  maxBytes: number;
  timeoutMs?: number;
}

export interface FetchedRemoteMedia {
  buffer: Buffer;
  contentType: string;
  sourceUrl: string;
}

function normalizeContentType(value: string | null): string {
  return (value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isAllowedContentType(
  contentType: string,
  allowedContentTypes: readonly string[],
): boolean {
  return allowedContentTypes.some((allowed) => contentType === allowed);
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

async function fetchWithSafeRedirects(
  sourceUrl: string,
  fieldName: string,
  signal: AbortSignal,
): Promise<{ response: Response; finalUrl: string }> {
  let nextUrl = sourceUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    assertUrlSafe(nextUrl, fieldName);
    const response = await fetch(nextUrl, { signal, redirect: "manual" });
    if (!isRedirect(response)) {
      return { response, finalUrl: nextUrl };
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Remote media redirect is missing a location");
    }
    if (redirectCount === MAX_REDIRECTS) {
      throw new Error("Remote media exceeded the redirect limit");
    }
    nextUrl = new URL(location, nextUrl).toString();
  }

  throw new Error("Remote media exceeded the redirect limit");
}

async function readBoundedBuffer(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > maxBytes) {
      throw new Error(`Remote media exceeds maximum size of ${maxBytes} bytes`);
    }
    return buffer;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const stream = Readable.fromWeb(
    response.body as unknown as NodeReadableStream<Uint8Array>,
  );
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      stream.destroy();
      throw new Error(`Remote media exceeds maximum size of ${maxBytes} bytes`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, totalBytes);
}

/**
 * Fetch remote media under the application-wide ingestion policy. Redirect
 * targets are revalidated, MIME is allowlisted, and a missing/lying
 * Content-Length cannot bypass the byte limit.
 */
export async function fetchRemoteMedia(
  options: RemoteMediaFetchOptions,
): Promise<FetchedRemoteMedia> {
  if (!Number.isFinite(options.maxBytes) || options.maxBytes <= 0) {
    throw new Error("Remote media maximum size must be positive");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const { response, finalUrl } = await fetchWithSafeRedirects(
      options.sourceUrl,
      options.fieldName,
      controller.signal,
    );
    if (!response.ok) {
      throw new Error(
        `Failed to fetch remote media: ${response.status} ${response.statusText}`,
      );
    }

    const contentType = normalizeContentType(response.headers.get("content-type"));
    if (!isAllowedContentType(contentType, options.allowedContentTypes)) {
      throw new Error(`Invalid remote media content type: ${contentType || "unknown"}`);
    }

    const contentLength = parseContentLength(response.headers.get("content-length"));
    if (contentLength !== null && contentLength > options.maxBytes) {
      throw new Error(
        `Remote media exceeds maximum size of ${options.maxBytes} bytes`,
      );
    }

    return {
      buffer: await readBoundedBuffer(response, options.maxBytes),
      contentType,
      sourceUrl: finalUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}
