import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Bucket } from "@google-cloud/storage";
import { GcsProjectSketchStorage, verifySketchPicture } from "../ProjectSketchStorage";

describe("exact Sketch picture storage", () => {
  it("decodes actual pixels and rejects mismatched labels, corrupt pictures and noncanonical bytes", async () => {
    const bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: "red" } }).png().toBuffer();
    const valid = `data:image/png;base64,${bytes.toString("base64")}`;
    expect(await verifySketchPicture(valid)).toMatchObject({ width: 32, height: 24, mime: "image/png", bytes });
    await expect(verifySketchPicture(valid.replace("image/png", "image/jpeg"))).rejects.toMatchObject({ code: "invalid_settings" });
    await expect(verifySketchPicture(`data:image/png;base64,${Buffer.from("not a picture").toString("base64")}`)).rejects.toMatchObject({ code: "invalid_settings" });
    await expect(verifySketchPicture("https://elsewhere/private.png")).rejects.toThrow();
    await expect(verifySketchPicture(valid.slice(0, -1))).rejects.toThrow();
  });

  it("reconciles a precondition collision only after verifying the stored generation and actual hash", async () => {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).png().toBuffer();
    const picture = await verifySketchPicture(`data:image/png;base64,${bytes.toString("base64")}`);
    const download = vi.fn(async () => [bytes]);
    const save = vi.fn(async () => { throw { code: 412 }; });
    const metadata = { size: String(bytes.length), generation: "11", contentType: "image/png", metadata: { sketchIntentHash: "intent", sketchSha256: picture.sha256 } };
    const file = vi.fn(() => ({ save, getMetadata: async () => [metadata], download }));
    const storage = new GcsProjectSketchStorage({ file } as unknown as Bucket);
    expect(await storage.put("users/owner/previews/images/exact.png", picture, "intent")).toMatchObject({ identity: "verified", generation: "11", sha256: picture.sha256 });
    expect(file).toHaveBeenLastCalledWith("users/owner/previews/images/exact.png", { generation: "11" });
    download.mockResolvedValueOnce([Buffer.from("different bytes")]);
    await expect(storage.put("users/owner/previews/images/exact.png", picture, "intent")).rejects.toMatchObject({ code: "submission_conflict" });
    await expect(storage.put("users/owner/previews/images/exact.png", picture, "other-intent")).rejects.toMatchObject({ code: "submission_conflict" });
  });
});
