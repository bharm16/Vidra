import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { EventEmitter } from "events";

const { loggerMock } = vi.hoisted(() => {
  const base = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  base.child.mockReturnValue(base);
  return { loggerMock: base };
});

// Logger is the observable for "skipped write after close" — the real
// normalizer and request helpers run for real (both are pure).
vi.mock("@infrastructure/Logger", () => ({
  logger: loggerMock,
}));

import { createOptimizeHandler } from "@routes/optimize/handlers/optimize";
import { createOptimizeCompileHandler } from "@routes/optimize/handlers/optimizeCompile";
import type { OptimizeTelemetryService } from "@services/observability/OptimizeTelemetryService";

const mockTelemetryService = {
  startOptimizeTrace: vi.fn(() => ({
    recordStage: vi.fn(),
    recordLlmCall: vi.fn(),
    recordCacheHit: vi.fn(),
    recordError: vi.fn(),
    complete: vi.fn(),
  })),
} as unknown as OptimizeTelemetryService;

type MutableMockResponse = Response & {
  headersSent: boolean;
  writableEnded: boolean;
};

function createMockResponse(): MutableMockResponse {
  const emitter = new EventEmitter();
  const res = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    status: vi.fn(function status(this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function json(
      this: { headersSent: boolean; writableEnded: boolean },
      _payload: unknown,
    ) {
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    }),
    once: emitter.once.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    emit: emitter.emit.bind(emitter),
  };

  return res as unknown as MutableMockResponse;
}

function createMockRequest(body: Record<string, unknown>, id: string): Request {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    id,
    body,
    once: emitter.once.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    emit: emitter.emit.bind(emitter),
  }) as Request;
}

describe("optimize handlers response-state regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("optimize handler does not write after response already closed", async () => {
    const res = createMockResponse();
    const service = {
      optimize: vi.fn(async () => {
        res.headersSent = true;
        (res as MutableMockResponse).writableEnded = true;
        return {
          prompt: "optimized",
          inputMode: "t2v" as const,
          metadata: {},
        };
      }),
      compilePrompt: vi.fn(),
    };

    const handler = createOptimizeHandler(
      service as never,
      mockTelemetryService,
    );
    const req = createMockRequest(
      {
        prompt: "baby driving a car",
        mode: "video",
      },
      "req-1",
    );

    await expect(handler(req, res)).resolves.toBeUndefined();
    expect(service.optimize).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(res.json).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Optimize request completed after response already closed; skipping payload write",
      expect.any(Object),
    );
  });

  it("optimize handler suppresses rethrow when response already closed", async () => {
    const res = createMockResponse();
    const service = {
      optimize: vi.fn(async () => {
        throw new Error("upstream failed");
      }),
      compilePrompt: vi.fn(),
    };

    res.headersSent = true;
    res.writableEnded = true;

    const handler = createOptimizeHandler(
      service as never,
      mockTelemetryService,
    );
    const req = createMockRequest(
      {
        prompt: "baby driving a car",
        mode: "video",
      },
      "req-2",
    );

    await expect(handler(req, res)).resolves.toBeUndefined();
    expect(loggerMock.error).not.toHaveBeenCalledWith(
      "Optimize request failed",
      expect.any(Error),
      expect.any(Object),
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Optimize request failed after response already closed; suppressing rethrow",
      expect.any(Object),
    );
  });

  it("optimize-compile handler suppresses rethrow when response already closed", async () => {
    const res = createMockResponse();
    const service = {
      optimize: vi.fn(),
      compilePrompt: vi.fn(async () => {
        throw new Error("compile failed");
      }),
    };

    res.headersSent = true;
    res.writableEnded = true;

    const handler = createOptimizeCompileHandler(service as never);
    const req = createMockRequest(
      {
        prompt: "baby driving a car",
        targetModel: "wan-2.2",
      },
      "req-3",
    );

    await expect(handler(req, res)).resolves.toBeUndefined();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Optimize-compile failed after response already closed; suppressing rethrow",
      expect.any(Object),
    );
  });
});
