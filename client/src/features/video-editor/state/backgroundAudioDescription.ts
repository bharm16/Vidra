import { canonicalImportContentType } from "@shared/schemas/workflow/import.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";

const formatNames: Record<string, string> = { "audio/wav": "WAV", "audio/mpeg": "MP3", "audio/ogg": "OGG", "audio/mp4": "M4A", "video/mp4": "MP4", "video/webm": "WebM" };
const secondsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/** Describes verified file facts without inferring a format from a name or URL. */
export function backgroundAudioDescription(kind: MediaVersion["kind"], contentType?: string, durationSeconds?: number): string {
  const fallback = kind === "video" || kind === "export" ? "Video" : "Audio";
  const format = contentType ? formatNames[canonicalImportContentType(contentType)] ?? fallback : fallback;
  if (durationSeconds === undefined || !Number.isFinite(durationSeconds) || durationSeconds < 0) return format;
  const seconds = secondsFormat.format(durationSeconds);
  return `${format} · ${seconds} ${seconds === "1" ? "second" : "seconds"}`;
}
