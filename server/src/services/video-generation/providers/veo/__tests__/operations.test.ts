import { describe, expect, it, vi, beforeEach } from "vitest";
import { startVeoGeneration } from "../operations";
import type { VeoInlineData } from "../imageUtils";

const { veoFetchMock } = vi.hoisted(() => ({
  veoFetchMock: vi.fn(async () => ({ name: "operations/veo-123" })),
}));

vi.mock("../httpClient", () => ({
  veoFetch: veoFetchMock,
}));

const makeInline = (mimeType: string, data = "base64-data"): VeoInlineData => ({
  inlineData: { mimeType, data },
});

const readBody = () => {
  const call = veoFetchMock.mock.calls.at(-1) as unknown[] | undefined;
  if (!call) {
    throw new Error("veoFetch not called");
  }
  const init = (call[3] || {}) as { body?: string };
  return JSON.parse(init.body || "{}") as Record<string, unknown>;
};

describe("startVeoGeneration", () => {
  beforeEach(() => {
    veoFetchMock.mockClear();
  });

  it("builds text-only payload without parameters", async () => {
    await startVeoGeneration(
      "https://veo.example.com",
      "key",
      { prompt: "hello" },
      "veo-model",
    );

    expect(veoFetchMock).toHaveBeenCalledTimes(1);
    const body = readBody();
    expect(body).toEqual({ instances: [{ prompt: "hello" }] });
  });

  it("includes start image in instance payload", async () => {
    const startImage = makeInline("image/png", "start");

    await startVeoGeneration(
      "https://veo.example.com",
      "key",
      { prompt: "hello", startImage },
      "veo-model",
    );

    const body = readBody();
    expect((body.instances as Array<Record<string, unknown>>)[0]).toEqual({
      prompt: "hello",
      image: startImage,
    });
    expect(body.parameters).toBeUndefined();
  });

  it("includes reference images array in parameters", async () => {
    const ref1 = {
      image: makeInline("image/jpeg", "r1"),
      referenceType: "asset" as const,
    };
    const ref2 = {
      image: makeInline("image/webp", "r2"),
      referenceType: "style" as const,
    };

    await startVeoGeneration(
      "https://veo.example.com",
      "key",
      { prompt: "hello", referenceImages: [ref1, ref2] },
      "veo-model",
    );

    const body = readBody();
    expect(body.parameters).toEqual({
      referenceImages: [
        { image: ref1.image, referenceType: "asset" },
        { image: ref2.image, referenceType: "style" },
      ],
    });
  });

  it("includes extend video input in instance payload", async () => {
    const extendVideo = makeInline("video/mp4", "video-data");

    await startVeoGeneration(
      "https://veo.example.com",
      "key",
      { prompt: "hello", extendVideo },
      "veo-model",
    );

    const body = readBody();
    expect((body.instances as Array<Record<string, unknown>>)[0]).toEqual({
      prompt: "hello",
      video: extendVideo,
    });
  });

  it("maps config parameters correctly", async () => {
    await startVeoGeneration(
      "https://veo.example.com",
      "key",
      {
        prompt: "hello",
        parameters: {
          aspectRatio: "16:9",
          resolution: "1080p",
          durationSeconds: 8,
          seed: 123,
        },
      },
      "veo-model",
    );

    const body = readBody();
    expect(body.parameters).toEqual({
      aspectRatio: "16:9",
      resolution: "1080p",
      durationSeconds: 8,
      seed: 123,
    });
  });

  it("builds full combined payload", async () => {
    const startImage = makeInline("image/png", "start");
    const lastFrame = makeInline("image/png", "end");
    const extendVideo = makeInline("video/mp4", "video");
    const ref = {
      image: makeInline("image/png", "ref"),
      referenceType: "asset" as const,
    };

    await startVeoGeneration(
      "https://veo.example.com",
      "key",
      {
        prompt: "hello",
        startImage,
        lastFrame,
        referenceImages: [ref],
        extendVideo,
        parameters: {
          aspectRatio: "9:16",
          resolution: "4k",
          durationSeconds: 6,
          seed: 999,
          numberOfVideos: 1,
          personGeneration: "allow_adult",
        },
      },
      "veo-model",
    );

    const body = readBody();
    expect(body).toEqual({
      instances: [
        {
          prompt: "hello",
          image: startImage,
          video: extendVideo,
        },
      ],
      parameters: {
        lastFrame,
        referenceImages: [{ image: ref.image, referenceType: "asset" }],
        aspectRatio: "9:16",
        resolution: "4k",
        durationSeconds: 6,
        seed: 999,
        numberOfVideos: 1,
        personGeneration: "allow_adult",
      },
    });
  });
});
