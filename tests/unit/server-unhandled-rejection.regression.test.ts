import type { Server } from "http";
import { readFileSync } from "fs";
import { resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupGracefulShutdown } from "@server/server";

type ProcessHandler = (...args: unknown[]) => void;

describe("regression: unhandled rejection classification", () => {
  const originalMode = process.env.UNHANDLED_REJECTION_MODE;

  beforeEach(() => {
    process.env.UNHANDLED_REJECTION_MODE = "classified";
  });

  afterEach(() => {
    process.env.UNHANDLED_REJECTION_MODE = originalMode;
    vi.restoreAllMocks();
  });

  /**
   * Regression: the classifier used to keep its own pair of tables here rather
   * than asking `@utils/transientErrors`, and they had drifted apart. The
   * shared set knew `socket hang up` and `fetch failed` — the two commonest
   * undici network failures — and this file did not, so either one arriving as
   * an unhandled rejection took the whole process down instead of being logged
   * and survived.
   */
  const expectSurvives = (reason: unknown): void => {
    const listeners = new Map<string, ProcessHandler>();
    vi.spyOn(process, "on").mockImplementation(((
      event: string,
      handler: ProcessHandler,
    ) => {
      listeners.set(event, handler);
      return process;
    }) as typeof process.on);

    const close = vi.fn();
    const server = { close } as unknown as Server;
    const container = {
      resolve: vi.fn(() => {
        throw new Error("not registered");
      }),
    };

    setupGracefulShutdown(server, container as never);
    listeners.get("unhandledRejection")?.(reason, Promise.resolve());

    expect(close).not.toHaveBeenCalled();
  };

  it("survives a socket hang up rejection instead of shutting down", () => {
    expectSurvives(new Error("socket hang up"));
  });

  it("survives a fetch failed rejection instead of shutting down", () => {
    expectSurvives(Object.assign(new Error("fetch failed"), { code: "" }));
  });

  it("survives an EPIPE rejection instead of shutting down", () => {
    expectSurvives(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
  });

  it("survives an ENETUNREACH rejection instead of shutting down", () => {
    expectSurvives(
      Object.assign(new Error("connect ENETUNREACH"), { code: "ENETUNREACH" }),
    );
  });

  it("does not trigger shutdown for operational rejections in classified mode", () => {
    const listeners = new Map<string, ProcessHandler>();
    vi.spyOn(process, "on").mockImplementation(((
      event: string,
      handler: ProcessHandler,
    ) => {
      listeners.set(event, handler);
      return process;
    }) as typeof process.on);

    const close = vi.fn();
    const server = { close } as unknown as Server;
    const container = {
      resolve: vi.fn(() => {
        throw new Error("not registered");
      }),
    };

    setupGracefulShutdown(server, container as never);
    const unhandled = listeners.get("unhandledRejection");
    expect(unhandled).toBeDefined();

    unhandled?.(
      new Error("poll timeout while checking provider status"),
      Promise.resolve(),
    );
    expect(close).not.toHaveBeenCalled();
  });

  it("triggers shutdown for fatal programmer errors in classified mode", () => {
    const listeners = new Map<string, ProcessHandler>();
    vi.spyOn(process, "on").mockImplementation(((
      event: string,
      handler: ProcessHandler,
    ) => {
      listeners.set(event, handler);
      return process;
    }) as typeof process.on);

    const close = vi.fn();
    const server = { close } as unknown as Server;
    const container = {
      resolve: vi.fn(() => {
        throw new Error("not registered");
      }),
    };

    setupGracefulShutdown(server, container as never);
    const unhandled = listeners.get("unhandledRejection");
    expect(unhandled).toBeDefined();

    unhandled?.(
      new TypeError("undefined is not a function"),
      Promise.resolve(),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("treats unknown/unclassified errors as fatal", () => {
    const listeners = new Map<string, ProcessHandler>();
    vi.spyOn(process, "on").mockImplementation(((
      event: string,
      handler: ProcessHandler,
    ) => {
      listeners.set(event, handler);
      return process;
    }) as typeof process.on);

    const close = vi.fn();
    const server = { close } as unknown as Server;
    const container = {
      resolve: vi.fn(() => {
        throw new Error("not registered");
      }),
    };

    setupGracefulShutdown(server, container as never);
    const unhandled = listeners.get("unhandledRejection");
    expect(unhandled).toBeDefined();

    // Generic error with no operational code or hint — must be treated as fatal
    unhandled?.(
      new Error("something completely unexpected"),
      Promise.resolve(),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("regression: server timeout configuration", () => {
  // Source-level invariant check: parse the timeout assignments from server.ts
  // to ensure the ordering constraint is maintained
  const serverSrc = readFileSync(
    resolve(__dirname, "../../server/src/server.ts"),
    "utf-8",
  );

  it("disables server.timeout (set to 0)", () => {
    const match = serverSrc.match(/server\.timeout\s*=\s*(\d+)/);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBe(0);
  });

  it("sets keepAliveTimeout to 125 seconds", () => {
    const match = serverSrc.match(/server\.keepAliveTimeout\s*=\s*(\d+)/);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBe(125000);
  });

  it("sets headersTimeout to 126 seconds", () => {
    const match = serverSrc.match(/server\.headersTimeout\s*=\s*(\d+)/);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBe(126000);
  });

  it("maintains the invariant: headersTimeout > keepAliveTimeout", () => {
    const headersMatch = serverSrc.match(/server\.headersTimeout\s*=\s*(\d+)/);
    const keepAliveMatch = serverSrc.match(
      /server\.keepAliveTimeout\s*=\s*(\d+)/,
    );
    expect(headersMatch).toBeTruthy();
    expect(keepAliveMatch).toBeTruthy();
    expect(Number(headersMatch![1])).toBeGreaterThan(
      Number(keepAliveMatch![1]),
    );
  });
});
