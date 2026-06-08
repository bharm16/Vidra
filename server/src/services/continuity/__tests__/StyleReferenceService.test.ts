import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from "vitest";

let StyleReferenceService: typeof import("../StyleReferenceService").StyleReferenceService;
let STYLE_STRENGTH_PRESETS: typeof import("../StyleReferenceService").STYLE_STRENGTH_PRESETS;

const replicateRun = vi.fn();

vi.mock("replicate", () => ({
  default: vi.fn(() => ({
    run: replicateRun,
  })),
}));

beforeAll(async () => {
  process.env.GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME || "test-bucket";
  ({ StyleReferenceService, STYLE_STRENGTH_PRESETS } = await import(
    "../StyleReferenceService"
  ));
});

describe("StyleReferenceService", () => {
  const storage = {
    savePreviewImage: vi.fn().mockResolvedValue({
      viewUrl: "https://storage.example.com/keyframe.png",
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    replicateRun.mockResolvedValue([
      "https://replicate.example.com/output.png",
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from("image"),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a style reference from an image with correct aspect ratio", async () => {
    const service = new StyleReferenceService(storage as any, "token");
    const ref = await service.createFromImage("https://example.com/image.png", {
      width: 1920,
      height: 1080,
    });

    expect(ref.frameUrl).toBe("https://example.com/image.png");
    expect(ref.aspectRatio).toBe("16:9");
  });

  it("generates a styled keyframe and stores the result", async () => {
    const service = new StyleReferenceService(storage as any, "token");
    const url = await service.generateStyledKeyframe({
      userId: "user-1",
      prompt: "A cinematic portrait",
      styleReferenceUrl: "https://example.com/style.png",
      strength: STYLE_STRENGTH_PRESETS.balanced,
      aspectRatio: "16:9",
    });

    expect(replicateRun).toHaveBeenCalled();
    expect(storage.savePreviewImage).toHaveBeenCalled();
    expect(url).toBe("https://storage.example.com/keyframe.png");
  });

  it("throws when IP-Adapter returns no output", async () => {
    replicateRun.mockResolvedValueOnce([]);
    const service = new StyleReferenceService(storage as any, "token");

    await expect(
      service.generateStyledKeyframe({
        userId: "user-1",
        prompt: "Test prompt",
        styleReferenceUrl: "https://example.com/style.png",
        strength: STYLE_STRENGTH_PRESETS.balanced,
        aspectRatio: "16:9",
      }),
    ).rejects.toThrow("IP-Adapter returned no output");
  });
});
