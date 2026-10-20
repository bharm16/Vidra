import type { Bucket } from "@google-cloud/storage";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
import { GENERATED_PICTURE_MAX_BYTES, GeneratedOutputCommandSchema, ImportCommandSchema } from "@shared/schemas/workflow/import.schemas";
import type { VideoAssetStore } from "@services/video-generation/storage";
import { GcsNativeModelOutputStore } from "../GcsNativeModelOutputStore";

function bucket(): { bucket: Bucket; save: ReturnType<typeof vi.fn> } {
  const save = vi.fn(async (_name: string, ..._args: unknown[]): Promise<void> => undefined);
  return { bucket: { file: (name: string) => ({ name, save: (...args: unknown[]) => save(name, ...args) }) } as unknown as Bucket, save };
}
const videos = {} as VideoAssetStore;

it("stages a produced picture under the owner with its sniffed type, never the claimed one", async () => {
  const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: "blue" } }).png().toBuffer();
  const { bucket: storage, save } = bucket();
  const store = new GcsNativeModelOutputStore(storage, videos, vi.fn(async () => new Response(new Uint8Array(png), { headers: { "content-type": "application/octet-stream" } })));
  await expect(store.storePicture("creator", "slot_native", "https://replicate.delivery/out")).resolves.toBe("users/creator/previews/images/native-slot_native");
  expect(save).toHaveBeenCalledWith("users/creator/previews/images/native-slot_native", png, expect.objectContaining({ metadata: { contentType: "image/png" }, preconditionOpts: { ifGenerationMatch: 0 } }));
});

it("refuses a produced file of the wrong kind or beyond its limit without storing it", async () => {
  const { bucket: storage, save } = bucket();
  const text = new GcsNativeModelOutputStore(storage, videos, vi.fn(async () => new Response("not audio", { headers: { "content-type": "text/plain" } })));
  await expect(text.storeAudio("creator", "slot_native", "https://replicate.delivery/out")).rejects.toThrow("unexpected type");
  const huge = new GcsNativeModelOutputStore(storage, videos, vi.fn(async () => new Response("x", { headers: { "content-length": String(GENERATED_PICTURE_MAX_BYTES + 1) } })));
  await expect(huge.storePicture("creator", "slot_native", "https://replicate.delivery/out")).rejects.toThrow("storage limit");
  expect(save).not.toHaveBeenCalled();
});

it("lets generated pictures exceed the 10 MB upload limit while uploads keep it", () => {
  const command = { id: "import_large", filename: "Picture.png", contentType: "image/png", bytes: 11 * 1024 * 1024, sha256: "a".repeat(64) };
  expect(ImportCommandSchema.safeParse(command).success).toBe(false);
  expect(GeneratedOutputCommandSchema.safeParse(command).success).toBe(true);
  expect(GeneratedOutputCommandSchema.safeParse({ ...command, bytes: GENERATED_PICTURE_MAX_BYTES + 1 }).success).toBe(false);
});
