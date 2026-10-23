import type { MediaVersion } from "../schemas/workflow/media.schemas";

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a",
};

/** A saved file name for one media version: its label plus the extension its bytes need to open. */
export function mediaDownloadName(version: Pick<MediaVersion, "label" | "metadata" | "object">): string {
  const contentType = version.metadata.state === "verified" ? version.metadata.contentType : undefined;
  const extension = (contentType ? EXTENSIONS[contentType] : undefined) ?? /\.([a-z0-9]{2,4})$/i.exec(version.object.storagePath)?.[1]?.toLowerCase();
  const printable = Array.from(version.label, character => (character.codePointAt(0) ?? 0) < 32 ? " " : character).join("");
  const base = printable.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "vidra-media";
  if (!extension || base.toLowerCase().endsWith(`.${extension}`)) return base;
  return `${base}.${extension}`;
}
