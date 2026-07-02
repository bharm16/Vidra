import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBuildFirebaseAuthHeaders } = vi.hoisted(() => ({
  mockBuildFirebaseAuthHeaders: vi.fn(),
}));

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: mockBuildFirebaseAuthHeaders,
}));

vi.mock("@/config/api.config", () => ({
  API_CONFIG: {
    baseURL: "https://api.example.test",
  },
}));

import { referenceImageApi } from "../referenceImageApi";

const sampleImage = {
  id: "img-1",
  userId: "user-1",
  imageUrl: "https://cdn.example.test/image.png",
  thumbnailUrl: "https://cdn.example.test/thumb.png",
  storagePath: "users/u1/images/img-1.png",
  thumbnailPath: "users/u1/images/thumb-img-1.png",
  label: "Scene ref",
  metadata: {
    width: 1024,
    height: 768,
    sizeBytes: 1024,
    contentType: "image/png",
    source: "upload",
    originalName: "image.png",
  },
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("referenceImageApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildFirebaseAuthHeaders.mockResolvedValue({
      Authorization: "Bearer firebase-token",
      "X-Client": "test-client",
    });
  });

  it("list sends auth headers, applies limit query, and parses schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { images: [sampleImage] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await referenceImageApi.list(15);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/reference-images?limit=15",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer firebase-token");
    expect(headers.get("X-Client")).toBe("test-client");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(result).toEqual([sampleImage]);
  });

  it("list throws on invalid response schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ unexpected: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(referenceImageApi.list()).rejects.toThrow(
      "Invalid reference image list response",
    );
  });

  it("upload sends form-data body without forcing JSON content-type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: sampleImage }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["binary"], "sample.png", { type: "image/png" });
    const result = await referenceImageApi.upload(file, {
      label: "Hero",
      source: "upload",
    });

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);

    const headers = new Headers(options.headers);
    expect(headers.get("Authorization")).toBe("Bearer firebase-token");
    expect(headers.get("Content-Type")).toBeNull();
    expect(result.id).toBe("img-1");
  });

  it("uploadFromUrl sends JSON body and returns parsed image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: sampleImage }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await referenceImageApi.uploadFromUrl("https://remote.example/ref.jpg", {
      label: "Imported",
      source: "url",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/reference-images/from-url",
      expect.objectContaining({ method: "POST" }),
    );

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(options.body).toBe(
      JSON.stringify({
        sourceUrl: "https://remote.example/ref.jpg",
        label: "Imported",
        source: "url",
      }),
    );
    const headers = new Headers(options.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("delete encodes image id and tolerates 204 responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      referenceImageApi.delete("id with spaces"),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/reference-images/id%20with%20spaces",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("transforms API error payload into thrown Error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Upload denied" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const file = new File(["x"], "denied.png", { type: "image/png" });
    await expect(referenceImageApi.upload(file)).rejects.toThrow(
      "Upload denied",
    );
  });
});
