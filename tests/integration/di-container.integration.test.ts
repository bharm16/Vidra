import { describe, expect, it } from "vitest";
import { configureServices } from "@config/services.config";
import type { StorageService } from "@services/storage/StorageService";

/**
 * Tokens that MUST be registered in every environment (api or worker role,
 * convergence enabled or not). If a token in this list is missing from the
 * container, route registration silently 404s an entire namespace.
 *
 * Add a token here when its absence would cause a silent runtime regression
 * (typically: route registration uses container.resolve directly, or
 * resolveOptionalService is *not* the appropriate semantics).
 *
 * Do NOT add genuinely-optional services (e.g. continuitySessionService,
 * which legitimately resolves to null when ENABLE_CONVERGENCE=false).
 */
const REQUIRED_TOKENS = [
  "aiService",
  "cacheService",
  "spanLabelingCacheService",
  "promptOptimizationService",
  "enhancementService",
  "sceneDetectionService",
  "promptCoherenceService",
  "llmJudgeService",
  "userCreditService",
  "sessionService",
  "storageService",
  "gcsBucket",
  "imageObservationService",
  "assetService",
  // Conditionally-mounted in api.routes.ts:107-150 but expected to register
  // non-null whenever GCS is configured (which test setup guarantees).
  // Missing this silently 404s /api/reference-images.
  // consistentVideoService and modelIntelligenceService are correctly
  // *not* listed — they legitimately resolve to null when video provider
  // credentials are absent (FAL/Replicate/Luma keys), like
  // continuitySessionService under ENABLE_CONVERGENCE=false.
  "referenceImageRepository",
] as const;

describe("DI Container (integration)", () => {
  it("registers and resolves all configured services without throwing", async () => {
    const container = await configureServices();
    const serviceNames = container.getServiceNames();

    expect(serviceNames.length).toBeGreaterThan(0);

    for (const serviceName of serviceNames) {
      expect(() => container.resolve(serviceName)).not.toThrow();
    }
  }, 30_000);

  it("registers every must-register token (guards silent 404 class of bug)", async () => {
    const container = await configureServices();
    const registered = new Set(container.getServiceNames());

    const missing = REQUIRED_TOKENS.filter((token) => !registered.has(token));
    expect(missing).toEqual([]);

    // Each token must also resolve to a non-null instance — registering a
    // factory that returns null is the same failure mode for route consumers.
    for (const token of REQUIRED_TOKENS) {
      const instance = container.resolve(token);
      expect(instance, `${token} must resolve to a non-null instance`).not.toBe(
        null,
      );
      expect(
        instance,
        `${token} must resolve to a defined instance`,
      ).not.toBeUndefined();
    }
  }, 30_000);

  it("returns singleton instances for singleton registrations", async () => {
    const container = await configureServices();

    const logger1 = container.resolve("logger");
    const logger2 = container.resolve("logger");
    expect(logger1).toBe(logger2);
  });

  it("keeps continuity service resolvable when convergence is disabled", async () => {
    const previousEnableConvergence = process.env.ENABLE_CONVERGENCE;
    process.env.ENABLE_CONVERGENCE = "false";

    try {
      const container = await configureServices();
      const continuityService = container.resolve("continuitySessionService");
      expect(continuityService).toBeNull();
    } finally {
      if (previousEnableConvergence === undefined) {
        delete process.env.ENABLE_CONVERGENCE;
      } else {
        process.env.ENABLE_CONVERGENCE = previousEnableConvergence;
      }
    }
  });

  it("exercises real GCS storage boundary in CI", async () => {
    if (process.env.CI !== "true") {
      expect(true).toBe(true);
      return;
    }

    const container = await configureServices();
    const storageService = container.resolve<StorageService>("storageService");
    const userId = `api-key:ci-storage-user-${Date.now()}`;
    const otherUserId = `${userId}-other`;

    const saved = await storageService.saveFromBuffer(
      userId,
      Buffer.from("integration-image-bytes"),
      "preview-image",
      "image/png",
      { source: "integration-test" },
    );

    expect(saved.storagePath).toContain(`users/${userId}/previews/images/`);

    const view = await storageService.getViewUrl(userId, saved.storagePath);
    expect(view.storagePath).toBe(saved.storagePath);
    expect(view.viewUrl.length).toBeGreaterThan(0);

    await expect(
      storageService.getViewUrl(otherUserId, saved.storagePath),
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    await storageService.deleteFile(userId, saved.storagePath);
  }, 30_000);
});
