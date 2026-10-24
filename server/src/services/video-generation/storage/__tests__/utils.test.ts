import { expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { controlledNetwork } from "@services/owned-media/__tests__/controlledNetwork";
import { toNodeReadableStream, storeVideoFromUrl } from "../utils";

it("rejects an empty response body", () => { expect(() => toNodeReadableStream(null)).toThrow("Response body is empty"); });
it("stores the bounded provider stream with its declared video type", async () => {
  const network = controlledNetwork(() => ({ headers: { "content-type": "video/webm" }, body: Readable.from([Buffer.from([1, 2, 3])]) }));
  const storeFromStream = vi.fn(async (stream: NodeJS.ReadableStream, contentType: string) => {
    const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 3])); expect(contentType).toBe("video/webm");
    return { id: "asset-1", url: "https://storage/asset-1.webm", contentType, createdAt: 1 };
  });
  expect((await storeVideoFromUrl({ storeFromStream } as never, "https://provider.test/video", undefined, undefined, network)).id).toBe("asset-1");
});
it("refuses private redirects, untyped responses and oversized videos before storing", async () => {
  const storeFromStream = vi.fn();
  for (const reply of [{ status: 302, headers: { location: "http://127.0.0.1/private" } }, { headers: {} }, { headers: { "content-type": "video/mp4", "content-length": String(500 * 1024 * 1024 + 1) } }]) {
    await expect(storeVideoFromUrl({ storeFromStream } as never, "https://provider.test/video", undefined, undefined, controlledNetwork(() => reply))).rejects.toThrow();
  }
  expect(storeFromStream).not.toHaveBeenCalled();
});
