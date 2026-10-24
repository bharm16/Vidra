import { expect, it, vi } from "vitest";
import type { Storage } from "@google-cloud/storage";
import { Readable, Writable } from "node:stream";
import { controlledNetwork } from "@services/owned-media/__tests__/controlledNetwork";
import { UploadService } from "../services/UploadService";
it("recovers an uncertain legacy delivery from the same immutable destination", async () => {
  let row: { size: string; contentType: string; metadata: Record<string, unknown> } | undefined;
  let loseResponse = true;
  const network = controlledNetwork(() => ({ headers: { "content-type": "video/mp4" }, body: Readable.from([Buffer.from("video")]) }));
  const file = { getMetadata: vi.fn(async () => { if (!row) throw Object.assign(new Error("missing"), { code: 404 }); if (loseResponse) { loseResponse = false; throw new Error("response lost"); } return [row]; }), createWriteStream: vi.fn((options: { metadata: { metadata: Record<string, unknown> } }) => new Writable({ write(_chunk, _encoding, done): void { done(); }, final(done): void { row = { size: "5", contentType: "video/mp4", metadata: options.metadata.metadata }; done(); } })), delete: vi.fn() };
  const service = new UploadService({ bucket: () => ({ file: () => file }) } as unknown as Storage, "test", network);
  const metadata = { legacyVideoJobId: "job-one", legacyVideoAssetId: "asset-one" };
  await expect(service.uploadFromUrl("https://cdn.example.test/video", "owner", "generation", metadata)).rejects.toThrow("response lost");
  await expect(service.uploadFromUrl("https://cdn.example.test/video", "owner", "generation", metadata)).resolves.toMatchObject({ sizeBytes: 5 });
  expect(network.request).toHaveBeenCalledTimes(1); expect(file.createWriteStream).toHaveBeenCalledTimes(1); expect(file.delete).not.toHaveBeenCalled();
});
