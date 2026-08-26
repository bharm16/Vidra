/**
 * Regression: the storage API client must validate the response envelope at the
 * wire. Historically fetchWithAuth returned `payload.data` with zero validation
 * (an implicit `any`), so a malformed (non-object) response surfaced as a silent
 * `undefined` deep inside a consumer. storageApi now routes through apiRequest,
 * which validates the shared success envelope: a non-object body throws here,
 * the return type is `unknown` rather than any, and a failure envelope surfaces
 * the server's error message. The global `fetch` mock still intercepts because
 * FetchHttpTransport calls fetch underneath.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: vi.fn(),
}));

import { storageApi } from "../storageApi";

describe("storageApi envelope validation regression", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply each test: afterEach's restoreAllMocks resets the implementation,
    // and the shared apiClient auth interceptor calls Object.entries on the
    // result, so it must resolve to an object, not undefined.
    vi.mocked(buildFirebaseAuthHeaders).mockResolvedValue({
      Authorization: "Bearer test",
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns the envelope data on a well-formed success response", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ success: true, data: { url: "https://x/y.png" } }),
    })) as unknown as typeof fetch;

    const result = await storageApi.getViewUrl("path/to/file");

    expect(result).toEqual({ url: "https://x/y.png" });
  });

  it("throws when an OK response body is not a JSON object", async () => {
    // A proxy/error page that parses to a non-object must fail at the boundary,
    // not return `undefined` data to the caller.
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => "totally not an object",
    })) as unknown as typeof fetch;

    await expect(storageApi.getViewUrl("path")).rejects.toThrow();
  });

  it("surfaces the server error message on a failure envelope", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: async () => ({ error: "Invalid path" }),
    })) as unknown as typeof fetch;

    await expect(storageApi.getViewUrl("path")).rejects.toThrow(/Invalid path/);
  });
});
