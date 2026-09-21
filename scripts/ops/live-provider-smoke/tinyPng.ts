/**
 * A real, tiny PNG, synthesized in-process.
 *
 * The replay cassette's data URIs are header-stamped stubs — replay never
 * forwards them. The live smoke's providers really decode what they receive:
 * fal's i2i runner and nano-banana-2 both fetch the image the request names,
 * and a stub 400s at the provider, which would fail the smoke for a reason
 * that has nothing to do with provider health. So the smoke draws its own
 * genuine picture: `size × size` grayscale, one flat level.
 *
 * Pure module: node:zlib + arithmetic, no I/O.
 */

import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** CRC-32 (the polynomial PNG's chunk tables use). */
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * A flat grayscale PNG at the given level (0-255). Deterministic bytes for a
 * given (level, size), so distinct levels make distinct pictures with
 * distinct digests.
 */
export function tinyPngBytes(level: number, size = 16): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale
  // compression / filter / interlace all 0
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size + 1);
    row[0] = 0; // filter: none
    row.fill(level & 0xff, 1);
    rows.push(row);
  }
  const idat = deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The same picture as the data URI a browser (or the accept door) sends. */
export function tinyPngDataUri(level: number, size = 16): string {
  return `data:image/png;base64,${tinyPngBytes(level, size).toString("base64")}`;
}

/** Wrap fetched provider output as the data URI the accept door consumes. */
export function dataUriFromBytes(
  bytes: Buffer,
  mime: string,
): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
