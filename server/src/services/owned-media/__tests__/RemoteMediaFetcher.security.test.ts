import { describe, expect, it, vi } from "vitest";
import { fetchRemoteMedia } from "../RemoteMediaFetcher";

const imageOptions = {
  fieldName: "sourceUrl",
  allowedContentTypes: ["image/png"] as const,
  maxBytes: 4,
};

describe("fetchRemoteMedia", () => {
  it("rejects a private redirect target before fetching it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRemoteMedia({
        ...imageOptions,
        sourceUrl: "https://cdn.example.test/image.png",
      }),
    ).rejects.toThrow(/sourceUrl/);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects a response whose MIME type is outside the purpose allowlist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not an image", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );

    await expect(
      fetchRemoteMedia({
        ...imageOptions,
        sourceUrl: "https://cdn.example.test/file.txt",
      }),
    ).rejects.toThrow("Invalid remote media content type");
  });

  it("enforces the byte limit even when Content-Length is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3, 4, 5]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      ),
    );

    await expect(
      fetchRemoteMedia({
        ...imageOptions,
        sourceUrl: "https://cdn.example.test/large.png",
      }),
    ).rejects.toThrow("Remote media exceeds maximum size");
  });

  it("returns the validated final URL and bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "image/png", "content-length": "4" },
        }),
      ),
    );

    await expect(
      fetchRemoteMedia({
        ...imageOptions,
        sourceUrl: "https://cdn.example.test/image.png",
      }),
    ).resolves.toEqual({
      buffer: Buffer.from([1, 2, 3, 4]),
      contentType: "image/png",
      sourceUrl: "https://cdn.example.test/image.png",
    });
  });
});
