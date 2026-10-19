import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { VideoText } from "@shared/schemas/workflow/video-edit.schemas";
import { VIDEO_PRESETS } from "@shared/video-edit/composition";
import type { VideoPreset } from "@shared/schemas/workflow/video-edit.schemas";
import { CaptionPolicyError } from "./CaptionPolicyError";

const names = { 400: "Regular", 500: "Medium", 600: "SemiBold" } as const;
type FontFamily = NonNullable<VideoText["fontFamily"]>;
type FontWeight = VideoText["fontWeight"];
const fontHashes = {
  Inter: {
    400: "40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82",
    500: "97ad806f526e41546d46365bb3a393145f75b7b1568913db74549ad8b8dba872",
    600: "78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3",
  },
  Figtree: {
    400: "81f3fc9d8d4e307e5ae0dd43a03d22eb90d50b6cc72241552c460a59b6731b31",
    500: "f8a90c01bc4c31aa84be5cbff3e80784bfc0da37e5aaa23eb9e05108b9ba0ece",
    600: "b5d3fe714f8283b072579c9318c6cbe9e028ca51d6ba33eed0412a828ec331da",
  },
} as const;
const captionLayoutVersion = "vidra-caption-layout/v2:pango-absolute-lines-native-origin";

export function videoFontPath(weight: FontWeight, family: FontFamily = "Inter"): string {
  if ((family !== "Inter" && family !== "Figtree") || (weight !== 400 && weight !== 500 && weight !== 600)) throw new Error("The selected caption font is unavailable.");
  return fileURLToPath(new URL(`./fonts/${family}-${names[weight]}.ttf`, import.meta.url));
}
async function fontBytes(family: FontFamily, weight: FontWeight): Promise<Buffer> {
  const bytes = await readFile(videoFontPath(weight, family));
  if (createHash("sha256").update(bytes).digest("hex") !== fontHashes[family][weight]) throw new Error(`The bundled ${family} ${names[weight]} caption font is not qualified.`);
  return bytes;
}
export async function fontFingerprint(): Promise<string> {
  const hash = createHash("sha256").update(captionLayoutVersion);
  for (const family of ["Inter", "Figtree"] as const) for (const weight of [400, 500, 600] as const) hash.update(`${family}:${weight}:`).update(await fontBytes(family, weight));
  return hash.digest("hex");
}
function escapeMarkup(text: string): string { return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }

/** Admit glyphs from the exact selected font instead of system-font fallback. */
function supportsGlyph(bytes: Buffer, point: number): boolean {
  const tables = bytes.readUInt16BE(4); let cmap = 0;
  for (let index = 0; index < tables; index += 1) { const offset = 12 + index * 16; if (bytes.toString("ascii", offset, offset + 4) === "cmap") cmap = bytes.readUInt32BE(offset + 8); }
  if (!cmap) return false;
  const count = bytes.readUInt16BE(cmap + 2);
  for (let index = 0; index < count; index += 1) {
    const record = cmap + 4 + index * 8; const table = cmap + bytes.readUInt32BE(record + 4); const format = bytes.readUInt16BE(table);
    if (format === 12) { const groups = bytes.readUInt32BE(table + 12); for (let group = 0; group < groups; group += 1) { const offset = table + 16 + group * 12; const from = bytes.readUInt32BE(offset); const to = bytes.readUInt32BE(offset + 4); if (point >= from && point <= to) return bytes.readUInt32BE(offset + 8) + point - from !== 0; } }
    if (format === 4 && point <= 0xffff) {
      const segments = bytes.readUInt16BE(table + 6) / 2;
      for (let segment = 0; segment < segments; segment += 1) { const end = bytes.readUInt16BE(table + 14 + segment * 2); const start = bytes.readUInt16BE(table + 16 + segments * 2 + segment * 2); if (point < start || point > end) continue; const delta = bytes.readInt16BE(table + 16 + segments * 4 + segment * 2); const rangeOffset = table + 16 + segments * 6 + segment * 2; const range = bytes.readUInt16BE(rangeOffset); if (!range) return ((point + delta) & 0xffff) !== 0; const glyph = bytes.readUInt16BE(rangeOffset + range + (point - start) * 2); return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0; }
    }
  }
  return false;
}
export interface CaptionRaster { png: Buffer; x: number; y: number; width: number; height: number; }
interface CaptionInk { png: Buffer; left: number; top: number; width: number; height: number; }
function policy(cue: VideoText, message: string, unsupportedCodePoints?: number[]): CaptionPolicyError {
  return new CaptionPolicyError([{ elementId: cue.id, code: "text_render_policy", message, ...(unsupportedCodePoints ? { unsupportedCodePoints } : {}) }]);
}

/** Native libvips preserves Pango's ink origin in its documented .v header.
 * PNG alone loses that origin and would discard the first line's leading.
 */
async function explicitInk(cue: VideoText, family: FontFamily, width: number): Promise<CaptionInk> {
  const lineHeight = cue.fontSize * (cue.lineHeightEm ?? 1.2);
  const letterSpacing = Math.round(cue.fontSize * (cue.letterSpacingEm ?? 0) * 1024);
  const markup = `<span foreground="${cue.color}" fallback="false" letter_spacing="${letterSpacing}" line_height="${Math.round(lineHeight * 1024)}">${escapeMarkup(cue.text)}</span>`;
  const directory = await mkdtemp(join(tmpdir(), "vidra-caption-layout-"));
  try {
    const path = join(directory, "ink.v");
    const info = await sharp({ text: { text: markup, fontfile: videoFontPath(cue.fontWeight, family), font: `${family} ${names[cue.fontWeight]} ${cue.fontSize}`, width, dpi: 72, align: cue.align, wrap: "word-char", rgba: true } }).toFile(path);
    const handle = await open(path, "r");
    const header = Buffer.alloc(64);
    try { const result = await handle.read(header, 0, header.length, 0); if (result.bytesRead !== header.length) throw new Error("The caption layout header is incomplete."); }
    finally { await handle.close(); }
    const littleEndian = header.readUInt32LE(0) === 0x08f2a6b6;
    if (!littleEndian && header.readUInt32BE(0) !== 0x08f2a6b6) throw new Error("The caption layout format is unavailable.");
    const integer = (offset: number): number => littleEndian ? header.readInt32LE(offset) : header.readInt32BE(offset);
    if (integer(4) !== info.width || integer(8) !== info.height || integer(12) !== 4 || integer(20) !== 0 || integer(24) !== 0) throw new Error("The caption layout pixels are unavailable.");
    return { png: await sharp(path).png().toBuffer(), left: integer(48), top: integer(52), width: info.width, height: info.height };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function rasterizeCaption(cue: VideoText, preset: VideoPreset): Promise<CaptionRaster> {
  const family = cue.fontFamily ?? "Inter";
  const fontfile = videoFontPath(cue.fontWeight, family); const bytes = await fontBytes(family, cue.fontWeight);
  if (!Number.isFinite(cue.fontSize) || cue.fontSize < 12 || cue.fontSize > 240 || cue.letterSpacingEm !== undefined && (!Number.isFinite(cue.letterSpacingEm) || cue.letterSpacingEm < -.2 || cue.letterSpacingEm > 1) || cue.lineHeightEm !== undefined && (!Number.isFinite(cue.lineHeightEm) || cue.lineHeightEm < .5 || cue.lineHeightEm > 4)) throw policy(cue, `Text ${cue.id}: its typography is outside the supported bounds.`);
  if (!cue.text.trim()) throw policy(cue, `Text ${cue.id}: enter text or remove this text element.`);
  const unsupported = new Set<number>();
  for (const character of cue.text) { if (character === "\n" || character === "\r" || character === "\t") continue; const point = character.codePointAt(0); if (point !== undefined && !supportsGlyph(bytes, point)) unsupported.add(point); }
  const unsupportedCodePoints = [...unsupported];
  if (unsupportedCodePoints.length) throw policy(cue, `Text ${cue.id}: this font does not support ${String.fromCodePoint(unsupportedCodePoints[0] ?? 0)}. Choose supported text.`, unsupportedCodePoints);
  const { width: outputWidth, height: outputHeight } = VIDEO_PRESETS[preset]; const boxWidth = Math.round(outputWidth * cue.width); const boxHeight = Math.round(outputHeight * cue.height);
  if (!Number.isFinite(boxWidth) || !Number.isFinite(boxHeight) || boxWidth < 1 || boxHeight < 1 || boxWidth > outputWidth || boxHeight > outputHeight) throw policy(cue, `Text ${cue.id}: its text box is outside the supported bounds.`);
  const explicit = cue.fontFamily !== undefined || cue.letterSpacingEm !== undefined || cue.lineHeightEm !== undefined;
  if (explicit) {
    if (process.platform === "darwin" && process.env.PANGOCAIRO_BACKEND !== "fontconfig") throw new Error(`Text ${cue.id}: the selected native font backend is not qualified for its typography.`);
    const ink = await explicitInk(cue, family, boxWidth);
    if (ink.left < 0 || ink.top < 0 || ink.left + ink.width > boxWidth || ink.top + ink.height > boxHeight || !Number.isFinite(cue.x) || !Number.isFinite(cue.y) || cue.x < 0 || cue.y < 0 || cue.x + cue.width > 1 || cue.y + cue.height > 1) throw policy(cue, `Text ${cue.id}: the words overflow this text box. Enlarge it, reduce the size or shorten the words.`);
    const png = await sharp({ create: { width: boxWidth, height: boxHeight, channels: 4, background: cue.background ?? { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: ink.png, left: ink.left, top: ink.top }]).png().toBuffer();
    return { png, x: Math.round(outputWidth * cue.x), y: Math.round(outputHeight * cue.y), width: boxWidth, height: boxHeight };
  }
  // Preserve the captured legacy Inter raster, including its historical ink-top placement.
  const rendered = await sharp({ text: { text: `<span foreground="${cue.color}">${escapeMarkup(cue.text)}</span>`, fontfile, font: `Inter ${cue.fontWeight === 400 ? "Regular" : cue.fontWeight === 500 ? "Medium" : "SemiBold"} ${cue.fontSize}`, width: boxWidth, dpi: 72, align: cue.align, wrap: "word-char", rgba: true } }).png().toBuffer({ resolveWithObject: true }).catch((error: unknown) => {
    // libvips on Linux refuses an oversized text surface before the box check can run.
    if (error instanceof Error && /too big/i.test(error.message)) throw policy(cue, `Text ${cue.id}: the words overflow this text box. Enlarge it, reduce the size or shorten the words.`);
    throw error;
  });
  if (rendered.info.height > boxHeight || rendered.info.width > boxWidth) throw policy(cue, `Text ${cue.id}: the words overflow this text box. Enlarge it, reduce the size or shorten the words.`);
  const left = cue.align === "center" ? Math.floor((boxWidth - rendered.info.width) / 2) : cue.align === "right" ? boxWidth - rendered.info.width : 0;
  const png = await sharp({ create: { width: boxWidth, height: Math.max(1, boxHeight), channels: 4, background: cue.background ?? { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: rendered.data, left, top: 0 }]).png().toBuffer();
  return { png, x: Math.round(outputWidth * cue.x), y: Math.round(outputHeight * cue.y), width: boxWidth, height: boxHeight };
}
