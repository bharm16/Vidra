import * as firebaseBoundary from "@infrastructure/firebaseAdmin";
import { describe, expect, it, vi } from "vitest";
import { configureServices } from "@config/services.config";
import type { StorageService } from "@services/storage/StorageService";

describe("DI Container (integration)", () => {
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
