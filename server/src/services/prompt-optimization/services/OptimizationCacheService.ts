import type { CacheService } from "@services/cache/CacheService";
import OptimizationConfig from "@config/OptimizationConfig";
import type {
  LockedSpan,
  ShotPlan,
  StructuredOptimizationArtifact,
} from "../types";
import { OptimizationMode, InferredContext } from "../types";
import { sha256Hex } from "@utils/hash";
import { logger } from "@infrastructure/Logger";

export class OptimizationCacheService {
  private readonly cacheConfig: { ttl: number; namespace: string };
  private readonly log = logger.child({ service: "OptimizationCacheService" });

  constructor(private readonly cacheService: CacheService) {
    this.cacheConfig = this.cacheService.getConfig(
      OptimizationConfig.cache.promptOptimization,
    );
  }

  async getCachedResult(key: string): Promise<string | null> {
    return this.cacheService.get<string>(key, "optimization");
  }

  async getCachedMetadata(
    key: string,
  ): Promise<Record<string, unknown> | null> {
    const metaKey = this.buildMetadataCacheKey(key);
    return this.cacheService.get<Record<string, unknown>>(
      metaKey,
      "optimization_metadata",
    );
  }

  async getStructuredArtifact(
    key: string,
  ): Promise<StructuredOptimizationArtifact | null> {
    return this.cacheService.get<StructuredOptimizationArtifact>(
      key,
      "optimization_artifact",
    );
  }

  /**
   * Fetch a cached optimization result, or run `compute` exactly once across
   * concurrent callers and cache the produced value. Single-flight coalescing
   * prevents duplicate LLM calls when multiple identical /api/optimize
   * requests land in the same burst.
   */
  async getOrComputeResult(
    key: string,
    compute: () => Promise<string>,
  ): Promise<{ value: string; source: "cache" | "computed" | "coalesced" }> {
    return this.cacheService.getOrCompute<string>(key, compute, {
      ttl: this.cacheConfig.ttl,
      cacheType: "optimization",
    });
  }

  async cacheResult(
    key: string,
    result: string,
    metadata?: Record<string, unknown> | null,
  ): Promise<void> {
    await this.cacheService.set(key, result, this.cacheConfig);
    if (metadata) {
      const metaKey = this.buildMetadataCacheKey(key);
      await this.cacheService.set(metaKey, metadata, this.cacheConfig);
    }
  }

  async cacheStructuredArtifact(
    key: string,
    artifact: StructuredOptimizationArtifact,
  ): Promise<void> {
    await this.cacheService.set(key, artifact, this.cacheConfig);
  }

  buildCacheKey(
    prompt: string,
    mode: OptimizationMode,
    context: InferredContext | null,
    brainstormContext: Record<string, unknown> | null,
    targetModel?: string,
    generationParams?: Record<string, unknown> | null,
    lockedSpans?: LockedSpan[],
  ): string {
    const lockedSpanSignature = this.buildLockedSpanSignature(lockedSpans);
    const generationSignature =
      this.buildGenerationParamsSignature(generationParams);
    const promptHash = sha256Hex(prompt, 16);
    const parts = [
      "prompt-opt-v4",
      mode,
      targetModel || "generic",
      promptHash,
      context ? OptimizationCacheService.stableStringify(context) : "",
      brainstormContext
        ? OptimizationCacheService.stableStringify(brainstormContext)
        : "",
      generationSignature,
    ];
    if (lockedSpanSignature) {
      parts.push(`locked:${lockedSpanSignature}`);
    }
    return parts.join("::");
  }

  buildStructuredArtifactKey(genericPrompt: string): string {
    return this.buildStructuredArtifactKeyFromInputs({
      prompt: genericPrompt,
      sourcePrompt: genericPrompt,
    });
  }

  buildStructuredArtifactKeyFromInputs(params: {
    prompt: string;
    sourcePrompt?: string | null;
    shotPlan?: ShotPlan | null;
    generationParams?: Record<string, unknown> | null;
    lockedSpans?: LockedSpan[];
  }): string {
    const normalizedPayload = {
      prompt: params.prompt.trim(),
      sourcePrompt: params.sourcePrompt?.trim() ?? "",
      shotPlan: params.shotPlan
        ? this.normalizeShotPlan(params.shotPlan)
        : null,
      generationParams: this.normalizeGenerationParams(params.generationParams),
      lockedSpans: this.normalizeLockedSpans(params.lockedSpans),
    };
    // stableStringify (sorted keys at every depth) is required here for the
    // same reason as in buildOptimizationCacheKey: insertion-order differences
    // in nested objects (per-shot details inside shotPlan, generationParams
    // values, etc.) would otherwise hash to different keys for semantically
    // identical inputs. normalizeShotPlan above only sorts the top level, so
    // it would not cover nested cases on its own.
    const promptHash = sha256Hex(
      OptimizationCacheService.stableStringify(normalizedPayload),
      24,
    );

    return ["prompt-opt-v5", "structured-artifact", promptHash].join("::");
  }

  private buildMetadataCacheKey(baseKey: string): string {
    return `${baseKey}::meta`;
  }

  /**
   * Deterministic JSON.stringify with sorted object keys at every depth.
   * Two semantically equal objects with different insertion order produce the
   * same string — required for cache keys, otherwise `{a:1,b:2}` and
   * `{b:2,a:1}` collide-miss as different entries.
   */
  private static stableStringify(value: unknown): string {
    return JSON.stringify(value, (_key, val) => {
      if (val && typeof val === "object" && !Array.isArray(val)) {
        const obj = val as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(obj).sort()) {
          sorted[k] = obj[k];
        }
        return sorted;
      }
      return val;
    });
  }

  private buildLockedSpanSignature(lockedSpans?: LockedSpan[]): string {
    if (!lockedSpans || lockedSpans.length === 0) {
      return "";
    }
    const payload = lockedSpans.map((span) => ({
      text: span.text,
      leftCtx: span.leftCtx ?? null,
      rightCtx: span.rightCtx ?? null,
    }));
    return sha256Hex(JSON.stringify(payload), 16);
  }

  private buildGenerationParamsSignature(
    params?: Record<string, unknown> | null,
  ): string {
    if (!params || typeof params !== "object") {
      return "";
    }
    const sortedEntries = Object.keys(params)
      .sort()
      .map((key) => [key, (params as Record<string, unknown>)[key]]);
    return JSON.stringify(sortedEntries);
  }

  private normalizeShotPlan(shotPlan: ShotPlan): Record<string, unknown> {
    return Object.keys(shotPlan)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = (shotPlan as unknown as Record<string, unknown>)[key];
        return acc;
      }, {});
  }

  private normalizeGenerationParams(
    params?: Record<string, unknown> | null,
  ): Array<[string, unknown]> {
    if (!params || typeof params !== "object") {
      return [];
    }

    return Object.keys(params)
      .sort()
      .map((key) => [key, params[key]]);
  }

  private normalizeLockedSpans(
    lockedSpans?: LockedSpan[],
  ): Array<Record<string, unknown>> {
    if (!lockedSpans || lockedSpans.length === 0) {
      return [];
    }

    return lockedSpans.map((span) => ({
      text: span.text,
      leftCtx: span.leftCtx ?? null,
      rightCtx: span.rightCtx ?? null,
      category: span.category ?? null,
      source: span.source ?? null,
      confidence: span.confidence ?? null,
    }));
  }
}
