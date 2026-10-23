import { Readable } from "node:stream";
import { expect, it, vi } from "vitest";
import { controlledNetwork } from "@services/owned-media/__tests__/controlledNetwork";
import { fetchAsVeoInline, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "../imageUtils";

it("rejects an oversized declared image before allocating its complete body", async () => {
  const arrayBuffer = vi.fn(async (): Promise<ArrayBuffer> => { throw new Error("The complete remote body was allocated"); });
  let read = false;
  const body = Object.assign(Readable.from((function* (): Generator<Buffer> { read = true; yield Buffer.from("image"); })()), { arrayBuffer });
  const network = controlledNetwork(() => ({ headers: { "content-type": "image/png", "content-length": String(MAX_IMAGE_BYTES + 1) }, body }));
  await expect(fetchAsVeoInline("https://cdn.example.test/image", "image", network)).rejects.toThrow(/maximum size|exceeds/);
  expect(arrayBuffer).not.toHaveBeenCalled();
  expect(read).toBe(false);
  expect(body.destroyed).toBe(true);
});

it.each(["image", "video"] as const)("stops a chunked %s at its purpose limit while bytes are still arriving", async kind => {
  const limit = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  const chunk = Buffer.alloc(1024 * 1024);
  let sent = 0;
  const body = Readable.from((function* (): Generator<Buffer> { for (let index = 0; index < 100; index += 1) { sent += chunk.length; yield chunk; } })(), { highWaterMark: 1 });
  const network = controlledNetwork(() => ({ headers: { "content-type": kind === "image" ? "image/jpeg" : "video/mp4" }, body }));
  await expect(fetchAsVeoInline("https://cdn.example.test/media", kind, network)).rejects.toThrow("maximum size");
  expect(sent).toBeLessThanOrEqual(limit + 2 * chunk.length);
  expect(body.destroyed).toBe(true);
});
