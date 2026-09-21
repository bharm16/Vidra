/**
 * Offline-replayable media capture (issue #139).
 *
 * A recorded response must replay with ZERO network. Live providers answer
 * image calls with CDN URLs (`https://fal.media/…`, `https://replicate.delivery/…`)
 * that die — so a URL captured verbatim would make every later replay of the
 * pack fail the moment the bytes were needed. The capture therefore inlines
 * the produced bytes as a `data:` URI: same picture, replayable forever, and
 * exactly the shape the cross-mode walkthrough's storage doubles decode.
 */

import { ReplayError } from "./errors";

export type MediaFetcher = (url: string) => Promise<Response>;

const ONE_MEGABYTE = 1024 * 1024;

function contentTypeOf(response: Response): string {
  return response.headers.get("content-type")?.split(";")[0] ?? "";
}

/**
 * Fetch a produced image and wrap its bytes as a `data:` URI. Already-inline
 * sources pass through untouched. A failed or empty download aborts the
 * recording run — capturing an unreachable URL would be worse than failing.
 */
export async function fetchAsDataUri(
  url: string,
  fetchImpl: MediaFetcher = fetch,
): Promise<string> {
  if (url.startsWith("data:")) {
    return url;
  }
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new ReplayError(
      `Recording could not download a produced image from ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!response.ok) {
    throw new ReplayError(
      `Recording could not download a produced image from ${url}: ` +
        `upstream answered ${response.status}`,
    );
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0 || buffer.byteLength > ONE_MEGABYTE) {
    throw new ReplayError(
      `Recording refused to inline the image at ${url}: ` +
        `${buffer.byteLength} bytes is outside the 1..1MiB capture window`,
    );
  }
  const contentType = contentTypeOf(response);
  if (!contentType.startsWith("image/")) {
    throw new ReplayError(
      `Recording refused to inline the image at ${url}: ` +
        `content-type "${contentType || "missing"}" is not an image`,
    );
  }
  return `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
}

/**
 * Inline every `images[].url` of a provider image response, returning a
 * payload whose picture bytes travel inside the fixture.
 */
export async function inlineImageUrls(
  payload: { images: Array<{ url: string }> },
  fetchImpl: MediaFetcher = fetch,
): Promise<{ images: Array<{ url: string }> }> {
  const images = await Promise.all(
    payload.images.map(async (image) => ({
      url: await fetchAsDataUri(image.url, fetchImpl),
    })),
  );
  return { ...payload, images };
}
