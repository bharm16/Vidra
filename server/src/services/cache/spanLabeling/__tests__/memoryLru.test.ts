import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryLruCache } from "../memoryLru";

describe("MemoryLruCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("edge cases", () => {
    it("evicts oldest entry when max size exceeded", () => {
      const cache = new MemoryLruCache(3);

      cache.set("key1", "value1", 60);
      cache.set("key2", "value2", 60);
      cache.set("key3", "value3", 60);
      cache.set("key4", "value4", 60); // Should evict key1

      expect(cache.get("key1")).toBeNull();
      expect(cache.get("key2")?.data).toBe("value2");
      expect(cache.get("key3")?.data).toBe("value3");
      expect(cache.get("key4")?.data).toBe("value4");
      expect(cache.size()).toBe(3);
    });

    it("moves accessed key to end (LRU behavior)", () => {
      const cache = new MemoryLruCache(3);

      cache.set("key1", "value1", 60);
      cache.set("key2", "value2", 60);
      cache.set("key3", "value3", 60);

      // Access key1, moving it to most recently used
      cache.get("key1");

      // Add new key, should evict key2 (now oldest)
      cache.set("key4", "value4", 60);

      expect(cache.get("key1")?.data).toBe("value1");
      expect(cache.get("key2")).toBeNull();
      expect(cache.get("key3")?.data).toBe("value3");
      expect(cache.get("key4")?.data).toBe("value4");
    });

    it("overwrites existing key", () => {
      const cache = new MemoryLruCache(10);

      cache.set("key", "value1", 60);
      cache.set("key", "value2", 60);

      expect(cache.get("key")?.data).toBe("value2");
      expect(cache.size()).toBe(1);
    });
  });

  describe("TTL behavior", () => {
    it("expires entry exactly at TTL boundary", () => {
      const cache = new MemoryLruCache(10);

      cache.set("key", "value", 60);
      vi.advanceTimersByTime(60000);

      expect(cache.get("key")).toBeNull();
    });

    it("maintains independent TTL for each entry", () => {
      const cache = new MemoryLruCache(10);

      cache.set("short", "short-value", 30);
      cache.set("long", "long-value", 120);

      vi.advanceTimersByTime(50000);

      expect(cache.get("short")).toBeNull();
      expect(cache.get("long")?.data).toBe("long-value");
    });
  });

  describe("cleanupExpired", () => {
    it("removes all expired entries", () => {
      const cache = new MemoryLruCache(10);

      cache.set("expires1", "value1", 30);
      cache.set("expires2", "value2", 30);
      cache.set("stays", "value3", 120);

      vi.advanceTimersByTime(50000);

      const removed = cache.cleanupExpired();

      expect(removed).toBe(2);
      expect(cache.size()).toBe(1);
      expect(cache.get("stays")?.data).toBe("value3");
    });
  });

  describe("core behavior", () => {
    it("delete removes existing entry", () => {
      const cache = new MemoryLruCache(10);

      cache.set("key", "value", 60);
      const deleted = cache.delete("key");

      expect(deleted).toBe(true);
      expect(cache.get("key")).toBeNull();
    });

    it("clear removes all entries", () => {
      const cache = new MemoryLruCache(10);

      cache.set("key1", "value1", 60);
      cache.set("key2", "value2", 60);
      cache.set("key3", "value3", 60);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get("key1")).toBeNull();
    });
  });
});
