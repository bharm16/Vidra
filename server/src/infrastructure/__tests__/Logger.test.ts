import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../Logger";
import { runWithRequestContext } from "../requestContext";

const { mockPinoLogger, mockChildLogger, pinoFactory } = vi.hoisted(() => {
  const mockPinoLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
    isLevelEnabled: vi.fn(() => true),
  };
  const mockChildLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
    isLevelEnabled: vi.fn(() => true),
  };
  mockPinoLogger.child = vi.fn(() => mockChildLogger);
  const pinoFactory = vi.fn(() => mockPinoLogger);
  return { mockPinoLogger, mockChildLogger, pinoFactory };
});

vi.mock("pino", () => ({
  default: pinoFactory,
}));

vi.mock("pino-pretty", () => ({
  default: vi.fn(() => ({ write: vi.fn() })),
}));

describe("Logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("error handling", () => {
    it("includes error details in error logs", () => {
      const logger = new Logger({
        includeLogStack: false,
        includeLogCaller: false,
      });
      const error = new Error("boom");

      logger.error("Failure", error, { requestId: "req-1", extra: "context" });

      const firstErrorCall = mockPinoLogger.error.mock.calls[0];
      expect(firstErrorCall).toBeDefined();
      const [meta, message] = firstErrorCall!;
      expect(message).toBe("Failure");
      expect(meta).toMatchObject({
        requestId: "req-1",
        extra: "context",
        err: {
          errorMessage: "boom",
          errorName: "Error",
        },
      });
      expect((meta as { err: { stack?: string } }).err.stack).toBeTypeOf(
        "string",
      );
    });

    it("logs server errors with the error level in requestLogger", () => {
      const logger = new Logger({
        includeLogStack: false,
        includeLogCaller: false,
      });
      const middleware = logger.requestLogger();
      const next = vi.fn();
      const nowSpy = vi.spyOn(Date, "now");
      nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1500);

      const resEmitter = new EventEmitter();
      const res = Object.assign(resEmitter, {
        statusCode: 500,
        on: resEmitter.on.bind(resEmitter),
      }) as unknown as { statusCode: number; on: EventEmitter["on"] };

      const req = {
        method: "GET",
        path: "/status",
        get: () => "agent",
        ip: "127.0.0.1",
        id: "req-500",
      } as unknown as {
        method: string;
        path: string;
        get: (name: string) => string;
        ip: string;
        id?: string;
      };

      middleware(req as any, res as any, next);
      resEmitter.emit("finish");

      const requestErrorCall = mockPinoLogger.error.mock.calls[0];
      expect(requestErrorCall).toBeDefined();
      const [meta, message] = requestErrorCall!;
      expect(message).toBe("HTTP Request Error");
      expect(meta).toMatchObject({
        method: "GET",
        path: "/status",
        statusCode: 500,
        requestId: "req-500",
        userAgent: "agent",
        ip: "127.0.0.1",
      });
      expect(meta.duration).toBe(500);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("adds requestId from request context when missing", () => {
      const logger = new Logger({
        includeLogStack: false,
        includeLogCaller: false,
      });

      runWithRequestContext({ requestId: "ctx-123" }, () => {
        logger.info("Hello");
      });

      const firstInfoCall = mockPinoLogger.info.mock.calls[0];
      expect(firstInfoCall).toBeDefined();
      const [meta, message] = firstInfoCall!;
      expect(message).toBe("Hello");
      expect(meta).toMatchObject({ requestId: "ctx-123" });
    });
  });

  describe("level filtering", () => {
    // Pins the contract introduced when isLevelEnabled guards were added.
    // The guards should be invisible when the level is enabled (current
    // pino default) and should suppress meta enrichment + the underlying
    // pino call when the level is disabled.

    it("skips pino call and enrichMeta when level is disabled", () => {
      mockPinoLogger.isLevelEnabled.mockReturnValue(false);
      const logger = new Logger({
        includeLogStack: true,
        includeLogCaller: true,
        logStackLevels: ["info", "warn", "debug", "error"],
      });
      const captureSpy = vi.spyOn(
        logger as unknown as { captureLogStack: () => string[] },
        "captureLogStack",
      );

      logger.info("hi");
      logger.warn("warn");
      logger.debug("dbg");
      logger.error("err", new Error("boom"));

      expect(mockPinoLogger.info).not.toHaveBeenCalled();
      expect(mockPinoLogger.warn).not.toHaveBeenCalled();
      expect(mockPinoLogger.debug).not.toHaveBeenCalled();
      expect(mockPinoLogger.error).not.toHaveBeenCalled();
      // The whole point of the guard: skip the stack-capture work entirely
      // when the level is filtered out.
      expect(captureSpy).not.toHaveBeenCalled();
    });
  });
});
