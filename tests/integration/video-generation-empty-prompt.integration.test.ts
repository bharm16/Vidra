import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateKlingVideo } from "@services/video-generation/providers/klingProvider";
import {
  buildReplicateInput,
  generateReplicateVideo,
} from "@services/video-generation/providers/replicateProvider";
import { generateSoraVideo } from "@services/video-generation/providers/soraProvider";
import { generateLumaVideo } from "@services/video-generation/providers/lumaProvider";
import { generateVeoVideo } from "@services/video-generation/providers/veoProvider";
import type {
  KlingModelId,
  SoraModelId,
  VideoModelId,
} from "@services/video-generation/types";
import type {
  StoredVideoAsset,
  VideoAssetStore,
} from "@services/video-generation/storage";

// ----------------------------------------------------------------------------
// Phase 6 (i2v pipeline simplification) — per-provider empty-prompt support
//
// These tests assert that, when an I2V request flows through each provider's
// adapter with prompt="" and a non-empty startImage, the outbound payload is
// shaped per the per-provider policy:
//
//   • Native-empty providers (Wan, Veo, Sora, Luma): prompt is forwarded as-is
//   • Substituting providers (Kling, Runway): the empty prompt is replaced with
//     a deterministic placeholder ("natural motion" / "subtle ambient motion")
//
// The substitution happens inside the adapter — never at the route layer.
// ----------------------------------------------------------------------------

const KLING_EMPTY_PROMPT_SUBSTITUTE = "natural motion";
const RUNWAY_EMPTY_PROMPT_SUBSTITUTE = "subtle ambient motion";

const STORED_ASSET: StoredVideoAsset = {
  id: "asset-1",
  url: "https://cdn.example.com/video.mp4",
  contentType: "video/mp4",
  createdAt: 0,
};

const makeAssetStore = (): VideoAssetStore =>
  ({
    storeFromBuffer: vi.fn().mockResolvedValue(STORED_ASSET),
    storeFromStream: vi.fn().mockResolvedValue(STORED_ASSET),
    getStream: vi.fn(),
    getPublicUrl: vi.fn(),
    cleanupExpired: vi.fn(),
  }) as unknown as VideoAssetStore;

const makeKlingResponse = (payload: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
});

// ----------------------------------------------------------------------------
// Kling — substitutes "natural motion" for empty prompts (i2v + t2v)
// ----------------------------------------------------------------------------

describe("Kling adapter empty-prompt handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("substitutes 'natural motion' when prompt is empty for i2v", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeKlingResponse({
          code: 0,
          data: { task_id: "task-empty", task_status: "submitted" },
        }),
      )
      .mockResolvedValueOnce(
        makeKlingResponse({
          code: 0,
          data: {
            task_id: "task-empty",
            task_status: "succeed",
            task_result: {
              videos: [{ id: "video-1", url: "https://example.com/empty.mp4" }],
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const log = { info: vi.fn(), warn: vi.fn() };
    await generateKlingVideo(
      "api-key",
      "https://api.klingai.com",
      "",
      "kling-v2-1-master" as KlingModelId,
      { startImage: "https://images.example.com/start.png" },
      log,
    );

    const postInit = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(postInit.body || "{}") as Record<string, unknown>;
    expect(body.prompt).toBe(KLING_EMPTY_PROMPT_SUBSTITUTE);
    expect(body.image).toBe("https://images.example.com/start.png");
  });

  it("substitutes 'natural motion' when prompt is whitespace-only for i2v", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeKlingResponse({
          code: 0,
          data: { task_id: "task-ws", task_status: "submitted" },
        }),
      )
      .mockResolvedValueOnce(
        makeKlingResponse({
          code: 0,
          data: {
            task_id: "task-ws",
            task_status: "succeed",
            task_result: {
              videos: [{ id: "v-ws", url: "https://example.com/ws.mp4" }],
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const log = { info: vi.fn(), warn: vi.fn() };
    await generateKlingVideo(
      "api-key",
      "https://api.klingai.com",
      "   \t\n  ",
      "kling-v2-1-master" as KlingModelId,
      { startImage: "https://images.example.com/start.png" },
      log,
    );

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body?: string }).body || "{}",
    ) as Record<string, unknown>;
    expect(body.prompt).toBe(KLING_EMPTY_PROMPT_SUBSTITUTE);
  });

  it("forwards a non-empty prompt unchanged for i2v", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeKlingResponse({
          code: 0,
          data: { task_id: "task-non-empty", task_status: "submitted" },
        }),
      )
      .mockResolvedValueOnce(
        makeKlingResponse({
          code: 0,
          data: {
            task_id: "task-non-empty",
            task_status: "succeed",
            task_result: {
              videos: [{ id: "v", url: "https://example.com/ok.mp4" }],
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const log = { info: vi.fn(), warn: vi.fn() };
    await generateKlingVideo(
      "api-key",
      "https://api.klingai.com",
      "a cat looking at the camera",
      "kling-v2-1-master" as KlingModelId,
      { startImage: "https://images.example.com/start.png" },
      log,
    );

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body?: string }).body || "{}",
    ) as Record<string, unknown>;
    expect(body.prompt).toBe("a cat looking at the camera");
  });

  it("substitutes the placeholder for empty prompts on t2v as well", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeKlingResponse({
          code: 0,
          data: { task_id: "task-t2v", task_status: "submitted" },
        }),
      )
      .mockResolvedValueOnce(
        makeKlingResponse({
          code: 0,
          data: {
            task_id: "task-t2v",
            task_status: "succeed",
            task_result: {
              videos: [{ id: "v", url: "https://example.com/t2v.mp4" }],
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const log = { info: vi.fn(), warn: vi.fn() };
    await generateKlingVideo(
      "api-key",
      "https://api.klingai.com",
      "",
      "kling-v2-1-master" as KlingModelId,
      {},
      log,
    );

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body?: string }).body || "{}",
    ) as Record<string, unknown>;
    expect(body.prompt).toBe(KLING_EMPTY_PROMPT_SUBSTITUTE);
  });
});

// ----------------------------------------------------------------------------
// Replicate (Wan + non-Wan/Runway-style) — Wan native, non-Wan substitutes
// ----------------------------------------------------------------------------

describe("Replicate adapter empty-prompt handling", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("forwards an empty prompt unchanged for Wan models (native empty support)", () => {
    const input = buildReplicateInput(
      "wan-video/wan-2.2-t2v-fast" as VideoModelId,
      "",
      { startImage: "https://images.example.com/start.png" },
    );
    expect(input.prompt).toBe("");
  });

  it("forwards a whitespace prompt unchanged for Wan 2.5 models", () => {
    const input = buildReplicateInput(
      "wan-video/wan-2.5-i2v" as VideoModelId,
      "   ",
      { startImage: "https://images.example.com/start.png" },
    );
    expect(input.prompt).toBe("   ");
  });

  it("substitutes 'subtle ambient motion' for empty prompts on non-Wan (Runway-style) models", () => {
    // Non-Wan branch covers Runway-style adapters routed through Replicate
    // ("genmo/mochi-1-final", "minimax/video-02", and any future runway-gen45
    // generation adapter once wired).
    const input = buildReplicateInput(
      "genmo/mochi-1-final" as VideoModelId,
      "",
      {
        startImage: "https://images.example.com/start.png",
      },
    );
    expect(input.prompt).toBe(RUNWAY_EMPTY_PROMPT_SUBSTITUTE);
  });

  it("substitutes for whitespace-only prompts on non-Wan models", () => {
    const input = buildReplicateInput(
      "minimax/video-02" as VideoModelId,
      "   \n",
      { startImage: "https://images.example.com/start.png" },
    );
    expect(input.prompt).toBe(RUNWAY_EMPTY_PROMPT_SUBSTITUTE);
  });

  it("forwards a non-empty prompt unchanged on non-Wan models", () => {
    const input = buildReplicateInput(
      "genmo/mochi-1-final" as VideoModelId,
      "a horse running",
      { startImage: "https://images.example.com/start.png" },
    );
    expect(input.prompt).toBe("a horse running");
  });

  it("end-to-end: generateReplicateVideo carries the substituted prompt to replicate.run for Runway-style models", async () => {
    const run = vi.fn().mockResolvedValue("https://example.com/video.mp4");
    const replicate = { run } as unknown as import("replicate").default;
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await generateReplicateVideo(
      replicate,
      "",
      "minimax/video-02" as VideoModelId,
      { startImage: "https://images.example.com/start.png" },
      log,
    );

    const input = (run.mock.calls[0]?.[1] as { input: Record<string, unknown> })
      .input;
    expect(input.prompt).toBe(RUNWAY_EMPTY_PROMPT_SUBSTITUTE);
  });

  it("end-to-end: generateReplicateVideo forwards empty prompt unchanged for Wan i2v", async () => {
    const run = vi.fn().mockResolvedValue("https://example.com/video.mp4");
    const replicate = { run } as unknown as import("replicate").default;
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await generateReplicateVideo(
      replicate,
      "",
      "wan-video/wan-2.2-i2v-fast" as VideoModelId,
      { startImage: "https://images.example.com/start.png" },
      log,
    );

    const input = (run.mock.calls[0]?.[1] as { input: Record<string, unknown> })
      .input;
    expect(input.prompt).toBe("");
  });
});

// ----------------------------------------------------------------------------
// Sora (OpenAI) — native empty support
// ----------------------------------------------------------------------------

describe("Sora adapter empty-prompt handling", () => {
  it("forwards an empty prompt unchanged to openai.videos.create", async () => {
    // buildSoraInputReference reads the fetched body with `arrayBuffer()` and
    // feeds it to sharp, so the stub needs that method and genuinely decodable
    // bytes — a bare header would fail inside resize() instead. This is a real
    // 1x1 PNG.
    const ONE_PIXEL_PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+Q5dbWQAAAABJRU5ErkJggg==",
      "base64",
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () =>
        ONE_PIXEL_PNG.buffer.slice(
          ONE_PIXEL_PNG.byteOffset,
          ONE_PIXEL_PNG.byteOffset + ONE_PIXEL_PNG.byteLength,
        ),
    });
    vi.stubGlobal("fetch", fetchMock);

    const create = vi.fn().mockResolvedValue({
      id: "video-1",
      status: "completed",
    });
    const retrieve = vi.fn();
    const downloadContent = vi.fn().mockResolvedValue({
      headers: { get: () => "video/mp4" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      }),
    });
    const openai = {
      videos: { create, retrieve, downloadContent },
    } as unknown as import("openai").default;

    const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    await generateSoraVideo(
      openai,
      "",
      "sora-2" as SoraModelId,
      { startImage: "https://images.example.com/start.png" },
      makeAssetStore(),
      log,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "" }),
    );

    vi.unstubAllGlobals();
  });
});

// ----------------------------------------------------------------------------
// Luma — native empty support
// ----------------------------------------------------------------------------

describe("Luma adapter empty-prompt handling", () => {
  it("forwards an empty prompt unchanged to luma.generations.create", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "gen-1",
      state: "completed",
      assets: { video: "https://example.com/luma.mp4" },
    });
    const get = vi.fn();
    const luma = {
      generations: { create, get },
    } as unknown as import("lumaai").LumaAI;

    const log = { info: vi.fn() };
    await generateLumaVideo(
      luma,
      "",
      { startImage: "https://images.example.com/start.png" },
      log,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "" }),
    );
  });
});

// ----------------------------------------------------------------------------
// Veo — native empty support
// ----------------------------------------------------------------------------

const veoMocks = vi.hoisted(() => ({
  fetchAsVeoInline: vi.fn(),
  startVeoGeneration: vi.fn(),
  waitForVeoOperation: vi.fn(),
  extractVeoVideoUri: vi.fn(),
  downloadVeoVideoStream: vi.fn(),
}));

vi.mock("@services/video-generation/providers/veo/imageUtils", () => ({
  fetchAsVeoInline: veoMocks.fetchAsVeoInline,
}));

vi.mock("@services/video-generation/providers/veo/operations", () => ({
  startVeoGeneration: veoMocks.startVeoGeneration,
  waitForVeoOperation: veoMocks.waitForVeoOperation,
  extractVeoVideoUri: veoMocks.extractVeoVideoUri,
}));

vi.mock("@services/video-generation/providers/veo/download", () => ({
  downloadVeoVideoStream: veoMocks.downloadVeoVideoStream,
}));

describe("Veo adapter empty-prompt handling", () => {
  beforeEach(() => {
    veoMocks.fetchAsVeoInline.mockReset();
    veoMocks.startVeoGeneration.mockReset();
    veoMocks.waitForVeoOperation.mockReset();
    veoMocks.extractVeoVideoUri.mockReset();
    veoMocks.downloadVeoVideoStream.mockReset();

    veoMocks.fetchAsVeoInline.mockResolvedValue({
      inlineData: { mimeType: "image/png", data: "BASE64" },
    });
    veoMocks.startVeoGeneration.mockResolvedValue("operations/veo-1");
    veoMocks.waitForVeoOperation.mockResolvedValue({
      response: { id: "response-1" },
    });
    veoMocks.extractVeoVideoUri.mockReturnValue(
      "https://storage.example.com/video.mp4",
    );
    veoMocks.downloadVeoVideoStream.mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      }),
      contentType: "video/mp4",
    });
  });

  it("forwards an empty prompt unchanged to startVeoGeneration", async () => {
    await generateVeoVideo(
      "api-key",
      "https://veo.example.com",
      "",
      { startImage: "https://images.example.com/start.png" },
      makeAssetStore(),
      { info: vi.fn() },
    );

    const input = veoMocks.startVeoGeneration.mock.calls[0]?.[2] as {
      prompt: string;
    };
    expect(input.prompt).toBe("");
  });
});
