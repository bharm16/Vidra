import { sha256Hex } from "@utils/hash";
import { logger } from "@infrastructure/Logger";
import type { GenerateKeyOptions } from "./types.js";

/**
 * Semantic Cache Service
 *
 * Improves cache hit rates through intelligent normalization of cache keys.
 *
 * Previously located in utils/ - moved to services/cache/ as this is a stateful
 * service with complex business logic, not a simple utility function.
 */
export class SemanticCacheEnhancer {
  private static readonly log = logger.child({
    service: "SemanticCacheEnhancer",
  });

  /**
   * Generate normalized cache key with semantic awareness
   */
  static generateSemanticKey(
    namespace: string,
    data: Record<string, unknown>,
    options: GenerateKeyOptions = {},
  ): string {
    const operation = "generateSemanticKey";
    const {
      normalizeWhitespace = true,
      ignoreCase = true,
      sortKeys = true,
    } = options;

    this.log.debug("Generating semantic cache key", {
      operation,
      namespace,
      normalizeWhitespace,
      ignoreCase,
      sortKeys,
    });

    // Normalize the data for better semantic matching
    const normalized = this._normalizeData(data, {
      normalizeWhitespace,
      ignoreCase,
      sortKeys,
    });

    // Generate hash from normalized data
    const hash = sha256Hex(JSON.stringify(normalized), 16);

    const key = `${namespace}:semantic:${hash}`;

    this.log.debug("Semantic cache key generated", {
      operation,
      namespace,
      keyHash: hash,
    });

    return key;
  }

  /**
   * Normalize data for consistent caching
   */
  private static _normalizeData(
    data: unknown,
    options: GenerateKeyOptions,
  ): unknown {
    if (typeof data === "string") {
      return this._normalizeText(data, options);
    }

    if (Array.isArray(data)) {
      return data.map((item) => this._normalizeData(item, options));
    }

    if (data && typeof data === "object") {
      const normalized: Record<string, unknown> = {};
      const keys = options.sortKeys
        ? Object.keys(data).sort()
        : Object.keys(data);

      for (const key of keys) {
        normalized[key] = this._normalizeData(
          (data as Record<string, unknown>)[key],
          options,
        );
      }

      return normalized;
    }

    return data;
  }

  /**
   * Normalize text for semantic comparison
   */
  private static _normalizeText(
    text: string,
    options: GenerateKeyOptions = {},
  ): string {
    const { normalizeWhitespace = true, ignoreCase = true } = options;

    let normalized = text;

    if (ignoreCase) {
      normalized = normalized.toLowerCase();
    }

    if (normalizeWhitespace) {
      // Normalize whitespace
      normalized = normalized.replace(/\s+/g, " ").trim();

      // Normalize punctuation spacing
      normalized = normalized.replace(/\s*([.,!?;:])\s*/g, "$1 ");
    }

    // Remove common filler words that don't affect semantic meaning
    const fillers = [
      "please",
      "could you",
      "can you",
      "i want",
      "i'd like",
      "help me",
    ];

    for (const filler of fillers) {
      const regex = new RegExp(`\\b${filler}\\b`, "gi");
      normalized = normalized.replace(regex, "");
    }

    // Final cleanup
    normalized = normalized.replace(/\s+/g, " ").trim();

    return normalized;
  }
}
