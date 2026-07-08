import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from "vitest";
import { ReplicateFluxKontextFastProvider } from "../ReplicateFluxKontextFastProvider";
import type { ImagePreviewRequest } from "../types";

type PredictionStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

type ReplicatePrediction = {
  id: string;
  status: PredictionStatus;
  output: string | string[] | null | undefined;
  error?: string | null;
  logs?: string | null;
};

type CreatePredictionRequest = {
  model: string;
  input: {
    prompt: string;
    aspect_ratio: string;
    output_format: string;
    output_quality: number;
    speed_mode?: string;
    seed?: number;
    img_cond_path?: string;
  };
};

let createPredictionMock: MockedFunction<
  (params: CreatePredictionRequest) => Promise<ReplicatePrediction>
>;
let getPredictionMock: MockedFunction<
  (id: string) => Promise<ReplicatePrediction>
>;
let replicateInstance: {
  predictions: {
    create: typeof createPredictionMock;
    get: typeof getPredictionMock;
  };
};

vi.mock("replicate", () => ({
  default: vi.fn(() => replicateInstance),
}));

describe("ReplicateFluxKontextFastProvider", () => {
  beforeEach(() => {
    createPredictionMock = vi.fn();
    getPredictionMock = vi.fn();
    replicateInstance = {
      predictions: {
        create: createPredictionMock,
        get: getPredictionMock,
      },
    };
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("throws when the provider is not configured", async () => {
      const previousToken = process.env.REPLICATE_API_TOKEN;
      delete process.env.REPLICATE_API_TOKEN;
      const provider = new ReplicateFluxKontextFastProvider({});

      const request: ImagePreviewRequest = {
        prompt: "test",
        userId: "user-1",
        inputImageUrl: "https://images.example.com/base.webp",
      };

      await expect(provider.generatePreview(request)).rejects.toThrow(
        "Replicate provider is not configured. REPLICATE_API_TOKEN is required.",
      );

      if (previousToken) {
        process.env.REPLICATE_API_TOKEN = previousToken;
      }
    });

    it("rejects requests without inputImageUrl", async () => {
      const provider = new ReplicateFluxKontextFastProvider({
        apiToken: "token",
      });
      const request: ImagePreviewRequest = {
        prompt: "valid prompt",
        userId: "user-1",
      };

      await expect(provider.generatePreview(request)).rejects.toMatchObject({
        message: expect.stringContaining("requires inputImageUrl"),
        statusCode: 400,
      });
    });

    it("maps rate limit errors to status 429 with parsed detail", async () => {
      const provider = new ReplicateFluxKontextFastProvider({
        apiToken: "token",
      });
      const sleepSpy = vi
        .spyOn(provider as any, "sleep")
        .mockResolvedValue(undefined);
      createPredictionMock.mockRejectedValue(
        new Error('429 {"detail": "Slow down", "retry_after": 0}'),
      );

      const request: ImagePreviewRequest = {
        prompt: "valid prompt",
        userId: "user-1",
        inputImageUrl: "https://images.example.com/base.webp",
      };

      await expect(provider.generatePreview(request)).rejects.toMatchObject({
        message: "Slow down",
        statusCode: 429,
      });
      expect(sleepSpy).toHaveBeenCalled();
    });

    it("throws when Replicate returns an invalid output payload", async () => {
      const provider = new ReplicateFluxKontextFastProvider({
        apiToken: "token",
      });
      createPredictionMock.mockResolvedValueOnce({
        id: "pred-1",
        status: "succeeded",
        output: ["not-a-valid-url"],
      });

      const request: ImagePreviewRequest = {
        prompt: "valid prompt",
        userId: "user-1",
        inputImageUrl: "https://images.example.com/base.webp",
      };

      await expect(provider.generatePreview(request)).rejects.toThrow(
        "Invalid response from Replicate API: no image URL returned.",
      );
    });
  });

  describe("edge cases", () => {
    it("defaults aspect ratio to match_input_image when an input image is provided", async () => {
      const provider = new ReplicateFluxKontextFastProvider({
        apiToken: "token",
      });
      createPredictionMock.mockResolvedValueOnce({
        id: "pred-1",
        status: "succeeded",
        output: "https://images.example.com/output.webp",
      });

      const request: ImagePreviewRequest = {
        prompt: "valid prompt",
        userId: "user-1",
        inputImageUrl: "https://images.example.com/base.webp",
      };

      await provider.generatePreview(request);

      const call = createPredictionMock.mock
        .calls[0]?.[0] as CreatePredictionRequest;
      expect(call.input.aspect_ratio).toBe("match_input_image");
    });

    it("normalizes output quality and seeds before sending to Replicate", async () => {
      const provider = new ReplicateFluxKontextFastProvider({
        apiToken: "token",
      });
      createPredictionMock.mockResolvedValueOnce({
        id: "pred-1",
        status: "succeeded",
        output: "https://images.example.com/output.webp",
      });

      const request: ImagePreviewRequest = {
        prompt: "valid prompt",
        userId: "user-1",
        inputImageUrl: "https://images.example.com/base.webp",
        outputQuality: 150,
        seed: 42.7,
      };

      await provider.generatePreview(request);

      const call = createPredictionMock.mock
        .calls[0]?.[0] as CreatePredictionRequest;
      expect(call.input.output_quality).toBe(100);
      expect(call.input.seed).toBe(43);
    });

    it("retries create prediction on rate limits before succeeding", async () => {
      const provider = new ReplicateFluxKontextFastProvider({
        apiToken: "token",
      });
      const sleepSpy = vi
        .spyOn(provider as any, "sleep")
        .mockResolvedValue(undefined);

      createPredictionMock
        .mockRejectedValueOnce(new Error('429 {"retry_after": 1}'))
        .mockResolvedValueOnce({
          id: "pred-2",
          status: "succeeded",
          output: "https://images.example.com/output.webp",
        });

      const result = await (provider as any).createPrediction(
        {
          prompt: "prompt",
          aspect_ratio: "1:1",
          output_format: "webp",
          output_quality: 80,
        },
        "user-1",
      );

      expect(result.id).toBe("pred-2");
      expect(createPredictionMock).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenCalledWith(1000);
    });
  });

  describe("core behavior", () => {
    it("uses speed mode mapping and chaining input images in requests", async () => {
      const provider = new ReplicateFluxKontextFastProvider({
        apiToken: "token",
      });
      createPredictionMock.mockResolvedValueOnce({
        id: "pred-1",
        status: "succeeded",
        output: "https://images.example.com/output.webp",
      });

      const request: ImagePreviewRequest = {
        prompt: "valid prompt",
        userId: "user-1",
        inputImageUrl: " https://images.example.com/base.webp ",
        speedMode: "Extra Juiced",
      };

      const result = await provider.generatePreview(request);

      const call = createPredictionMock.mock
        .calls[0]?.[0] as CreatePredictionRequest;
      expect(call.input.speed_mode).toBe(
        "Extra Juiced \ud83d\udd25 (more speed)",
      );
      expect(call.input.img_cond_path).toBe(
        "https://images.example.com/base.webp",
      );
      expect(result.imageUrl).toBe("https://images.example.com/output.webp");
      expect(result.model).toBe("prunaai/flux-kontext-fast");
    });
  });

  describe("prompt truth (ADR-0010)", () => {
    it("sends a video-shaped prompt to the model verbatim with no transformer wired", async () => {
      const provider = new ReplicateFluxKontextFastProvider({
        apiToken: "token",
      });
      createPredictionMock.mockResolvedValueOnce({
        id: "pred-1",
        status: "succeeded",
        output: "https://images.example.com/output.webp",
      });

      const videoShapedPrompt = "A runner at dawn, camera pans left, 6 seconds";
      await provider.generatePreview({
        prompt: videoShapedPrompt,
        userId: "user-1",
        inputImageUrl: "https://images.example.com/base.webp",
      });

      const call = createPredictionMock.mock
        .calls[0]?.[0] as CreatePredictionRequest;
      expect(call.input.prompt).toBe(videoShapedPrompt);
    });
  });
});
