import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMediaReferenceViewHandler } from "../mediaReferenceView";

const buildResponse = () => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
};

describe("media reference view handler", () => {
  const getOwnedMediaViewUrl = vi.fn();
  const handler = createMediaReferenceViewHandler({
    imageGenerationService: null,
    videoGenerationService: null,
    videoJobStore: null,
    storageService: {
      getOwnedMediaViewUrl,
    },
  } as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before resolving an owned-media reference", async () => {
    const response = buildResponse();

    await handler(
      {
        query: { ref: "om1.preview-image.preview.webp", kind: "image" },
      } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(getOwnedMediaViewUrl).not.toHaveBeenCalled();
  });

  it("binds an opaque reference to the authenticated owner", async () => {
    getOwnedMediaViewUrl.mockResolvedValue({
      viewUrl: "https://storage.example.test/view",
      expiresAt: "2026-08-10T00:00:00.000Z",
      mediaRef: "om1.preview-image.preview.webp",
    });
    const response = buildResponse();

    await handler(
      {
        user: { uid: "current-user" },
        query: { ref: "om1.preview-image.preview.webp", kind: "image" },
      } as never,
      response as never,
    );

    expect(getOwnedMediaViewUrl).toHaveBeenCalledWith(
      "current-user",
      "om1.preview-image.preview.webp",
    );
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: {
        viewUrl: "https://storage.example.test/view",
        expiresAt: "2026-08-10T00:00:00.000Z",
        mediaRef: "om1.preview-image.preview.webp",
        source: "owned",
      },
    });
  });
});
