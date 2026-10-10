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

  it("falls back to blocking endpoint for 404 stream", async () => {
    const response = { ok: false, status: 404 } as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
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

  it("throws when response body is missing for stream", async () => {
    const response = { ok: true } as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    global.fetch = fetchMock as typeof fetch;

    await expect(
      SpanLabelingApi.labelSpansStream(payload, vi.fn()),
    ).rejects.toThrow("Response body not readable");
  });
});
