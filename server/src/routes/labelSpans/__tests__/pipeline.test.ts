import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import type { Response } from "express";

interface MockSseResponse {
  chunks: string[];
  headersMap: Record<string, string>;
  statusCode: number;
  payload: unknown;
  headersSent: boolean;
  writableEnded: boolean;
  writable: boolean;
  destroyed: boolean;
  setHeader: (
    name: string,
    value: string | number | readonly string[],
  ) => MockSseResponse;
  write: (chunk: string) => boolean;
  flushHeaders?: () => void;
  end: () => MockSseResponse;
  status: (code: number) => MockSseResponse;
  json: (payload: unknown) => MockSseResponse;
  on: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => MockSseResponse;
  removeListener: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => MockSseResponse;
  emitClose: () => void;
}

function createMockSseResponse(): MockSseResponse {
  const emitter = new EventEmitter();
  const chunks: string[] = [];
  const headersMap: Record<string, string> = {};

  const res: MockSseResponse = {
    chunks,
    headersMap,
    statusCode: 200,
    payload: null,
    headersSent: false,
    writableEnded: false,
    writable: true,
    destroyed: false,
    setHeader: vi.fn(
      (name: string, value: string | number | readonly string[]) => {
        headersMap[name] = String(value);
        return res;
      },
    ),
    write: vi.fn((chunk: string) => {
      chunks.push(String(chunk));
      res.headersSent = true;
      return true;
    }),
    flushHeaders: vi.fn(() => {
      res.headersSent = true;
    }),
    end: vi.fn(() => {
      res.writableEnded = true;
      res.writable = false;
      return res;
    }),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload: unknown) => {
      res.payload = payload;
      res.headersSent = true;
      return res;
    }),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      emitter.on(event, listener);
      return res;
    }),
    removeListener: vi.fn(
      (event: string, listener: (...args: unknown[]) => void) => {
        emitter.removeListener(event, listener);
        return res;
      },
    ),
    emitClose: () => {
      emitter.emit("close");
    },
  };

  return res;
}

const {
  labelSpansMock,
  labelSpansStreamMock,
  getCurrentSpanProviderMock,
  loggerMock,
  spanLabelingCacheMock,
} = vi.hoisted(() => ({
  labelSpansMock: vi.fn(),
  labelSpansStreamMock: vi.fn(),
  getCurrentSpanProviderMock: vi.fn(),
  loggerMock: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  spanLabelingCacheMock: {
    get: vi.fn(),
    set: vi.fn(),
    getOrCompute: vi.fn(),
  },
}));

vi.mock("@llm/span-labeling/SpanLabelingService", () => ({
  labelSpans: labelSpansMock,
  labelSpansStream: labelSpansStreamMock,
}));

vi.mock("@llm/span-labeling/services/LlmClientFactory", () => ({
  getCurrentSpanProvider: getCurrentSpanProviderMock,
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: loggerMock,
}));

import { createLabelSpansCoordinator } from "../coordinator";
import { handleLabelSpansStreamRequest } from "../streamingHandler";
import { toPublicLabelSpansResult, toPublicSpan } from "../transform";

describe("labelSpans transform", () => {
  it("maps role into public category and keeps positional metadata", () => {
    const result = toPublicSpan({
      text: "hero",
      role: "subject.identity",
      category: "ignored",
      start: 0,
      end: 4,
      confidence: 0.9,
    });

    expect(result).toEqual({
      text: "hero",
      category: "subject.identity",
      start: 0,
      end: 4,
      confidence: 0.9,
    });
  });

  it("normalizes the public category, defaulting to a valid taxonomy id when role is unavailable", () => {
    expect(
      toPublicSpan({
        text: "city",
        category: "environment.location",
        start: 0,
        end: 4,
      }),
    ).toEqual({
      text: "city",
      category: "environment.location",
      start: 0,
      end: 4,
    });

    expect(
      toPublicSpan({
        text: "mystery",
        start: 10,
        end: 17,
      }),
    ).toEqual({
      text: "mystery",
      category: "subject",
      start: 10,
      end: 17,
    });
  });

  it("normalizes full label result shape", () => {
    const output = toPublicLabelSpansResult({
      spans: [
        {
          text: "hero",
          role: "subject.identity",
          start: 0,
          end: 4,
          confidence: 0.9,
        },
      ],
      meta: { version: "1", notes: "ok", source: "llm" },
    });

    expect(output).toEqual({
      spans: [
        {
          text: "hero",
          category: "subject.identity",
          start: 0,
          end: 4,
          confidence: 0.9,
        },
      ],
      meta: { version: "1", notes: "ok", source: "llm" },
    });
  });
});

describe("labelSpans streaming handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams NDJSON spans and closes the response", async () => {
    labelSpansStreamMock.mockReturnValue(
      (async function* () {
        yield {
          text: "hero",
          role: "subject.identity",
          start: 0,
          end: 4,
          confidence: 0.9,
        };
        yield {
          text: "runs",
          role: "action.movement",
          start: 5,
          end: 9,
          confidence: 0.8,
        };
      })(),
    );

    const res = createMockSseResponse();

    await handleLabelSpansStreamRequest({
      res: res as unknown as Response,
      payload: { text: "hero runs" },
      aiService: {} as never,
      requestId: "req-stream-1",
      userId: "user-1",
    });

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/x-ndjson",
    );
    expect(res.write).toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(res.chunks[0]).toContain('"category":"subject.identity"');
    expect(res.chunks[1]).toContain('"category":"action.movement"');
  });

  it("stops writing when client closes mid-stream", async () => {
    labelSpansStreamMock.mockReturnValue(
      (async function* () {
        yield {
          text: "hero",
          role: "subject.identity",
          start: 0,
          end: 4,
          confidence: 0.9,
        };
        yield {
          text: "runs",
          role: "action.movement",
          start: 5,
          end: 9,
          confidence: 0.8,
        };
      })(),
    );

    const res = createMockSseResponse();
    (res.write as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (chunk: string) => {
        res.chunks.push(String(chunk));
        res.headersSent = true;
        res.emitClose();
        return true;
      },
    );

    await handleLabelSpansStreamRequest({
      res: res as unknown as Response,
      payload: { text: "hero runs" },
      aiService: {} as never,
      requestId: "req-stream-2",
      userId: "user-1",
    });

    expect(res.chunks).toHaveLength(1);
  });

  it("returns 502 JSON when stream fails before any response is sent", async () => {
    labelSpansStreamMock.mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          throw new Error("stream failed");
        },
      }),
    });

    const res = createMockSseResponse();
    res.flushHeaders = undefined as never;
    res.headersSent = false;

    await handleLabelSpansStreamRequest({
      res: res as unknown as Response,
      payload: { text: "hero runs" },
      aiService: {} as never,
      requestId: "req-stream-3",
      userId: "user-1",
    });

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.payload).toMatchObject({
      error: "Streaming failed",
      message: "stream failed",
      degraded: false,
      partialCount: 0,
    });
  });

  it("writes an ndjson error line when stream fails after headers were sent", async () => {
    labelSpansStreamMock.mockReturnValue(
      (async function* () {
        yield {
          text: "hero",
          role: "subject.identity",
          start: 0,
          end: 4,
          confidence: 0.9,
        };
        throw new Error("stream failed");
      })(),
    );

    const res = createMockSseResponse();

    await handleLabelSpansStreamRequest({
      res: res as unknown as Response,
      payload: { text: "hero runs" },
      aiService: {} as never,
      requestId: "req-stream-4",
      userId: "user-1",
    });

    expect(res.status).not.toHaveBeenCalledWith(502);
    const errorLine = res.chunks.find((line) =>
      line.includes('"error":"Streaming failed"'),
    );
    expect(errorLine).toBeDefined();
    // Verify structured error includes degraded flag and partial count
    const errorPayload = JSON.parse(errorLine!.trim());
    expect(errorPayload.degraded).toBe(true);
    expect(errorPayload.partialCount).toBe(1);
    expect(res.end).toHaveBeenCalled();
  });
});

describe("labelSpans coordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentSpanProviderMock.mockReturnValue("groq");
    spanLabelingCacheMock.get.mockResolvedValue(null);
    spanLabelingCacheMock.set.mockResolvedValue(true);
  });

  it("returns cached result and HIT header when cache has an entry", async () => {
    const cachedResult = {
      spans: [
        {
          text: "hero",
          role: "subject.identity",
          start: 0,
          end: 4,
          confidence: 0.9,
        },
      ],
      meta: { source: "cache" },
    };
    spanLabelingCacheMock.getOrCompute.mockResolvedValueOnce({
      value: cachedResult,
      source: "cache",
    });

    const coordinator = createLabelSpansCoordinator(
      {} as never,
      spanLabelingCacheMock as never,
    );
    const response = await coordinator.resolve({
      payload: { text: "hero runs" },
      text: "hero runs",
      policy: null,
      templateVersion: null,
      requestId: "req-coord-1",
      userId: "user-1",
      startTimeMs: performance.now(),
    });

    expect(response.result).toEqual(cachedResult);
    expect(response.headers).toEqual(
      expect.objectContaining({
        "X-Cache": "HIT",
      }),
    );
    expect(labelSpansMock).not.toHaveBeenCalled();
    expect(spanLabelingCacheMock.getOrCompute).toHaveBeenCalledWith(
      "hero runs",
      null,
      null,
      expect.any(Function),
      { ttl: 3600, provider: "groq" },
    );
  });

  it("computes result on cache miss, stores it, and returns MISS header", async () => {
    const computedResult = {
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
    };
    labelSpansMock.mockResolvedValueOnce(computedResult);
    // getOrCompute owns the cache-aside pattern (get → inflight-check →
    // compute → set). Simulate its miss path by invoking the compute arg.
    spanLabelingCacheMock.getOrCompute.mockImplementationOnce(
      async (
        _text: string,
        _policy: unknown,
        _tpl: string | null,
        compute: () => Promise<unknown>,
      ) => ({ value: await compute(), source: "computed" }),
    );

    const coordinator = createLabelSpansCoordinator(
      {} as never,
      spanLabelingCacheMock as never,
    );
    const response = await coordinator.resolve({
      payload: { text: "hero runs" },
      text: "hero runs",
      policy: { allowOverlap: false } as never,
      templateVersion: "v1",
      requestId: "req-coord-2",
      userId: "user-1",
      startTimeMs: performance.now(),
    });

    expect(response.result).toEqual(computedResult);
    expect(response.headers).toEqual(
      expect.objectContaining({
        "X-Cache": "MISS",
      }),
    );
    expect(labelSpansMock).toHaveBeenCalledWith({ text: "hero runs" }, {});
    expect(spanLabelingCacheMock.getOrCompute).toHaveBeenCalledWith(
      "hero runs",
      { allowOverlap: false },
      "v1",
      expect.any(Function),
      { ttl: 3600, provider: "groq" },
    );
  });

  it("coalesces duplicate in-flight requests and returns COALESCED header", async () => {
    const sharedResult = {
      spans: [
        {
          text: "hero",
          role: "subject.identity",
          start: 0,
          end: 4,
          confidence: 0.9,
        },
      ],
      meta: { version: "1", notes: "ok", source: "llm" },
    };

    // Single-flight lives in the cache layer. The first caller trips compute,
    // the second caller is routed to "coalesced" (awaiting the same promise).
    spanLabelingCacheMock.getOrCompute
      .mockResolvedValueOnce({ value: sharedResult, source: "computed" })
      .mockResolvedValueOnce({ value: sharedResult, source: "coalesced" });

    const coordinator = createLabelSpansCoordinator(
      {} as never,
      spanLabelingCacheMock as never,
    );
    const input = {
      payload: { text: "hero runs" },
      text: "hero runs",
      policy: null,
      templateVersion: "v1",
      requestId: "req-coord-3",
      userId: "user-1",
      startTimeMs: performance.now(),
    };

    const firstResponse = await coordinator.resolve(input);
    const secondResponse = await coordinator.resolve({
      ...input,
      requestId: "req-coord-4",
    });

    expect(firstResponse.result).toEqual(sharedResult);
    expect(firstResponse.headers["X-Cache"]).toBe("MISS");
    expect(secondResponse.result).toEqual(sharedResult);
    expect(secondResponse.headers).toEqual(
      expect.objectContaining({
        "X-Cache": "COALESCED",
        "X-Coalesced": "1",
      }),
    );
  });
});
