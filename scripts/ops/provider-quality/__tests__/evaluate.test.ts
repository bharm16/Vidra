import { describe, expect, it, vi } from "vitest";
import { ReplicateStudioImageRunner } from "../../../../server/src/services/studio/providers/ReplicateStudioImageRunner";
import { StudioModelRegistry } from "../../../../server/src/services/studio/StudioModelRegistry";
import { evaluateProviderContracts } from "../evaluate";
import { withOfflineProviderTransport } from "../transport";

describe("provider quality offline harness", () => {
  it("captures supported adapter requests while keeping live and quality acceptance pending", async () => {
    const originalFetch = globalThis.fetch;
    const report = await evaluateProviderContracts("fixture-revision");
    expect(globalThis.fetch).toBe(originalFetch);
    expect(report.verdict).toBe("contract-passed-live-pending");
    const failures = report.paths.filter((path) => path.contract === "failed");
    expect(failures).toEqual([]);
    expect(
      report.paths.filter((path) => path.contract === "passed").length,
    ).toBeGreaterThan(60);
    expect(
      report.paths.every(
        (path) =>
          path.live === "not-verified" && path.quality === "not-evaluated",
      ),
    ).toBe(true);
    const excluded = report.paths.filter((path) => path.contract === "not-run");
    expect(excluded.map((path) => path.model).sort()).toEqual([
      "kling-v2-1-master",
      "luma-ray3",
      "sora-2",
      "sora-2-pro",
    ]);
    expect(
      excluded.every(
        (path) =>
          path.configuration.releaseSupport === "excluded" &&
          path.submitted.length === 0,
      ),
    ).toBe(true);
    expect(
      report.paths
        .flatMap((path) => path.submitted)
        .every(
          (request) =>
            request.model !== "kling-v2-1-master" && request.model !== "ray-2",
        ),
    ).toBe(true);
    const edit = report.paths.find(
      (path) => path.id === "studio/edit/nano-banana-2",
    );
    expect(edit?.submitted).toEqual([
      {
        model: "google/nano-banana-2",
        input: {
          prompt: expect.stringContaining("Change only"),
          image_input: [expect.stringContaining("source.png")],
          output_format: "png",
          resolution: "1K",
        },
      },
    ]);
    const motion = report.paths.find(
      (path) => path.id === "video/wan-video/wan-2.2-t2v-fast/i2v/9:16",
    );
    expect(motion?.submitted[0]).toMatchObject({
      model: "wan-video/wan-2.2-i2v-fast",
      input: {
        size: "720*1280",
        prompt_extend: false,
        seed: 20261003,
        image: expect.stringContaining("source.png"),
      },
    });
  });

  it("refuses any unrecognized network boundary and restores fetch on error", async () => {
    const originalFetch = globalThis.fetch;
    await expect(
      withOfflineProviderTransport(async (): Promise<void> => {
        await fetch("https://example.com/paid-provider");
      }),
    ).rejects.toThrow("refused unexpected request");
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it("rejects concurrent runs instead of allowing one guard to restore another guard's fetch", async () => {
    await withOfflineProviderTransport(async (): Promise<void> => {
      await expect(
        withOfflineProviderTransport(async (): Promise<void> => {}),
      ).rejects.toThrow("serially");
    });
  });

  it("times out a processing studio prediction at the configured public polling deadline", async () => {
    vi.useFakeTimers();
    try {
      await withOfflineProviderTransport(async (transport): Promise<void> => {
        transport.status = "processing";
        const registry = new StudioModelRegistry();
        const timeoutMs = registry.timeoutMsFor("recraft-v4.1");
        expect(timeoutMs).toBe(60_000);
        const runner = new ReplicateStudioImageRunner({
          apiToken: "offline-quality-fixture-token",
        });
        const settled = runner
          .run({
            model: "recraft-ai/recraft-v4.1",
            input: { prompt: "fixture", aspect_ratio: "1:1" },
            timeoutMs,
            userId: "quality-fixture",
          })
          .then(
            () => undefined,
            (error: unknown) => error,
          );
        await vi.advanceTimersByTimeAsync(timeoutMs);
        expect(await settled).toMatchObject({
          message: expect.stringContaining("timed out after 60000ms"),
          statusCode: 500,
        });
        expect(transport.received).toHaveLength(1);
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
