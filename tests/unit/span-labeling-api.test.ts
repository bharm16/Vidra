import { describe, expect, it, beforeEach, vi } from "vitest";

import { SpanLabelingApi } from "@features/span-highlighting/api/spanLabelingApi";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import { buildRequestError } from "@features/span-highlighting/api/spanLabelingErrors";
import { parseLabelSpansResponse } from "@features/span-highlighting/api/spanLabelingResponse";
import { readSpanLabelStream } from "@features/span-highlighting/api/spanLabelingStream";

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: vi.fn(),
}));

vi.mock("@features/span-highlighting/api/spanLabelingErrors", () => ({
  buildRequestError: vi.fn(),
}));

vi.mock("@features/span-highlighting/api/spanLabelingResponse", () => ({
  parseLabelSpansResponse: vi.fn(),
}));

vi.mock("@features/span-highlighting/api/spanLabelingStream", () => ({
  readSpanLabelStream: vi.fn(),
}));

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    }),
  },
}));

const mockBuildFirebaseAuthHeaders = vi.mocked(buildFirebaseAuthHeaders);
const mockBuildRequestError = vi.mocked(buildRequestError);
const mockParseLabelSpansResponse = vi.mocked(parseLabelSpansResponse);
const mockReadSpanLabelStream = vi.mocked(readSpanLabelStream);

const payload = { text: "hello", maxSpans: 5 };
const expectedBody = JSON.stringify({
  text: payload.text,
  maxSpans: payload.maxSpans,
  minConfidence: undefined,
  policy: undefined,
  templateVersion: undefined,
  isI2VMode: undefined,
});
const originalFetch = global.fetch;

describe("SpanLabelingApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildFirebaseAuthHeaders.mockResolvedValue({ "X-Test": "token" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("labels spans using blocking endpoint", async () => {
    const response = {
      ok: true,
      json: async () => ({ spans: [] }),
    } as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    global.fetch = fetchMock as typeof fetch;

    mockParseLabelSpansResponse.mockReturnValue({ spans: [], meta: null });

    const result = await SpanLabelingApi.labelSpans(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/llm/label-spans",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Test": "token",
        }),
        body: expectedBody,
      }),
    );
    expect(result).toEqual({ spans: [], meta: null });
  });

  it("throws request error on non-ok response", async () => {
    const response = { ok: false, status: 500 } as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    global.fetch = fetchMock as typeof fetch;

    mockBuildRequestError.mockResolvedValue(new Error("failed"));

    await expect(SpanLabelingApi.labelSpans(payload)).rejects.toThrow("failed");
  });

  it("falls back to blocking endpoint for 404 stream", async () => {
    const response = { ok: false, status: 404 } as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    global.fetch = fetchMock as typeof fetch;

    const blockingResult = { spans: [], meta: { streaming: false } };
    vi.spyOn(SpanLabelingApi, "labelSpans").mockResolvedValue(blockingResult);

    const result = await SpanLabelingApi.labelSpansStream(payload, vi.fn());

    expect(result).toEqual(blockingResult);
  });

  it("falls back to blocking endpoint for 5xx stream errors", async () => {
    const response = { ok: false, status: 500 } as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    global.fetch = fetchMock as typeof fetch;

    const onChunk = vi.fn();
    const blockingResult = {
      spans: [{ start: 0, end: 5, category: "subject", confidence: 0.9 }],
      meta: { streaming: false },
    };
    vi.spyOn(SpanLabelingApi, "labelSpans").mockResolvedValue(blockingResult);

    const result = await SpanLabelingApi.labelSpansStream(payload, onChunk);

    expect(result).toEqual(blockingResult);
    expect(onChunk).toHaveBeenCalledTimes(1);
  });

  it("falls back to blocking endpoint for stream transport failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as typeof fetch;

    const blockingResult = { spans: [], meta: { streaming: false } };
    vi.spyOn(SpanLabelingApi, "labelSpans").mockResolvedValue(blockingResult);

    const result = await SpanLabelingApi.labelSpansStream(payload, vi.fn());
    expect(result).toEqual(blockingResult);
  });

  it("throws request error for non-fallback stream status", async () => {
    const response = { ok: false, status: 400 } as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    global.fetch = fetchMock as typeof fetch;

    mockBuildRequestError.mockResolvedValue(new Error("bad request"));

    await expect(
      SpanLabelingApi.labelSpansStream(payload, vi.fn()),
    ).rejects.toThrow("bad request");
  });

  it("streams spans when reader is available", async () => {
    const reader = {
      read: vi.fn(),
      releaseLock: vi.fn(),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;
    const response = {
      ok: true,
      body: { getReader: () => reader },
    } as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    global.fetch = fetchMock as typeof fetch;

    mockReadSpanLabelStream.mockResolvedValue({
      spans: [{ start: 0, end: 1, category: "style", confidence: 0.9 }],
      linesProcessed: 1,
      parseErrors: 0,
    });

    const onChunk = vi.fn();
    const result = await SpanLabelingApi.labelSpansStream(payload, onChunk);

    expect(result.meta).toEqual({ streaming: true });
    expect(onChunk).not.toHaveBeenCalled();
  });

  it("throws when response body is missing for stream", async () => {
    const response = { ok: true } as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    global.fetch = fetchMock as typeof fetch;

    await expect(
      SpanLabelingApi.labelSpansStream(payload, vi.fn()),
    ).rejects.toThrow("Response body not readable");
  });
});
