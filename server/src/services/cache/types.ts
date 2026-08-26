/**
 * Types for cache services
 * Shared type definitions used across cache service modules
 */

/**
 * Cache key generation options
 */
export interface GenerateKeyOptions {
  useSemantic?: boolean;
  normalizeWhitespace?: boolean;
  ignoreCase?: boolean;
  sortKeys?: boolean;
}

/**
 * Logger interface (minimal)
 */
export interface Logger {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, error?: Error) => void;
}

/**
 * Redis client interface (minimal)
 */
export interface RedisClient {
  status?: string;
  get?: (key: string) => Promise<string | null>;
  set?: (
    ...args: [string, string | number, ...(string | number)[]]
  ) => Promise<unknown>;
  del?: (...keys: string[]) => Promise<number>;
  keys?: (pattern: string) => Promise<string[]>;
}

/**
 * Span labeling cache service options
 */
export interface SpanLabelingCacheServiceOptions {
  redis?: RedisClient | null;
  defaultTTL?: number;
  shortTTL?: number;
  maxMemoryCacheSize?: number;
}

/**
 * Cache entry in memory cache
 */
export interface MemoryCacheEntry {
  data: unknown;
  expiresAt: number;
}

/**
 * Span labeling cache statistics
 */
export interface SpanLabelingCacheStats {
  hits: number;
  misses: number;
  sets: number;
  errors: number;
  hitRate: string;
  cacheSize: number;
  redisConnected: boolean;
}

/**
 * Span labeling policy (minimal type)
 */
export interface SpanLabelingPolicy {
  [key: string]: unknown;
}
