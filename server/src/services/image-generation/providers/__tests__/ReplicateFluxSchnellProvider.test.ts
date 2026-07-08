import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from "vitest";
import { ReplicateFluxSchnellProvider } from "../ReplicateFluxSchnellProvider";
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

describe("ReplicateFluxSchnellProvider", () => {
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
      const provider = new ReplicateFluxSchnellProvider({});

      const request: ImagePreviewRequest = { prompt: "test", userId: "user-1" };

      await expect(provider.generatePreview(request)).rejects.toThrow(
        "Replicate provider is not configured. REPLICATE_API_TOKEN is required.",
      );

      if (previousToken) {
        process.env.REPLICATE_API_TOKEN = previousToken;
      }
    });

    it("rejects empty prompts before hitting the API", async () => {
      const provider = new ReplicateFluxSchnellProvider({
        apiToken: "token",
      });
      const request: ImagePreviewRequest = { prompt: "   ", userId: "user-1" };

      await expect(provider.generatePreview(request)).rejects.toThrow(
        "Prompt is required and must be a non-empty string",
      );
    });

    it("maps insufficient credit errors to status 402 with parsed details", async () => {
      const provider = new ReplicateFluxSchnellProvider({
        apiToken: "token",
      });
      createPredictionMock.mockRejectedValueOnce(
        new Error('402 {"detail": "Out of credits"}'),
      );

      const request: ImagePreviewRequest = {
        prompt: "valid prompt",
        userId: "user-1",
      };

      await expect(provider.generatePreview(request)).rejects.toMatchObject({
        message: "Out of credits",
        statusCode: 402,
      });
    });

    it("throws when the Replicate response contains no output", async () => {
      const provider = new ReplicateFluxSchnellProvider({
        apiToken: "token",
      });
      createPredictionMock.mockResolvedValueOnce({
        id: "pred-1",
        status: "succeeded",
        output: null,
      });

      const request: ImagePreviewRequest = {
        prompt: "valid prompt",
        userId: "user-1",
      };

      await expect(provider.generatePreview(request)).rejects.toThrow(
        "Replicate API returned no output. The image generation may have failed silently.",
      );
    });

    it("maps rate-limit errors to status 429 with parsed details", async () => {
      const provider = new ReplicateFluxSchnellProvider({
        apiToken: "token",
      });
      const sleepSpy = vi.spyOn(
        provider as unknown as { sleep: (ms: number) => Promise<void> },
        "sleep",
      );
      sleepSpy.mockResolvedValue(undefined);
      createPredictionMock.mockRejectedValue(
        new Error('429 {"detail":"Slow down","retry_after":0}'),
      );

      await expect(
        provider.generatePreview({ prompt: "valid prompt", userId: "user-1" }),
      ).rejects.toMatchObject({
        message: "Slow down",
        statusCode: 429,
      });

      sleepSpy.mockRestore();
    });

    it.each([
      ["failed" as const, "GPU crashed"],
      ["canceled" as const, null],
    ])(
      "throws when prediction transitions to %s during polling",
      async (status, predictionError) => {
        const provider = new ReplicateFluxSchnellProvider({
          apiToken: "token",
        });
        const sleepSpy = vi.spyOn(
          provider as unknown as { sleep: (ms: number) => Promise<void> },
          "sleep",
        );
        sleepSpy.mockResolvedValue(undefined);

        createPredictionMock.mockResolvedValueOnce({
          id: "pred-1",
          status: "processing",
          output: null,
        });
        getPredictionMock.mockResolvedValueOnce({
          id: "pred-1",
          status,
          output: null,
          error: predictionError,
        });

        await expect(
          provider.generatePreview({
            prompt: "valid prompt",
            userId: "user-1",
          }),
        ).rejects.toThrow(
          `Image generation failed: ${predictionError || "Unknown error"}`,
        );

        sleepSpy.mockRestore();
      },
    );
  });

  describe("edge cases", () => {
    it("defaults invalid aspect ratios to 16:9", async () => {
      const provider = new ReplicateFluxSchnellProvider({
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
        aspectRatio: "10:10",
      };

      await provider.generatePreview(request);

      const call = createPredictionMock.mock
        .calls[0]?.[0] as CreatePredictionRequest;
      expect(call.input.aspect_ratio).toBe("16:9");
    });

    it("passes through supported aspect ratios after trimming", async () => {
      const provider = new ReplicateFluxSchnellProvider({
        apiToken: "token",
      });
      createPredictionMock.mockResolvedValueOnce({
        id: "pred-1",
        status: "succeeded",
        output: "https://images.example.com/output.webp",
      });

      await provider.generatePreview({
        prompt: "valid prompt",
        userId: "user-1",
        aspectRatio: " 21:9 ",
      });

      const call = createPredictionMock.mock
        .calls[0]?.[0] as CreatePredictionRequest;
      expect(call.input.aspect_ratio).toBe("21:9");
    });

    it("strips preview sections before sending the prompt to the model", async () => {
      const provider = new ReplicateFluxSchnellProvider({
        apiToken: "token",
      });

      createPredictionMock.mockResolvedValueOnce({
        id: "pred-1",
        status: "succeeded",
        output: "https://images.example.com/output.webp",
      });

      const request: ImagePreviewRequest = {
        prompt: "Cinematic shot of a skyline.\n\n**Technical specs**\nISO 200",
        userId: "user-1",
      };

      await provider.generatePreview(request);

      const call = createPredictionMock.mock
        .calls[0]?.[0] as CreatePredictionRequest;
      expect(call.input.prompt).toBe("Cinematic shot of a skyline.");
    });

    it("retries create prediction on rate limits before succeeding", async () => {
      const provider = new ReplicateFluxSchnellProvider({
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
    it("extracts the image URL from array outputs", async () => {
      const provider = new ReplicateFluxSchnellProvider({
        apiToken: "token",
      });
      createPredictionMock.mockResolvedValueOnce({
        id: "pred-1",
        status: "succeeded",
        output: ["not-a-url", "https://images.example.com/preview.webp"],
      });

      const request: ImagePreviewRequest = {
        prompt: "valid prompt",
        userId: "user-1",
      };

      const result = await provider.generatePreview(request);

      expect(result.imageUrl).toBe("https://images.example.com/preview.webp");
      expect(result.model).toBe("black-forest-labs/flux-schnell");
      expect(result.aspectRatio).toBe("16:9");
    });

    it("returns the image URL when the output is a string", async () => {
      const provider = new ReplicateFluxSchnellProvider({
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
      };

      const result = await provider.generatePreview(request);

      expect(result.imageUrl).toBe("https://images.example.com/output.webp");
      expect(result.model).toBe("black-forest-labs/flux-schnell");
    });
  });

  describe("prompt truth (ADR-0010)", () => {
    it("sends a video-shaped prompt to the model verbatim with no transformer wired", async () => {
      // ADR-0010: the first-frame provider needs nothing but an API token and
      // never LLM-rewrites the creator's text. A video-shaped prompt — exactly
      // what the old Gemini transformer would have rewritten — reaches Replicate
      // unchanged (after preview-section stripping, which this prompt has none of).
      const provider = new ReplicateFluxSchnellProvider({ apiToken: "token" });
      createPredictionMock.mockResolvedValueOnce({
        id: "pred-1",
        status: "succeeded",
        output: "https://images.example.com/output.webp",
      });

      const videoShapedPrompt = "A runner at dawn, camera pans left, 6 seconds";
      await provider.generatePreview({
        prompt: videoShapedPrompt,
        userId: "user-1",
      });

      const call = createPredictionMock.mock
        .calls[0]?.[0] as CreatePredictionRequest;
      expect(call.input.prompt).toBe(videoShapedPrompt);
    });
  });
});
