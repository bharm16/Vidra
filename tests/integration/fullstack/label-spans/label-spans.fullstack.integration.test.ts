import type { Application } from "express";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { configureServices, initializeServices } from "@config/services.config";
import { createApp } from "@server/app";

const TEST_API_KEY = "phase2-label-spans-key";

interface MockAIService {
  execute: ReturnType<typeof vi.fn>;
  stream: ReturnType<typeof vi.fn>;
  supportsStreaming: ReturnType<typeof vi.fn>;
  getAvailableClients: ReturnType<typeof vi.fn>;
  getOperationConfig: ReturnType<typeof vi.fn>;
}

describe("Label Spans Routes (full-stack integration)", () => {
  let app: Application;
  let aiServiceMock: MockAIService;
  let forceAiFailure = false;

  let previousAllowedApiKeys: string | undefined;
  let previousPort: string | undefined;

  beforeAll(async () => {
    previousAllowedApiKeys = process.env.ALLOWED_API_KEYS;
    previousPort = process.env.PORT;

    process.env.ALLOWED_API_KEYS = TEST_API_KEY;
    process.env.PORT = "0";

    aiServiceMock = {
      execute: vi.fn(async () => {
        if (forceAiFailure) {
          throw new Error("Synthetic LLM outage");
        }

        const validLabelingResult = {
          analysis_trace: "identified subject entity and mapped to taxonomy",
          spans: [
            {
              text: "runner",
              role: "subject.identity",
              confidence: 0.91,
            },
          ],
          meta: {
            version: "v2.3",
            notes: "integration mock response",
          },
          isAdversarial: false,
        };

        return {
          text: JSON.stringify(validLabelingResult),
          content: [
            {
              text: JSON.stringify(validLabelingResult),
            },
          ],
          metadata: { provider: "mock" },
        };
      }),
      stream: vi.fn(
        async (
          _operation: string,
          params: { onChunk?: (chunk: string) => void },
        ) => {
          if (forceAiFailure) {
            throw new Error("Synthetic streaming outage");
          }

          params.onChunk?.(
            '{"text":"runner","role":"subject.identity","category":"subject.identity","start":2,"end":8,"confidence":0.91}\n',
          );

          return '{"spans":[{"text":"runner","role":"subject.identity","category":"subject.identity","start":2,"end":8,"confidence":0.91}]}';
        },
      ),
      supportsStreaming: vi.fn(() => true),
      getAvailableClients: vi.fn(() => ["mock-provider"]),
      getOperationConfig: vi.fn(() => ({ model: "mock-model" })),
    };

    const container = await configureServices();
    container.registerValue("aiService", aiServiceMock);

    await initializeServices(container);
    app = createApp(container);
  }, 30_000);

  afterAll(() => {
    if (previousAllowedApiKeys === undefined) {
      delete process.env.ALLOWED_API_KEYS;
    } else {
      process.env.ALLOWED_API_KEYS = previousAllowedApiKeys;
    }

    if (previousPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = previousPort;
    }
  });

  beforeEach(() => {
    forceAiFailure = false;
    vi.clearAllMocks();

    aiServiceMock.supportsStreaming.mockReturnValue(true);
    aiServiceMock.getAvailableClients.mockReturnValue(["mock-provider"]);
    aiServiceMock.getOperationConfig.mockReturnValue({ model: "mock-model" });
  });

  it("POST /api/llm/label-spans rejects unauthenticated requests", async () => {
    const response = await request(app)
      .post("/api/llm/label-spans")
      .send({ text: "A runner in frame" });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required");
  });

  it("POST /api/llm/label-spans validates request payload", async () => {
    const response = await request(app)
      .post("/api/llm/label-spans")
      .set("x-api-key", TEST_API_KEY)
      .send({ text: "" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeTypeOf("string");
  });

  it("POST /api/llm/label-spans returns labeled spans for a valid request", async () => {
    const response = await request(app)
      .post("/api/llm/label-spans")
      .set("x-api-key", TEST_API_KEY)
      .send({
        text: "A runner turns toward camera",
        maxSpans: 5,
        minConfidence: 0.4,
      });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.spans)).toBe(true);
    expect(response.body.spans.length).toBeGreaterThan(0);
    expect(response.body.spans[0]).toMatchObject({
      category: "subject.identity",
      confidence: expect.any(Number),
    });
  });

  it("POST /api/llm/label-spans returns 502 when span labeling fails", async () => {
    forceAiFailure = true;

    const response = await request(app)
      .post("/api/llm/label-spans")
      .set("x-api-key", TEST_API_KEY)
      .send({ text: "zxqv ptnr blorf" });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe("LLM span labeling failed");
  });

  it("POST /api/llm/label-spans/stream rejects unauthenticated requests", async () => {
    const response = await request(app)
      .post("/api/llm/label-spans/stream")
      .send({ text: "A runner in frame" });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required");
  });

  it("POST /api/llm/label-spans/stream validates request payload", async () => {
    const response = await request(app)
      .post("/api/llm/label-spans/stream")
      .set("x-api-key", TEST_API_KEY)
      .send({ text: "" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeTypeOf("string");
  });

  it("POST /api/llm/label-spans/stream streams span entries for valid requests", async () => {
    const response = await request(app)
      .post("/api/llm/label-spans/stream")
      .set("x-api-key", TEST_API_KEY)
      .send({
        text: "A runner turns toward camera",
        maxSpans: 5,
        minConfidence: 0.4,
      });

    expect(response.status).toBe(200);

    const lines = response.text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    expect(lines.length).toBeGreaterThan(0);

    const parsed = lines
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((value): value is Record<string, unknown> => value !== null);

    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toMatchObject({
      category: expect.any(String),
      confidence: expect.any(Number),
    });
  });

  it("POST /api/llm/label-spans/stream reports stream errors as JSON payloads", async () => {
    forceAiFailure = true;

    const response = await request(app)
      .post("/api/llm/label-spans/stream")
      .set("x-api-key", TEST_API_KEY)
      .send({ text: "zxqv ptnr blorf" });

    expect(response.status).toBe(200);

    const lines = response.text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const parsed = lines
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((value): value is Record<string, unknown> => value !== null);

    expect(parsed.some((entry) => typeof entry.error === "string")).toBe(true);
  });
});
