import * as firebaseBoundary from "@infrastructure/firebaseAdmin";
import { describe, expect, it, vi } from "vitest";
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
  "legacyCreditRefunder",
  "sessionService",
  "storageService",
  "gcsBucket",
  // Every store signs through this one minter; a missing registration would
  // take out image, video, convergence and reference-image URLs at once.
  "signedUrlMinter",
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

  it("keeps admission/runtime tokens and omits retired backend registrations", async () => {
    const container = await configureServices();
    const names = new Set(container.getServiceNames());
    for (const token of [
      "requestIdempotencyService",
      "videoJobStore",
      "imageAssetStore",
      "refundFailureStore",
      "legacyCreditRefunder",
    ]) {
      expect(names.has(token), token).toBe(true);
      expect(container.resolve(token)).not.toBeNull();
    }
    for (const token of [
      "assetService",
      "referenceImageRepository",
      "continuitySessionService",
      "convergenceStorageService",
      "paymentService",
      "userCreditService",
      "imageObservationService",
      "modelIntelligenceService",
      "videoJobSweeper",
      "dlqReprocessorWorker",
      "videoJobReconciler",
    ])
      expect(names.has(token), token).toBe(false);
  });

  it("provides startup attachment recovery without a generation provider", async () => {
    type QueryBoundary = {
      where(...args: unknown[]): QueryBoundary;
      orderBy(...args: unknown[]): QueryBoundary;
      limit(...args: unknown[]): QueryBoundary;
      get(): Promise<{ docs: [] }>;
    };
    const read = vi.fn(async (): Promise<{ docs: [] }> => ({ docs: [] }));
    const query: QueryBoundary = {
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      get: read,
    };
    const external = vi
      .spyOn(firebaseBoundary, "getFirestore")
      .mockReturnValue({
        collection: () => query,
      } as unknown as ReturnType<typeof firebaseBoundary.getFirestore>);
    try {
      const container = await configureServices();
      container.registerValue("videoGenerationService", null);
      expect(container.resolve("videoJobWorker")).toBeNull();
      const recover = container.resolve<() => Promise<void>>(
        "resumePendingVideoAttachments",
      );
      expect(typeof recover).toBe("function");
      await expect(recover()).resolves.toBeUndefined();
      expect(read).toHaveBeenCalledTimes(1);
    } finally {
      external.mockRestore();
    }
  });

  it("exercises real GCS storage boundary when one is configured", async (ctx) => {
    // Gate on the boundary actually existing, not on CI. `CI === "true"` says
    // nothing about whether a bucket and credentials are present, so in CI this
    // ran against real GCS with neither and failed on "The specified bucket
    // does not exist" — a red test reporting missing infrastructure, not a
    // defect. It also never ran locally, so nothing ever exercised it.
    const bucket = process.env.GCS_BUCKET_NAME;
    const credentials =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ??
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ??
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (!bucket || !credentials) {
      // A real skip, so the run reports it as skipped. The previous
      // `expect(true).toBe(true)` counted as a pass and hid that this
      // assertion had not executed.
      ctx.skip();
      return;
    }

    const container = await configureServices();
    const storageService = container.resolve<StorageService>("storageService");
    const userId = `api-key:ci-storage-user-${Date.now()}`;
    const otherUserId = `${userId}-other`;

    const saved = await storageService.uploadBuffer(
      userId,
      "preview-image",
      Buffer.from("integration-image-bytes"),
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
