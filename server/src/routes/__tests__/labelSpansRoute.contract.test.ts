import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ApiResponseSchema,
  ApiErrorResponseSchema,
} from "@shared/schemas/api.schemas";
import type { AIModelService } from "@services/ai-model/AIModelService";
import type { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";

const { labelSpansMock } = vi.hoisted(() => ({
  labelSpansMock: vi.fn(),
}));

vi.mock("@llm/span-labeling/SpanLabelingService", () => ({
  labelSpans: labelSpansMock,
  labelSpansStream: vi.fn(),
}));

vi.mock("@llm/span-labeling/services/LlmClientFactory", () => ({
  getCurrentSpanProvider: vi.fn(() => "groq"),
}));

import { createLabelSpansRoute } from "../labelSpansRoute";

/**
 * Contract test for the label-spans route response envelopes.
 *
 * Pins the canonical ApiResponse union from shared/types/api.ts: the public
 * label result lives only under `data` (no bare-DTO top-level `spans`),
 * validation failures return `{ success: false, error }`, and the 502 catch
 * branch flattens the underlying cause into the canonical string `details`
 * (the pre-envelope shape used a `message` field).
 */

interface ErrorWithCode {
  code?: string;
  message?: string;
}

const isSocketPermissionError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as ErrorWithCode;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  if (code === "EPERM" || code === "EACCES") {
    return true;
  }
  return (
    message.includes("listen EPERM") ||
    message.includes("listen EACCES") ||
    message.includes("operation not permitted") ||
    message.includes("Cannot read properties of null (reading 'port')")
  );
};

const runSupertestOrSkip = async <T>(
  execute: () => Promise<T>,
): Promise<T | null> => {
  if (process.env.CODEX_SANDBOX === "seatbelt") {
    return null;
  }
  try {
    return await execute();
  } catch (error) {
    if (isSocketPermissionError(error)) {
      return null;
    }
    throw error;
  }
};

const buildApp = (
  spanLabelingCache: SpanLabelingCacheService | null = null,
): express.Express => {
  const app = express();
  app.use(express.json());
  app.use(
    "/label-spans",
    createLabelSpansRoute(
      {} as unknown as AIModelService,
      spanLabelingCache,
      null,
    ),
  );
  return app;
};

const LabelSpansDataSchema = z
  .object({
    spans: z.array(
      z.object({ text: z.string(), category: z.string() }).passthrough(),
    ),
  })
  .passthrough();

const AnyDataSchema = ApiResponseSchema(z.unknown());

describe("label-spans route — canonical envelope contract", () => {
  it("POST / returns the success envelope with the public result under data", async () => {
    labelSpansMock.mockResolvedValueOnce({
      spans: [
        {
          text: "hero",
          role: "subject.identity",
          start: 0,
          end: 4,
          confidence: 0.9,
        },
      ],
      meta: { source: "llm" },
    });

    const response = await runSupertestOrSkip(() =>
      request(buildApp()).post("/label-spans").send({ text: "hero runs" }),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    const parsed = ApiResponseSchema(LabelSpansDataSchema).parse(response.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.spans[0]).toMatchObject({
        text: "hero",
        category: "subject.identity",
      });
    }
    // Guards the bare-DTO removal: the result lives only under `data`.
    expect(response.body).not.toHaveProperty("spans");
    expect(response.body).not.toHaveProperty("meta");
  });

  it("POST / with an invalid body returns the canonical error envelope", async () => {
    const response = await runSupertestOrSkip(() =>
      request(buildApp()).post("/label-spans").send({ text: "" }),
    );
    if (!response) return;

    expect(response.status).toBe(400);
    const parsed = AnyDataSchema.parse(response.body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error).toBe("text is required");
    }
    ApiErrorResponseSchema.parse(response.body);
  });

  it("POST / returns the error envelope when labeling produces no result", async () => {
    // The no-result branch is reachable when the cache layer's single-flight
    // resolves a coalesced request to a null value — model that directly.
    const nullCoalescingCache = {
      getOrCompute: vi.fn(async () => ({ value: null, source: "coalesced" })),
    } as unknown as SpanLabelingCacheService;

    const response = await runSupertestOrSkip(() =>
      request(buildApp(nullCoalescingCache))
        .post("/label-spans")
        .send({ text: "no result" }),
    );
    if (!response) return;

    expect(response.status).toBe(502);
    const parsed = AnyDataSchema.parse(response.body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error).toBe("Span labeling failed to produce a result");
    }
  });

  it("POST / flattens the failure cause into string details on the 502 envelope", async () => {
    labelSpansMock.mockRejectedValueOnce(new Error("provider exploded"));

    const response = await runSupertestOrSkip(() =>
      request(buildApp()).post("/label-spans").send({ text: "boom" }),
    );
    if (!response) return;

    expect(response.status).toBe(502);
    const parsed = AnyDataSchema.parse(response.body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error).toBe("LLM span labeling failed");
      expect(parsed.details).toBe("provider exploded");
    }
    // Guards the pre-envelope ad-hoc shape: no top-level `message` field.
    expect(response.body).not.toHaveProperty("message");
  });

  it("POST /stream with an invalid body returns the canonical error envelope", async () => {
    const response = await runSupertestOrSkip(() =>
      request(buildApp()).post("/label-spans/stream").send({ text: "" }),
    );
    if (!response) return;

    expect(response.status).toBe(400);
    const parsed = AnyDataSchema.parse(response.body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error).toBe("text is required");
    }
  });
});
