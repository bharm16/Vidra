import { expect, it } from "vitest";
import { AUDIO_IMPORT_LIMITS, canonicalImportContentType, ImportCommandSchema } from "../import.schemas";

const input = { id: "import_audio", filename: "Audio", bytes: 100, sha256: "a".repeat(64) };
it("supports canonical audio types and normalizes browser/sniffer aliases", () => {
  for (const type of ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"]) expect(ImportCommandSchema.parse({ ...input, contentType: type }).contentType).toBe(type);
  expect(canonicalImportContentType("audio/x-wav")).toBe("audio/wav"); expect(canonicalImportContentType("audio/x-m4a")).toBe("audio/mp4"); expect(canonicalImportContentType("audio/ogg; codecs=opus")).toBe("audio/ogg");
});
it("bounds audio independently while preserving existing picture and clip limits", () => {
  expect(ImportCommandSchema.safeParse({ ...input, contentType: "audio/wav", bytes: AUDIO_IMPORT_LIMITS.maxBytes + 1 }).success).toBe(false);
  expect(ImportCommandSchema.safeParse({ ...input, contentType: "image/png", bytes: 10 * 1024 * 1024 + 1 }).success).toBe(false);
  expect(ImportCommandSchema.safeParse({ ...input, contentType: "video/mp4", bytes: 500 * 1024 * 1024 }).success).toBe(true);
  expect(ImportCommandSchema.safeParse({ ...input, contentType: "audio/flac" }).success).toBe(false);
});
