import { promises as fs } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageObservationService } from "../ImageObservationService";
import type { AIExecutionPort as AIService } from "@services/ai-model/ports/AIExecutionPort";
import type { AIResponse } from "@interfaces/IAIClient";

const createAiResponse = (text: string): AIResponse => ({
  text,
  metadata: {},
});

const createAIStub = (
  text = "{}",
): { ai: AIService; executeMock: ReturnType<typeof vi.fn> } => {
  const executeMock = vi.fn().mockResolvedValue(createAiResponse(text));
  return {
    ai: {
      execute: executeMock,
      resolveExecution: () => ({
        client: "openai",
        provider: "openai" as const,
        model: "stub-model",
        viaFallback: false,
      }),
    },
    executeMock,
  };
};

const setFetchOk = (contentType = "image/png", body = "fake-image") => {
  const response = {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: {
      get: vi.fn((key: string) =>
        key.toLowerCase() === "content-type" ? contentType : null,
      ),
    },
    arrayBuffer: vi.fn(async () => Buffer.from(body)),
  } as unknown as Response;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
};

describe("ImageObservationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    (
      ImageObservationService as unknown as { cachedPrompt: string | null }
    ).cachedPrompt = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses sourcePrompt fast-path and derives basic observations", async () => {
    const { ai, executeMock } = createAIStub();
    const service = new ImageObservationService(ai, {
      get: vi.fn(),
      set: vi.fn(),
    } as never);

    const result = await service.observe({
      image: "https://example.com/image.jpg",
      sourcePrompt: "A young woman in a close-up at golden hour",
      skipCache: true,
    });

    expect(result.success).toBe(true);
    expect(result.usedFastPath).toBe(true);
    expect(result.cached).toBe(false);
    expect(result.observation?.subject.type).toBe("person");
    expect(result.observation?.framing.shotType).toBe("close-up");
    expect(result.observation?.lighting.timeOfDay).toBe("golden-hour");
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("returns cached result and skips AI execution on cache hit", async () => {
    const { ai, executeMock } = createAIStub();
    const service = new ImageObservationService(ai, {
      get: vi.fn(),
      set: vi.fn(),
    } as never);
    const request = {
      image: "https://example.com/cached-image.jpg",
      sourcePrompt: "A landscape at noon",
    };

    const first = await service.observe(request);
    const second = await service.observe({ image: request.image });

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.usedFastPath).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
    expect(second.observation).toEqual(first.observation);
  });

  it("bypasses cache when skipCache is true", async () => {
    const { ai } = createAIStub();
    const service = new ImageObservationService(ai, {
      get: vi.fn(),
      set: vi.fn(),
    } as never);
    const image = "https://example.com/skip-cache-image.jpg";

    const first = await service.observe({
      image,
      sourcePrompt: "A woman in a close-up at sunset",
    });
    const second = await service.observe({
      image,
      sourcePrompt: "A mountain in a wide shot at night",
      skipCache: true,
    });

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(false);
    expect(second.usedFastPath).toBe(true);
    expect(second.observation?.subject.type).toBe("scene");
    expect(second.observation?.framing.shotType).toBe("wide");
    expect(second.observation?.lighting.timeOfDay).toBe("night");
  });

  it("parses fenced JSON from vision response and stores structured observation", async () => {
    setFetchOk("image/png", "vision-bytes");
    vi.spyOn(fs, "readFile").mockResolvedValueOnce(
      "System prompt from template",
    );
    const { ai, executeMock } = createAIStub(`\`\`\`json
{
  "subject": { "type": "person", "description": "runner", "position": "left-third" },
  "framing": { "shotType": "wide", "angle": "low-angle" },
  "lighting": { "quality": "dramatic", "timeOfDay": "night" },
  "confidence": 0.91
}
\`\`\``);
    const service = new ImageObservationService(ai, {
      get: vi.fn(),
      set: vi.fn(),
    } as never);

    const result = await service.observe({
      image: "https://example.com/vision-image.jpg",
      skipCache: true,
    });

    expect(result.success).toBe(true);
    expect(result.usedFastPath).toBe(false);
    expect(result.cached).toBe(false);
    expect(result.observation?.subject).toMatchObject({
      type: "person",
      description: "runner",
      position: "left-third",
      confidence: 0.91,
    });
    expect(result.observation?.framing).toMatchObject({
      shotType: "wide",
      angle: "low-angle",
      confidence: 0.91,
    });
    expect(result.observation?.lighting).toMatchObject({
      quality: "dramatic",
      timeOfDay: "night",
      confidence: 0.91,
    });
    expect(result.observation?.confidence).toBe(0.91);

    const executeArgs = executeMock.mock.calls[0]?.[1] as
      | {
          systemPrompt?: string;
          messages?: Array<{ role: string; content: unknown }>;
        }
      | undefined;
    expect(executeArgs?.systemPrompt).toBe("System prompt from template");
    const userMessage = executeArgs?.messages?.find(
      (message) => message.role === "user",
    );
    const userParts = Array.isArray(userMessage?.content)
      ? (userMessage?.content as Array<{
          type?: string;
          image_url?: { url: string };
        }>)
      : [];
    const imagePart = userParts.find((part) => part.type === "image_url");
    expect(imagePart?.image_url?.url.startsWith("data:image/png;base64,")).toBe(
      true,
    );
  });

  it("falls back to default prompt template when file loading fails", async () => {
    setFetchOk();
    vi.spyOn(fs, "readFile").mockRejectedValueOnce(
      new Error("template missing"),
    );
    const { ai, executeMock } = createAIStub("{}");
    const service = new ImageObservationService(ai, {
      get: vi.fn(),
      set: vi.fn(),
    } as never);

    await service.observe({
      image: "https://example.com/fallback-template.jpg",
      skipCache: true,
    });

    const executeArgs = executeMock.mock.calls[0]?.[1] as
      | { systemPrompt?: string }
      | undefined;
    expect(executeArgs?.systemPrompt).toContain(
      "Analyze this image for video generation constraints.",
    );
  });

  it("returns low-confidence fallback observation when vision analysis fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, statusText: "Down" })),
    );
    const { ai, executeMock } = createAIStub();
    const service = new ImageObservationService(ai, {
      get: vi.fn(),
      set: vi.fn(),
    } as never);

    const result = await service.observe({
      image: "https://example.com/vision-failure.jpg",
      skipCache: true,
    });

    expect(result.success).toBe(true);
    expect(result.cached).toBe(false);
    expect(result.usedFastPath).toBe(false);
    expect(result.observation?.confidence).toBe(0.2);
    expect(result.observation?.subject).toMatchObject({
      type: "object",
      description: "subject",
      position: "center",
      confidence: 0.2,
    });
    expect(result.observation?.framing).toMatchObject({
      shotType: "medium",
      angle: "eye-level",
      confidence: 0.2,
    });
    expect(result.observation?.lighting).toMatchObject({
      quality: "natural",
      timeOfDay: "unknown",
      confidence: 0.2,
    });
    expect(executeMock).not.toHaveBeenCalled();
  });
});
