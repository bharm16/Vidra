import * as firebaseBoundary from "@infrastructure/firebaseAdmin";
import { describe, expect, it, vi } from "vitest";
import { configureServices } from "@config/services.config";

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
});
