import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletionLedger } from "../completionLedger";
import { COMPLETION_PLANS } from "../completionPlan";
import {
  completionFetchGuard,
  redactCompletionEvidence,
  loadCompletionCredentials,
} from "../liveCompletion";

const directories: string[] = [];
function directory(): string {
  const value = mkdtempSync(join(tmpdir(), "vidra-completion-ledger-test-"));
  directories.push(value);
  return value;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const value of directories.splice(0))
    rmSync(value, { recursive: true, force: true });
});

describe("one-completion paid dispatch ledger", () => {
  it("uses the production fal resolver when FAL_KEY is an unexpanded template", () => {
    vi.stubEnv("FAL_KEY", "${FAL_KEY_ID}:${FAL_KEY_SECRET}");
    vi.stubEnv("FAL_API_KEY", "existing-configured-fixture-key");
    expect(loadCompletionCredentials().fal).toBe(
      "existing-configured-fixture-key",
    );
  });
  it("limits an explicitly allocated correction ledger to its one declared provider", () => {
    const plan = COMPLETION_PLANS[0];
    const other = COMPLETION_PLANS[1];
    if (!plan || !other) throw new Error("Missing completion plans");
    const ledger = new CompletionLedger(directory(), 2, [plan]);
    expect(ledger.claim(plan)).toBe(true);
    expect(() => ledger.claim(other)).toThrow("Undeclared");
  });
  it("reserves187 cents, rejects insufficient/raised allocations, and survives restart claims", () => {
    const path = directory();
    expect(() => new CompletionLedger(path, 100)).toThrow("187");
    expect(() => new CompletionLedger(path, 401)).toThrow("400");
    const ledger = new CompletionLedger(path, 200);
    const plan = COMPLETION_PLANS[0];
    if (!plan) throw new Error("Missing fal plan");
    expect(ledger.claim(plan)).toBe(true);
    expect(new CompletionLedger(path, 200).claim(plan)).toBe(false);
    expect(() => new CompletionLedger(path, 400)).toThrow("differs");
    expect(
      JSON.parse(readFileSync(join(path, "allocation.json"), "utf8")),
    ).toMatchObject({ reservedCents: 187 });
  });

  it("records the dispatch before fetch and refuses SDK paid retries", async () => {
    const path = directory();
    const ledger = new CompletionLedger(path, 200);
    const plan = COMPLETION_PLANS.find((entry) => entry.provider === "google");
    if (!plan) throw new Error("Missing Google plan");
    ledger.claim(plan);
    const external = vi.fn(async (): Promise<Response> => {
      expect(
        readFileSync(join(path, "google.dispatch.json"), "utf8"),
      ).toContain("durationSeconds");
      return Response.json({ name: "operation-1" });
    });
    const guarded = completionFetchGuard(plan, ledger, external);
    const init = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": "fixture-secret",
      },
      body: JSON.stringify({
        instances: [{ prompt: "fixture" }],
        parameters: {
          durationSeconds: 4,
          resolution: "720p",
          aspectRatio: "16:9",
        },
      }),
    };
    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning";
    await guarded(endpoint, init);
    await expect(guarded(endpoint, init)).rejects.toThrow("Second paid POST");
    expect(external).toHaveBeenCalledTimes(1);
    expect(
      readFileSync(join(path, "google.dispatch.json"), "utf8"),
    ).not.toContain("fixture-secret");
  });

  it("refuses an unreserved, off-plan or over-cost POST before touching the provider", async () => {
    const ledger = new CompletionLedger(directory(), 200);
    const plan = COMPLETION_PLANS.find((entry) => entry.provider === "google");
    if (!plan) throw new Error("Missing Google plan");
    const external = vi.fn(async (): Promise<Response> => Response.json({}));
    const guarded = completionFetchGuard(plan, ledger, external);
    await expect(
      guarded("https://other-provider.example/generate", {
        method: "POST",
        body: "{}",
      }),
    ).rejects.toThrow("Unallocated");
    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning";
    await expect(
      guarded(endpoint, {
        method: "POST",
        body: JSON.stringify({
          instances: [{}],
          parameters: {
            durationSeconds: 8,
            resolution: "720p",
            aspectRatio: "16:9",
          },
        }),
      }),
    ).rejects.toThrow("cost bound");
    await expect(
      guarded(endpoint, {
        method: "POST",
        body: JSON.stringify({
          instances: [{}],
          parameters: {
            durationSeconds: 4,
            resolution: "720p",
            aspectRatio: "16:9",
          },
        }),
      }),
    ).rejects.toThrow("prior reservation");
    expect(external).not.toHaveBeenCalled();
  });

  it("redacts media payloads and signed query grants from durable evidence", () => {
    const redacted = redactCompletionEvidence({
      image: "data:image/png;base64,AAAA",
      source: "https://example.com/output.mp4?secret=grant",
    });
    expect(redacted).toMatchObject({
      image: { type: "data-uri", sha256: expect.any(String) },
      source: "https://example.com/output.mp4?[redacted]",
    });
    expect(JSON.stringify(redacted)).not.toContain("AAAA");
    expect(JSON.stringify(redacted)).not.toContain("secret=grant");
  });
});
