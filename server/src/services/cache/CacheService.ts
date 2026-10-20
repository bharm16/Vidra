import NodeCache from "node-cache";
import { sha256Hex } from "@utils/hash";
import { logger } from "@infrastructure/Logger";
import type { ILogger } from "@interfaces/ILogger";
import { SemanticCacheEnhancer } from "./SemanticCacheService.js";
import { runSingleFlight } from "./singleFlight.js";

/**
 * Cache service for storing API responses.
 * Instances should be created via the DI container
 * (see server/src/config/services/infrastructure.services.ts).
 */

interface CacheConfig {
  defaultTTL?: number;
  maxKeys?: number;
  promptOptimization?: { ttl: number; namespace: string };
  questionGeneration?: { ttl: number; namespace: string };
  enhancement?: { ttl: number; namespace: string };
  sceneDetection?: { ttl: number; namespace: string };
  creative?: { ttl: number; namespace: string };
  [key: string]: unknown;
}

// Bounds in-memory cache growth. At ~2 KB per entry (typical for span-labeling
// and optimization results), 50k keys ≈ 100 MB RSS ceiling — well below the
// 512 MB container budget. Override via CacheConfig.maxKeys for larger pods.
const DEFAULT_MAX_KEYS = 50_000;

interface CacheOptions {
  ttl?: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  hitRate: string;
  keys: number;
  size: NodeCache.Stats;
}

interface GenerateKeyOptions {
  useSemantic?: boolean;
  normalizeWhitespace?: boolean;
  ignoreCase?: boolean;
  sortKeys?: boolean;
}

interface HealthCheckResult {
  healthy: boolean;
  stats?: CacheStats;
  error?: string;
}

/**
 * Cache service for storing API responses
 * Reduces external API calls and improves response times
 */
export class CacheService {
  private readonly cache: NodeCache;
  private readonly stats: {
    hits: number;
    misses: number;
    sets: number;
  };
  private readonly config: CacheConfig;
  private readonly log: ILogger;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(config: CacheConfig = {}) {
    this.log = logger.child({ service: "CacheService" });

    this.cache = new NodeCache({
      stdTTL: config.defaultTTL || 3600, // Default 1 hour
      checkperiod: 600, // Check for expired keys every 10 minutes
      useClones: false, // Don't clone data (better performance)
      maxKeys: config.maxKeys ?? DEFAULT_MAX_KEYS,
    });

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
    };

    this.config = {
      promptOptimization: { ttl: 3600, namespace: "prompt" },
      questionGeneration: { ttl: 1800, namespace: "questions" },
      enhancement: { ttl: 3600, namespace: "enhancement" },
      sceneDetection: { ttl: 3600, namespace: "scene" },
      creative: { ttl: 7200, namespace: "creative" },
      ...config,
    };

    // Log cache events
    this.cache.on("expired", (key: string) => {
      this.log.debug("Cache key expired", {
        operation: "expired",
        key,
      });
    });

    this.log.info("Cache service initialized", {
      operation: "constructor",
      defaultTTL: config.defaultTTL || 3600,
    });
  }

  /**
   * Generate cache key from data
   * @param namespace - Cache namespace
   * @param data - Data to hash
   * @param options - Options for semantic caching
   * @returns Cache key
   */
  generateKey(
    namespace: string,
    data: unknown,
    options: GenerateKeyOptions = {},
  ): string {
    const {
      useSemantic = true,
      normalizeWhitespace = true,
      ignoreCase = true,
      sortKeys = true,
    } = options;

    // Use semantic caching by default for better hit rates
    if (useSemantic) {
      return SemanticCacheEnhancer.generateSemanticKey(
        namespace,
        data as Record<string, unknown>,
        {
          normalizeWhitespace,
          ignoreCase,
          sortKeys,
        },
      );
    }

    // Fallback to standard hashing
    const hash = sha256Hex(JSON.stringify(data), 16);

    return `${namespace}:${hash}`;
  }

  /**
   * Get value from cache
   * @param key - Cache key
   * @param cacheType - Type of cache, for logs
   * @returns Cached value or null
   */
  async get<T = unknown>(
    key: string,
    cacheType: string = "default",
  ): Promise<T | null> {
    const value = this.cache.get<T>(key);

    if (value !== undefined) {
      this.stats.hits++;

      logger.debug("Cache hit", { key, cacheType });
      return value;
    }

    this.stats.misses++;

    logger.debug("Cache miss", { key, cacheType });
    return null;
  }

  /**
   * Set value in cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param options - Cache options
   * @returns Success status
   */
  async set<T = unknown>(
    key: string,
    value: T,
    options: CacheOptions = {},
  ): Promise<boolean> {
    const startTime = performance.now();
    const operation = "set";
    const ttl = options.ttl || this.cache.options.stdTTL || 3600;

    // NodeCache throws "Cache max keys amount exceeded" when maxKeys is bounded
    // and the cache is full. Callers (OptimizationCacheService, EnhancementService,
    // etc.) treat .set() as best-effort and await without try/catch — swallow the
    // throw here and return false so the set() contract stays {boolean}.
    let success = false;
    try {
      success = this.cache.set(key, value, ttl);
    } catch (error) {
      this.log.warn("Cache set rejected (likely full)", {
        operation,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }

    const duration = Math.round(performance.now() - startTime);
    if (success) {
      this.stats.sets++;
      this.log.debug("Cache set", {
        operation,
        duration,
        key,
        ttl,
      });
    } else {
      this.log.warn("Cache set failed", {
        operation,
        duration,
        key,
      });
    }

    return success;
  }

  /**
   * Get from cache or compute + store, with single-flight coalescing.
   *
   * When N concurrent callers miss the same key, `compute` is invoked exactly
   * once and all callers await the same result. Prevents thundering-herd
   * external calls (LLM, HTTP, DB) for identical inputs.
   *
   * The `source` field tells the caller which path produced the value:
   * - `cache`: returned directly from a hit
   * - `computed`: this caller invoked `compute` and populated the cache
   * - `coalesced`: another caller's in-flight compute satisfied this request
   *
   * `setOptions.cacheType` labels the hit/miss logs.
   */
  async getOrCompute<T>(
    key: string,
    compute: () => Promise<T>,
    setOptions: CacheOptions & { cacheType?: string } = {},
  ): Promise<{ value: T; source: "cache" | "computed" | "coalesced" }> {
    const cacheType = setOptions.cacheType ?? "default";
    const cached = await this.get<T>(key, cacheType);
    if (cached !== null) {
      return { value: cached, source: "cache" };
    }

    return runSingleFlight(this.inflight, key, async () => {
      const computed = await compute();
      const writeOptions: CacheOptions = {};
      if (setOptions.ttl !== undefined) {
        writeOptions.ttl = setOptions.ttl;
      }
      await this.set(key, computed, writeOptions);
      return computed;
    });
  }

  /**
   * Delete value from cache
   * @param key - Cache key
   * @returns Number of deleted keys
   */
  async delete(key: string): Promise<number> {
    const startTime = performance.now();
    const operation = "delete";
    const deleted = this.cache.del(key);
    const duration = Math.round(performance.now() - startTime);

    if (deleted > 0) {
      this.log.debug("Cache key deleted", {
        operation,
        duration,
        key,
      });
    }
    return deleted;
  }

  /**
   * Clear all cache
   */
  async flush(): Promise<void> {
    const startTime = performance.now();
    const operation = "flush";
    this.cache.flushAll();
    const duration = Math.round(performance.now() - startTime);

    this.log.info("Cache flushed", {
      operation,
      duration,
    });
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    const hitRate =
      this.stats.hits + this.stats.misses > 0
        ? this.stats.hits / (this.stats.hits + this.stats.misses)
        : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      hitRate: (hitRate * 100).toFixed(2) + "%",
      keys: this.cache.keys().length,
      size: this.cache.getStats(),
    };
  }

  /**
   * Check if cache is healthy
   */
  isHealthy(): HealthCheckResult {
    const startTime = performance.now();
    const operation = "isHealthy";

    try {
      const testKey = "health-check";
      this.cache.set(testKey, "ok", 1);
      const value = this.cache.get<string>(testKey);
      this.cache.del(testKey);

      const duration = Math.round(performance.now() - startTime);
      this.log.debug("Cache health check completed", {
        operation,
        duration,
        healthy: value === "ok",
      });

      return {
        healthy: value === "ok",
        stats: this.getCacheStats(),
      };
    } catch (error: unknown) {
      const duration = Math.round(performance.now() - startTime);
      this.log.error(
        "Cache health check failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation,
          duration,
        },
      );
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get cache configuration for a specific type
   */
  getConfig(type: string): { ttl: number; namespace: string } {
    const config = this.config[type] as
      | { ttl: number; namespace: string }
      | undefined;
    return (
      config || { ttl: this.cache.options.stdTTL || 3600, namespace: "default" }
    );
  }
}

// CacheService instances should be created via the DI container
// (see server/src/config/services/infrastructure.services.ts)
