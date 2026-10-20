import sharp from "sharp";
import type { ModelInputTools } from "./types";

const MAX_MASK_BYTES = 10 * 1024 * 1024;
const MAX_MASK_PIXELS = 40_000_000;

/**
 * Vidra area masks are the painted canvas: painted pixels are opaque, the rest
 * transparent. Ideogram reads black as "edit" and white as "keep", at the
 * source picture's size, so any painted pixel becomes black.
 */
export async function blackEditMaskFromAlpha(mask: Buffer): Promise<string> {
  const { data, info } = await sharp(mask, {
    limitInputPixels: MAX_MASK_PIXELS,
  })
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (data[index] ?? 0) > 0 ? 0 : 255;
  }
  const png = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

export function createAreaMaskTools(
  fetchImpl: typeof fetch = fetch,
): ModelInputTools {
  return {
    async blackEditMask(url: string): Promise<string> {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok)
        throw new Error(`The area mask could not be read (${response.status})`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_MASK_BYTES)
        throw new Error("The area mask is too large");
      return blackEditMaskFromAlpha(bytes);
    },
  };
}
