import type { ReadableStream } from "node:stream/web";

export async function downloadVeoVideoStream(
  apiKey: string,
  videoUri: string,
  signal?: AbortSignal,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string }> {
  signal?.throwIfAborted();
  const response = await fetch(videoUri, {
    method: "GET",
    headers: {
      "x-goog-api-key": apiKey,
    },
    redirect: "follow",
    ...(signal ? { signal } : {}),
  });
  signal?.throwIfAborted();

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Veo download failed (${response.status}): ${text.slice(0, 400)}`,
    );
  }

  const contentType = response.headers.get("content-type") || "video/mp4";
  const body = response.body as ReadableStream<Uint8Array> | null;
  if (!body) {
    throw new Error("Veo download failed: empty response body.");
  }
  return { stream: body, contentType };
}
