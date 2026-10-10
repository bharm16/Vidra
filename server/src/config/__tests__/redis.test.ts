import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redisCtorMock,
  connectMock,
  quitMock,
  disconnectMock,
  onMock,
  loggerMock,
} = vi.hoisted(() => ({
  redisCtorMock: vi.fn(),
  connectMock: vi.fn(),
  quitMock: vi.fn(),
  disconnectMock: vi.fn(),
  onMock: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: loggerMock,
}));

vi.mock("ioredis", () => {
  class FakeRedis {
    options: Record<string, unknown>;
    constructor(arg1: unknown, arg2?: unknown) {
      redisCtorMock(arg1, arg2);
      this.options = (arg2 || arg1 || {}) as Record<string, unknown>;
    }
    on(event: string, cb: (...args: unknown[]) => void) {
      onMock(event, cb);
      return this;
    }
    connect() {
      return connectMock();
    }
    quit() {
      return quitMock();
    }
    disconnect() {
      disconnectMock();
    }
  }

  return { default: FakeRedis };
});

import { closeRedisClient, createRedisClient } from "../redis";

describe("redis config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.REDIS_DISABLED;
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_DB;

    connectMock.mockResolvedValue(undefined);
    quitMock.mockResolvedValue("OK");
  });

  it("returns null when REDIS_DISABLED=true", () => {
    process.env.REDIS_DISABLED = "true";

    const redis = createRedisClient();

    expect(redis).toBeNull();
    expect(redisCtorMock).not.toHaveBeenCalled();
  });

  it("returns null when no REDIS_URL or REDIS_HOST is set", () => {
    const redis = createRedisClient();

    expect(redis).toBeNull();
    expect(redisCtorMock).not.toHaveBeenCalled();
  });

  it("closes redis client gracefully via quit", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const redis = createRedisClient();

    await closeRedisClient(redis);

    expect(quitMock).toHaveBeenCalledTimes(1);
    expect(disconnectMock).not.toHaveBeenCalled();
  });

  it("forces disconnect when quit fails", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const redis = createRedisClient();
    quitMock.mockRejectedValueOnce(new Error("quit failed"));

    await closeRedisClient(redis);

    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });
});
