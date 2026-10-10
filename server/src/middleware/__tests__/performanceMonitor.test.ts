import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerformanceMonitor } from "../performanceMonitor";

// Mock the logger
vi.mock("@infrastructure/Logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { logger } from "@infrastructure/Logger";

type RequestWithPerf = Request & {
  perfMonitor?: {
    start: (name: string) => void;
    end: (name: string) => void;
    addMetadata: (key: string, value: unknown) => void;
    getMetrics: () => {
      total: number;
      operations: Record<string, number>;
      metadata: Record<string, unknown>;
    };
  };
  route?: { path: string };
};

function createMockRequest(
  options: { path?: string; method?: string; route?: { path: string } } = {},
): RequestWithPerf {
  return {
    path: options.path || "/test",
    method: options.method || "GET",
    route: options.route,
  } as RequestWithPerf;
}

function createMockResponse(): Response & {
  jsonCalled: boolean;
  headerSet: Record<string, string>;
} {
  const res = {
    jsonCalled: false,
    headerSet: {} as Record<string, string>,
    json: vi.fn().mockImplementation(function (this: Response) {
      (this as Response & { jsonCalled: boolean }).jsonCalled = true;
      return this;
    }),
    setHeader: vi.fn().mockImplementation(function (
      this: Response,
      name: string,
      value: string,
    ) {
      (this as Response & { headerSet: Record<string, string> }).headerSet[
        name
      ] = value;
      return this;
    }),
  };
  return res as unknown as Response & {
    jsonCalled: boolean;
    headerSet: Record<string, string>;
  };
}

describe("PerformanceMonitor", () => {
  let originalEnv: string | undefined;
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    originalEnv = process.env.NODE_ENV;
    monitor = new PerformanceMonitor();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.NODE_ENV = originalEnv;
  });

  describe("timing operations", () => {
    it("tracks multiple operations independently", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      monitor.trackRequest(req, res, next);

      req.perfMonitor?.start("db-query");
      vi.advanceTimersByTime(50);
      req.perfMonitor?.end("db-query");

      req.perfMonitor?.start("cache-check");
      vi.advanceTimersByTime(10);
      req.perfMonitor?.end("cache-check");

      const metrics = req.perfMonitor?.getMetrics();
      expect(metrics?.operations["db-query"]).toBe(50);
      expect(metrics?.operations["cache-check"]).toBe(10);
    });

    it("returns 0 for operations that were started but not ended", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      monitor.trackRequest(req, res, next);

      req.perfMonitor?.start("pending-op");
      vi.advanceTimersByTime(100);
      // Not calling end

      const metrics = req.perfMonitor?.getMetrics();
      expect(metrics?.operations["pending-op"]).toBe(0);
    });

    it("does not restart already started operation", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      monitor.trackRequest(req, res, next);

      req.perfMonitor?.start("op");
      vi.advanceTimersByTime(50);
      req.perfMonitor?.start("op"); // Second start should be ignored
      vi.advanceTimersByTime(50);
      req.perfMonitor?.end("op");

      const metrics = req.perfMonitor?.getMetrics();
      expect(metrics?.operations["op"]).toBe(100);
    });
  });

  describe("metadata handling", () => {
    it("stores metadata correctly", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      monitor.trackRequest(req, res, next);

      req.perfMonitor?.addMetadata("model", "gpt-4");
      req.perfMonitor?.addMetadata("tokens", 1500);

      const metrics = req.perfMonitor?.getMetrics();
      expect(metrics?.metadata).toEqual({
        model: "gpt-4",
        tokens: 1500,
      });
    });
  });

  describe("response completion", () => {
    it("sets X-Response-Time header", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      monitor.trackRequest(req, res, next);
      vi.advanceTimersByTime(150);
      res.json({ data: "test" });

      expect(res.headerSet["X-Response-Time"]).toBe("150ms");
    });
  });

  describe("slow request alerting", () => {
    it("logs warning for requests exceeding 2000ms", () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      monitor.trackRequest(req, res, next);
      vi.advanceTimersByTime(2500);
      res.json({});

      expect(logger.warn).toHaveBeenCalledWith(
        "Request exceeded latency threshold",
        expect.objectContaining({
          total: 2500,
          threshold: 2000,
        }),
      );
    });
  });
});
