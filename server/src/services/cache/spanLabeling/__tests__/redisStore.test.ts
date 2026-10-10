import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getRedisValue,
  setRedisValue,
  deleteRedisPattern,
} from "../redisStore";

function createMockRedis(status: string = "ready") {
  return {
    status,
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
  };
}

describe("getRedisValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("returns null when redis is not ready", async () => {
      const redis = createMockRedis("connecting");
      redis.get.mockResolvedValue("value");

      const result = await getRedisValue(redis, "key");

      expect(result).toBeNull();
      expect(redis.get).not.toHaveBeenCalled();
    });
  });
});

describe("setRedisValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("core behavior", () => {
    it("sets value with TTL when redis is ready", async () => {
      const redis = createMockRedis("ready");

      await setRedisValue(redis, "my-key", "my-value", 120);

      expect(redis.set).toHaveBeenCalledWith("my-key", "my-value", "EX", 120);
    });
  });
});

describe("deleteRedisPattern", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("core behavior", () => {
    it("deletes all matching keys", async () => {
      const redis = createMockRedis("ready");
      redis.keys.mockResolvedValue(["key1", "key2", "key3"]);
      redis.del.mockResolvedValue(3);

      const result = await deleteRedisPattern(redis, "span:*");

      expect(result).toBe(3);
      expect(redis.keys).toHaveBeenCalledWith("span:*");
      expect(redis.del).toHaveBeenCalledWith("key1", "key2", "key3");
    });

    it("returns 0 when no keys match pattern", async () => {
      const redis = createMockRedis("ready");
      redis.keys.mockResolvedValue([]);

      const result = await deleteRedisPattern(redis, "nonexistent:*");

      expect(result).toBe(0);
      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
