import { expect, it } from "vitest";
import { MediaVersionSchema } from "../media.schemas";

it("WP-01 preserves unknown upload history and distinguishes unprobed audio from silence", () => {
  const media = {
    schemaVersion: "vidra-workflow/v2", id: "version_upload", ownerId: "creator", projectId: "project_campaign",
    kind: "video", label: "Imported clip", origin: { kind: "upload" }, sourceInputs: [],
    object: { assetId: "owned-asset", storagePath: "users/creator/video/clip.mp4", identity: "unknown" },
    metadata: { state: "pending" }, association: "linked", createdAt: "2026-10-10T20:00:00.000Z",
  };
  expect(MediaVersionSchema.parse(media).metadata).toEqual({ state: "pending" });
  expect(MediaVersionSchema.safeParse({ ...media, origin: { kind: "generated" } }).success).toBe(false);
  expect(MediaVersionSchema.safeParse({ ...media, object: { ...media.object, storagePath: "https://provider/temporary.mp4" } }).success).toBe(false);
});

it("records verified audio without inventing a visual stream", () => {
  const audio = {
    schemaVersion: "vidra-workflow/v2", id: "version_audio", ownerId: "creator", projectId: "project_campaign",
    kind: "audio", label: "Music", origin: { kind: "upload" }, sourceInputs: [],
    object: { assetId: "owned-audio", storagePath: "users/creator/audio/music.wav", identity: "unknown" },
    metadata: { state: "verified", durationSeconds: 10, audio: "present", probeVersion: "fixture/1" },
    association: "linked", createdAt: "2026-10-10T20:00:00.000Z",
  };
  expect(MediaVersionSchema.safeParse(audio).success).toBe(true);
  expect(MediaVersionSchema.safeParse({ ...audio, kind: "video" }).success).toBe(false);
  expect(MediaVersionSchema.safeParse({ ...audio, metadata: { ...audio.metadata, width: 1, height: 1 } }).success).toBe(false);
  expect(MediaVersionSchema.safeParse({ ...audio, metadata: { ...audio.metadata, framesPerSecond: 24 } }).success).toBe(false);
  expect(MediaVersionSchema.safeParse({ ...audio, kind: "video", metadata: { ...audio.metadata, width: 1280, height: 720 } }).success).toBe(true);
});

it("retains legacy unknown formats and validates recorded verified content types against the media kind", () => {
  const audio = {
    schemaVersion: "vidra-workflow/v2", id: "version_audio_format", ownerId: "creator", projectId: "project_campaign",
    kind: "audio", label: "Music", origin: { kind: "upload" }, sourceInputs: [],
    object: { assetId: "owned-audio", storagePath: "users/creator/audio/music", identity: "unknown" },
    metadata: { state: "verified", durationSeconds: 24, audio: "present", probeVersion: "fixture/1" },
    association: "linked", createdAt: "2026-10-10T20:00:00.000Z",
  };
  expect(MediaVersionSchema.parse(audio).metadata).not.toHaveProperty("contentType");
  expect(MediaVersionSchema.parse({ ...audio, metadata: { ...audio.metadata, contentType: "audio/wav" } }).metadata).toMatchObject({ contentType: "audio/wav" });
  expect(MediaVersionSchema.safeParse({ ...audio, metadata: { ...audio.metadata, contentType: "audio/invented" } }).success).toBe(false);
  expect(MediaVersionSchema.safeParse({ ...audio, metadata: { ...audio.metadata, contentType: "video/mp4" } }).success).toBe(false);
  expect(MediaVersionSchema.safeParse({ ...audio, kind: "export", metadata: { ...audio.metadata, width: 64, height: 36, contentType: "video/mp4" } }).success).toBe(true);
  expect(MediaVersionSchema.safeParse({ ...audio, metadata: { state: "pending", contentType: "audio/wav" } }).success).toBe(false);
});
