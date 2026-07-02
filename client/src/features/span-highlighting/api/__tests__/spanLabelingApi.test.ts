import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBuildFirebaseAuthHeaders, mockReadSpanLabelStream } = vi.hoisted(
  () => ({
    mockBuildFirebaseAuthHeaders: vi.fn(),
    mockReadSpanLabelStream: vi.fn(),
  }),
);

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: mockBuildFirebaseAuthHeaders,
}));

vi.mock("../spanLabelingStream", () => ({
  readSpanLabelStream: mockReadSpanLabelStream,
}));

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { SpanLabelingApi } from "../spanLabelingApi";

describe("SpanLabelingApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildFirebaseAuthHeaders.mockResolvedValue({
      Authorization: "Bearer firebase-token",
    });
  });

  it("labelSpans builds blocking request and returns parsed spans", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            spans: [
              {
                start: 0,
                end: 4,
                category: "subject",
                confidence: 0.9,
                text: "Hero",
              },
              // The server contract (toPublicSpan) always emits `category`;
              // a role-only span is structurally invalid and must be dropped,
              // not re-derived client-side.
              { start: 5, end: 10, role: "camera", confidence: 0.7 },
            ],
            meta: { source: "blocking" },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await SpanLabelingApi.labelSpans({
      text: "Hero shot",
      maxSpans: 20,
      minConfidence: 0.5,
      templateVersion: "v1",
      policy: { allowOverlap: false },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/llm/label-spans",
      expect.objectContaining({ method: "POST" }),
    );
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(options.body).toContain('"text":"Hero shot"');

    const headers = new Headers(options.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer firebase-token");

    expect(result).toEqual({
      spans: [
        {
          start: 0,
          end: 4,
          category: "subject",
          confidence: 0.9,
          text: "Hero",
        },
      ],
      meta: { source: "blocking" },
    });
  });

  it("labelSpans throws mapped request error on non-ok canonical envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: false, error: "Labeling failed" }),
          {
            status: 422,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      SpanLabelingApi.labelSpans({ text: "x" }),
    ).rejects.toMatchObject({
      message: "Labeling failed",
      status: 422,
    });
  });

  it("labelSpans falls back to legacy message field on non-envelope error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Labeling failed" }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      SpanLabelingApi.labelSpans({ text: "x" }),
    ).rejects.toMatchObject({
      message: "Labeling failed",
      status: 422,
    });
  });

  it("labelSpans narrows on a success:false envelope body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ success: false, error: "labeling degraded" }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
    );

    await expect(SpanLabelingApi.labelSpans({ text: "x" })).rejects.toThrow(
      "labeling degraded",
    );
  });

  it("labelSpans rejects a bare (non-enveloped) success body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ spans: [], meta: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(SpanLabelingApi.labelSpans({ text: "x" })).rejects.toThrow();
  });

  it("labelSpansStream returns streamed spans and invokes chunk callback", async () => {
    const mockReader = {
      releaseLock: vi.fn(),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;
    const onChunk = vi.fn();

    mockReadSpanLabelStream.mockImplementation(async (_reader, callback) => {
      const spanA = { start: 0, end: 4, category: "subject", confidence: 0.9 };
      const spanB = { start: 5, end: 9, category: "camera", confidence: 0.8 };
      callback(spanA);
      callback(spanB);
      return {
        spans: [spanA, spanB],
        linesProcessed: 2,
        parseErrors: 0,
      };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      }),
    );

    const result = await SpanLabelingApi.labelSpansStream(
      { text: "Hero camera move" },
      onChunk,
    );

    expect(mockReadSpanLabelStream).toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      spans: [
        { start: 0, end: 4, category: "subject", confidence: 0.9 },
        { start: 5, end: 9, category: "camera", confidence: 0.8 },
      ],
      meta: { streaming: true },
    });
  });

  it("labelSpansStream falls back to blocking on stream endpoint server errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "stream offline" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const blockingResult = {
      spans: [{ start: 0, end: 3, category: "subject", confidence: 0.95 }],
      meta: { source: "fallback" },
    };

    const blockingSpy = vi
      .spyOn(SpanLabelingApi, "labelSpans")
      .mockResolvedValue(blockingResult);
    const onChunk = vi.fn();

    const result = await SpanLabelingApi.labelSpansStream(
      { text: "abc" },
      onChunk,
    );

    expect(blockingSpy).toHaveBeenCalledWith({ text: "abc" }, null);
    expect(onChunk).toHaveBeenCalledWith(
      blockingResult.spans[0],
      0,
      blockingResult.spans,
    );
    expect(result).toEqual(blockingResult);
  });

  it("labelSpansStream falls back on transport failure unless aborted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network disconnected")),
    );

    const blockingResult = {
      spans: [{ start: 2, end: 6, category: "style", confidence: 0.6 }],
      meta: { source: "fallback" },
    };
    const blockingSpy = vi
      .spyOn(SpanLabelingApi, "labelSpans")
      .mockResolvedValue(blockingResult);
    const onChunk = vi.fn();

    const result = await SpanLabelingApi.labelSpansStream(
      { text: "style test" },
      onChunk,
    );

    expect(blockingSpy).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith(
      blockingResult.spans[0],
      0,
      blockingResult.spans,
    );
    expect(result).toEqual(blockingResult);
  });

  it("labelSpansStream rethrows AbortError without fallback when request is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const abortError = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const blockingSpy = vi.spyOn(SpanLabelingApi, "labelSpans");

    await expect(
      SpanLabelingApi.labelSpansStream(
        { text: "abort" },
        vi.fn(),
        controller.signal,
      ),
    ).rejects.toBe(abortError);

    expect(blockingSpy).not.toHaveBeenCalled();
  });
});
