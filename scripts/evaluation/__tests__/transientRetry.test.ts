import { describe, expect, it, vi } from "vitest";
import { retryAfterMs, withTransientRetry } from "../transientRetry";

const RATE_LIMITED =
  'Groq API error: 429 - {"error":{"message":"Rate limit reached for model `openai/gpt-oss-20b`. Please try again in 1.20048s."}}';

describe("withTransientRetry", () => {
  it.each([
    "Groq API request timeout after 30000ms",
    "fetch failed",
    'Groq API error: 400 - {"error":{"code":"json_validate_failed"}}',
    "Groq API error: 503 - service unavailable",
  ])("retries a passing failure: %s", async (message) => {
    const call = vi.fn().mockRejectedValueOnce(new Error(message)).mockResolvedValueOnce("spans");
    await expect(withTransientRetry(call, { sleep: async () => undefined })).resolves.toBe("spans");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("waits as long as the provider asks, then succeeds", async () => {
    const sleep = vi.fn(async () => undefined);
    const call = vi.fn().mockRejectedValueOnce(new Error(RATE_LIMITED)).mockResolvedValueOnce("spans");

    await expect(withTransientRetry(call, { sleep })).resolves.toBe("spans");

    expect(call).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1200.48 + 250);
  });

  it("throws any other error at once", async () => {
    const sleep = vi.fn(async () => undefined);
    const call = vi.fn().mockRejectedValue(new Error("Unparseable span payload"));

    await expect(withTransientRetry(call, { sleep })).rejects.toThrow("Unparseable span payload");
    expect(call).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after its attempts", async () => {
    const call = vi.fn().mockRejectedValue(new Error(RATE_LIMITED));
    await expect(withTransientRetry(call, { attempts: 3, sleep: async () => undefined })).rejects.toThrow("429");
    expect(call).toHaveBeenCalledTimes(3);
  });
});

describe("retryAfterMs", () => {
  it("reads seconds and milliseconds, and nothing when absent", () => {
    expect(retryAfterMs("Please try again in 1.5s.")).toBe(1500);
    expect(retryAfterMs("Please try again in 479.52ms.")).toBe(479.52);
    expect(retryAfterMs("Rate limit reached")).toBeUndefined();
  });
});
