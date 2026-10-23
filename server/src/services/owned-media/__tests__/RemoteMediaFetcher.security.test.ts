import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRemoteMedia, openRemoteMedia } from "../RemoteMediaFetcher";
import { controlledNetwork } from "./controlledNetwork";
import { apiKeyUid } from "@utils/apiKeyUser";

const imageOptions = { fieldName: "sourceUrl", sourceUrl: "https://cdn.example.test/image", allowedContentTypes: ["image/png"], maxBytes: 4 };
afterEach(() => vi.useRealTimers());

describe("remote media ingestion", () => {
  it("rejects a private redirect target before opening a second connection and cancels its body", async () => {
    const body = Readable.from([Buffer.from("redirect")]);
    const network = controlledNetwork(() => ({ status: 302, headers: { location: "http://127.0.0.1/private" }, body }));
    await expect(fetchRemoteMedia(imageOptions, network)).rejects.toThrow(/sourceUrl/);
    expect(network.request).toHaveBeenCalledOnce();
    expect(body.destroyed).toBe(true);
  });

  it("revalidates redirect DNS rather than trusting the first public destination", async () => {
    const network = controlledNetwork(() => ({ status: 302, headers: { location: "https://internal.example.test/private" } }));
    network.resolve.mockImplementation(async hostname => [{ address: hostname === "internal.example.test" ? "10.0.0.1" : "93.184.216.34", family: 4 }]);
    await expect(fetchRemoteMedia(imageOptions, network)).rejects.toThrow("public host");
    expect(network.resolve).toHaveBeenCalledTimes(2);
    expect(network.request).toHaveBeenCalledOnce();
  });

  it.each([
    "https://storage.googleapis.com/bucket/users/api-key:retired-key-fixture/image.png",
    "https://firebasestorage.googleapis.com/v0/b/bucket/o/users%2Fapi-key%3Aretired-key-fixture%2Fimage.png",
    "https://firebasestorage.googleapis.com/v0/b/bucket/o/users%252Fapi-key%253Aretired-key-fixture%252Fimage.png",
  ])("refuses legacy credential-bearing input %s before DNS or new provenance", async sourceUrl => {
    const network = controlledNetwork(() => ({}));
    await expect(fetchRemoteMedia({ ...imageOptions, sourceUrl }, network)).rejects.toThrow("This media is unavailable");
    expect(network.resolve).not.toHaveBeenCalled();
    expect(network.request).not.toHaveBeenCalled();
    const body = Readable.from([]);
    const redirected = controlledNetwork(() => ({ status: 302, headers: { location: sourceUrl }, body }));
    await expect(fetchRemoteMedia(imageOptions, redirected)).rejects.toThrow("This media is unavailable");
    expect(redirected.request).toHaveBeenCalledOnce();
    expect(body.destroyed).toBe(true);
  });

  it("retains legitimate signed URLs under a nonsecret API-key principal", async () => {
    const sourceUrl = `https://storage.googleapis.com/bucket/users/${apiKeyUid("principal-test-fixture")}/image.png?X-Goog-Signature=fixture`;
    const result = await fetchRemoteMedia({ ...imageOptions, sourceUrl }, controlledNetwork(() => ({ body: Readable.from([Buffer.from("1234")]) })));
    expect(result.sourceUrl).toBe(sourceUrl);
    expect(result.buffer.toString()).toBe("1234");
  });

  it("follows a relative public redirect, retains HTTP semantics, and returns the final source URL", async () => {
    const network = controlledNetwork(url => url.pathname === "/image"
      ? { status: 307, headers: { location: "http://public.example.test/final?signature=fixture" } }
      : { body: Readable.from([Buffer.from("1234")]), headers: { "content-type": "IMAGE/PNG; charset=binary", "content-length": "4" } });
    await expect(fetchRemoteMedia(imageOptions, network)).resolves.toEqual({ buffer: Buffer.from("1234"), contentType: "image/png", sourceUrl: "http://public.example.test/final?signature=fixture" });
    expect(network.request.mock.calls.map(([url]) => url.protocol)).toEqual(["https:", "http:"]);
  });

  it("bounds redirect count and refuses missing redirect destinations", async () => {
    const loop = controlledNetwork(() => ({ status: 302, headers: { location: "/again" } }));
    await expect(fetchRemoteMedia(imageOptions, loop)).rejects.toThrow("redirect limit");
    expect(loop.request).toHaveBeenCalledTimes(4);
    await expect(fetchRemoteMedia(imageOptions, controlledNetwork(() => ({ status: 302, headers: {} })))).rejects.toThrow("missing a location");
  });

  it("rejects disallowed MIME and declared oversize without consuming the body", async () => {
    for (const headers of [{ "content-type": "text/plain" }, { "content-type": "image/png", "content-length": "5" }]) {
      let read = false;
      const body = Readable.from((function* (): Generator<Buffer> { read = true; yield Buffer.from("data"); })());
      await expect(fetchRemoteMedia(imageOptions, controlledNetwork(() => ({ headers, body })))).rejects.toThrow(/content type|maximum size/);
      expect(read).toBe(false);
      expect(body.destroyed).toBe(true);
    }
  });

  it.each([{}, { "content-length": "1" }])("counts actual bytes for missing/lying length %j and cancels the source", async extra => {
    const body = Readable.from([Buffer.from("123"), Buffer.from("45"), Buffer.from("more")]);
    await expect(fetchRemoteMedia(imageOptions, controlledNetwork(() => ({ headers: { "content-type": "image/png", ...extra }, body })))).rejects.toThrow("maximum size");
    expect(body.destroyed).toBe(true);
  });

  it("bounds decompressed bytes rather than trusting a small compressed Content-Length", async () => {
    const compressed = gzipSync(Buffer.alloc(1024));
    const network = controlledNetwork(() => ({ headers: { "content-type": "image/png", "content-encoding": "gzip", "content-length": String(compressed.length) }, body: Readable.from([compressed]) }));
    await expect(fetchRemoteMedia({ ...imageOptions, maxBytes: 128 }, network)).rejects.toThrow("maximum size");
  });

  it("cancels failed status bodies before returning their error", async () => {
    const body = Readable.from([Buffer.from("private error")]);
    await expect(fetchRemoteMedia(imageOptions, controlledNetwork(() => ({ status: 404, statusText: "Not Found", body })))).rejects.toThrow("404 Not Found");
    expect(body.destroyed).toBe(true);
  });

  it("keeps the deadline active through DNS, response headers and a stalled response body", async () => {
    vi.useFakeTimers();
    for (const phase of ["dns", "headers", "body"]) {
      const body = new Readable({ read(): void {} });
      const network = controlledNetwork(() => phase === "headers" ? new Promise(() => undefined) : { body });
      if (phase === "dns") network.resolve.mockImplementation(() => new Promise(() => undefined));
      const rejected = expect(fetchRemoteMedia({ ...imageOptions, timeoutMs: 25 }, network)).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(26);
      await rejected;
      if (phase === "dns") expect(network.request).not.toHaveBeenCalled();
      if (phase === "body") expect(body.destroyed).toBe(true);
    }
  });

  it("honors caller cancellation and closes an unconsumed stream", async () => {
    const body = new Readable({ read(): void {} });
    const controller = new AbortController();
    const remote = await openRemoteMedia({ ...imageOptions, signal: controller.signal }, controlledNetwork(() => ({ body })));
    const rejected = expect((async () => { for await (const _chunk of remote.stream) { /* consume */ } })()).rejects.toThrow("Cancelled");
    controller.abort(new Error("Cancelled"));
    await rejected;
    expect(body.destroyed).toBe(true);
    const unopenedBody = new Readable({ read(): void {} });
    const unopened = await openRemoteMedia(imageOptions, controlledNetwork(() => ({ body: unopenedBody })));
    unopened.cancel();
    expect(unopenedBody.destroyed).toBe(true);
  });
});
