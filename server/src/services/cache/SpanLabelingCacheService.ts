import { logger } from "@infrastructure/Logger";
import type {
  SpanLabelingCacheServiceOptions,
  SpanLabelingCacheStats,
  SpanLabelingPolicy,
} from "./types";
import { MemoryLruCache } from "./spanLabeling/memoryLru";
import {
  generateCacheKey,
  buildTextPattern,
  buildTextPrefix,
} from "./spanLabeling/key";
import { runSingleFlight } from "./singleFlight";

/**
 * SpanLabelingCacheService - Server-side caching for span labeling results
 *
 * Implements an in-memory cache-aside pattern to reduce OpenAI API calls by
 * 70-90%. Provides fast (<5ms) retrieval for cached results.
 *
 * Features:
 * - TTL-based expiration (1 hour for exact matches, 5 min for similar texts)
 * - Cache key based on text hash + policy + template version
 * - LRU eviction for in-memory cache
 *
 * @example
 * const cacheService = new SpanLabelingCacheService();
 * const cached = await cacheService.get(text, policy, templateVersion);
 * if (!cached) {
 *   const result = await openAI.labelSpans(text);
 *   await cacheService.set(text, policy, templateVersion, result);
 * }
 */
export class SpanLabelingCacheService {
  private readonly defaultTTL: number;
  private readonly shortTTL: number;
  private readonly maxMemoryCacheSize: number;
  private readonly memoryCache: MemoryLruCache;
  private readonly stats: {
    hits: number;
    misses: number;
    sets: number;
    errors: number;
  };
  private readonly inflight = new Map<string, Promise<unknown>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: SpanLabelingCacheServiceOptions = {}) {
    this.defaultTTL = options.defaultTTL || 3600; // 1 hour
    this.shortTTL = options.shortTTL || 300; // 5 minutes
    this.maxMemoryCacheSize = options.maxMemoryCacheSize || 100;

    // In-memory cache (LRU)
    this.memoryCache = new MemoryLruCache(this.maxMemoryCacheSize);

    // Metrics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      errors: 0,
    };

    logger.info("SpanLabelingCacheService initialized", {
      defaultTTL: this.defaultTTL,
      shortTTL: this.shortTTL,
      maxMemoryCacheSize: this.maxMemoryCacheSize,
    });
  }

  /**
   * Get cached span labeling result
   */
  async get(
    text: string,
    policy: SpanLabelingPolicy | null,
    templateVersion: string | null,
    provider: string | null = null,
  ): Promise<unknown | null> {
    const startTime = Date.now();
    const cacheKey = generateCacheKey(text, policy, templateVersion, provider);

    try {
      const cacheEntry = this.memoryCache.get(cacheKey);
      if (cacheEntry) {
        this.stats.hits++;

        const duration = Date.now() - startTime;
        logger.debug("Cache hit (memory)", {
          cacheKey,
          duration,
          textLength: text.length,
        });

        return cacheEntry.data;
      }

      // Cache miss
      this.stats.misses++;

      const duration = Date.now() - startTime;
      logger.debug("Cache miss", {
        cacheKey,
        duration,
        textLength: text.length,
      });

      return null;
    } catch (error) {
      this.stats.errors++;
      logger.error("Cache get error", error as Error, { cacheKey });
      return null;
    }
  }

  /**
   * Set cached span labeling result
   */
  async set(
    text: string,
    policy: SpanLabelingPolicy | null,
    templateVersion: string | null,
    result: unknown,
    options: { ttl?: number; provider?: string | null } = {},
  ): Promise<boolean> {
    const cacheKey = generateCacheKey(
      text,
      policy,
      templateVersion,
      options.provider ?? null,
    );
    const ttl = options.ttl || this.defaultTTL;

    try {
      // Set in memory cache (with LRU eviction)
      this.memoryCache.set(cacheKey, result, ttl);

      this.stats.sets++;
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error("Cache set error", error as Error, { cacheKey });
      return false;
    }
  }

  /**
   * Get from cache or compute + store with single-flight coalescing.
   *
   * When N concurrent callers miss the same key, `compute` is invoked exactly
   * once and all callers await the same result. Prevents thundering-herd
   * LLM calls for identical inputs.
   */
  async getOrCompute<T>(
    text: string,
    policy: SpanLabelingPolicy | null,
    templateVersion: string | null,
    compute: () => Promise<T>,
    options: { ttl?: number; provider?: string | null } = {},
  ): Promise<{ value: T; source: "cache" | "computed" | "coalesced" }> {
    const provider = options.provider ?? null;
    const cached = (await this.get(
      text,
      policy,
      templateVersion,
      provider,
    )) as T | null;
    if (cached !== null) {
      return { value: cached, source: "cache" };
    }

    const inflightKey = generateCacheKey(
      text,
      policy,
      templateVersion,
      provider,
    );

    return runSingleFlight(this.inflight, inflightKey, async () => {
      const computed = await compute();
      await this.set(text, policy, templateVersion, computed, options);
      return computed;
    });
  }

  /**
   * Invalidate cache for specific text
   */
  async invalidate(
    text: string,
    policy: SpanLabelingPolicy | null = null,
    templateVersion: string | null = null,
  ): Promise<number> {
    if (policy && templateVersion) {
      // Invalidate specific cache entry
      const cacheKey = generateCacheKey(text, policy, templateVersion);

      try {
        const deletedCount = this.memoryCache.delete(cacheKey) ? 1 : 0;

        logger.debug("Cache invalidated", { cacheKey, deletedCount });
        return deletedCount;
      } catch (error) {
        logger.error("Cache invalidation error", error as Error, { cacheKey });
        return 0;
      }
    }

    const pattern = buildTextPattern(text);
    const prefix = buildTextPrefix(text);

    try {
      let deletedCount = 0;
      for (const key of this.memoryCache.keys()) {
        if (key.startsWith(prefix)) {
          this.memoryCache.delete(key);
          deletedCount++;
        }
      }

      logger.debug("Cache invalidated (pattern)", { pattern, deletedCount });
      return deletedCount;
    } catch (error) {
      logger.error("Cache invalidation error (pattern)", error as Error, {
        pattern,
      });
      return 0;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<boolean> {
    try {
      this.memoryCache.clear();

      logger.info("Cache cleared");
      return true;
    } catch (error) {
      logger.error("Cache clear error", error as Error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): SpanLabelingCacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      ...this.stats,
      hitRate: hitRate.toFixed(2) + "%",
      cacheSize: this.memoryCache.size(),
    };
  }

  /**
   * Clean up expired entries from memory cache
   */
  private _cleanupExpired(): void {
    const removedCount = this.memoryCache.cleanupExpired();

    if (removedCount > 0) {
      logger.debug("Cleaned up expired cache entries", {
        count: removedCount,
      });
    }
  }

  /**
   * Start periodic cleanup of expired entries
   */
  startPeriodicCleanup(intervalMs: number = 60000): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this._cleanupExpired();
    }, intervalMs);

    logger.info("Started periodic cache cleanup", { intervalMs });
  }

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info("Stopped periodic cache cleanup");
    }
  }
}

// Singleton instance (initialized by the DI container)
export let spanLabelingCache: SpanLabelingCacheService | null = null;

/**
 * Initialize the span labeling cache service
 */
export function initSpanLabelingCache(
  options: SpanLabelingCacheServiceOptions = {},
): SpanLabelingCacheService {
  spanLabelingCache = new SpanLabelingCacheService(options);
  spanLabelingCache.startPeriodicCleanup();
  return spanLabelingCache;
}
