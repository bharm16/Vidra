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
