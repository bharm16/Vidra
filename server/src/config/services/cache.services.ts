import type { DIContainer } from "@infrastructure/DIContainer";
import { CacheService } from "@services/cache/CacheService";
import { initSpanLabelingCache } from "@services/cache/SpanLabelingCacheService";
import type { ServiceConfig } from "./service-config.types.ts";

export function registerCacheServices(container: DIContainer): void {
  container.register("cacheService", () => new CacheService({}), []);

  container.register(
    "spanLabelingCacheService",
    (config: ServiceConfig) =>
      initSpanLabelingCache({
        defaultTTL: config.spanLabelingCache.defaultTTL,
        shortTTL: config.spanLabelingCache.shortTTL,
        maxMemoryCacheSize: config.spanLabelingCache.maxMemoryCacheSize,
      }),
    ["config"],
  );
}
