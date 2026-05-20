/**
 * Unit tests for Custom Suggestions API
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from "vitest";
import { ZodError } from "zod";

import { fetchCustomSuggestions } from "@components/SuggestionsPanel/api/customSuggestionsApi";
import { CancellationError } from "@features/prompt-optimizer/utils/signalUtils";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: vi.fn(),
}));

const mockBuildFirebaseAuthHeaders = vi.mocked(buildFirebaseAuthHeaders);

const TIMEOUT_MS = 3000;

const defaultParams = {
  highlightedText: "highlighted text",
  customRequest: "Make it vivid",
  fullPrompt: "Full prompt text",
};

const originalFetch = global.fetch;

function createAbortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function mockAbortableFetch(): MockedFunction<typeof fetch> {
  const mockFetch: MockedFunction<typeof fetch> = vi.fn((_input, init) => {
    return new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        return;
      }
      if (signal.aborted) {
        reject(createAbortError());
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          reject(createAbortError());
        },
        { once: true },
      );
    }) as Promise<Response>;
  });

  global.fetch = mockFetch as typeof fetch;
  return mockFetch;
}

describe("fetchCustomSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildFirebaseAuthHeaders.mockResolvedValue({ "X-Test-Auth": "token" });
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it("returns suggestions on success", async () => {
    const mockFetch: MockedFunction<typeof fetch> = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ suggestions: ["one", "two"] }),
    } as Response);
    global.fetch = mockFetch as typeof fetch;

    const result = await fetchCustomSuggestions(defaultParams);

    expect(result).toEqual([{ text: "one" }, { text: "two" }]);
    expect(mockBuildFirebaseAuthHeaders).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/enhancement/custom-suggestions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Test-Auth": "token",
        }),
        body: JSON.stringify({
          highlightedText: "highlighted text",
          customRequest: "Make it vivid",
          fullPrompt: "Full prompt text",
        }),
      }),
    );
  });

  it("throws when fetch is unavailable", async () => {
    const globalWithFetch = global as { fetch?: typeof fetch };
    delete globalWithFetch.fetch;

    await expect(fetchCustomSuggestions(defaultParams)).rejects.toThrow(
      "Fetch API unavailable",
    );
  });

  it("throws when response is not ok", async () => {
    const mockFetch: MockedFunction<typeof fetch> = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: async () => ({ suggestions: ["stub"] }),
    } as Response);
    global.fetch = mockFetch as typeof fetch;

    await expect(fetchCustomSuggestions(defaultParams)).rejects.toThrow(
      "Failed to fetch custom suggestions: 500 Server Error",
    );
  });

  it("throws ZodError on invalid response shape", async () => {
    const mockFetch: MockedFunction<typeof fetch> = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ suggestions: [123] }),
    } as Response);
    global.fetch = mockFetch as typeof fetch;

    await expect(fetchCustomSuggestions(defaultParams)).rejects.toThrow(
      ZodError,
    );
  });

  it("throws timeout error after 3 seconds", async () => {
    vi.useFakeTimers();
    mockAbortableFetch();

    const promise = fetchCustomSuggestions(defaultParams);
    const expectation = expect(promise).rejects.toThrow(
      "Request timed out after 3 seconds",
    );

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    await expectation;
  });

  it("throws CancellationError for user cancellation", async () => {
    mockAbortableFetch();
    const controller = new AbortController();

    const promise = fetchCustomSuggestions({
      ...defaultParams,
      signal: controller.signal,
    });
    const expectation = expect(promise).rejects.toThrow(CancellationError);

    controller.abort();

    await expectation;
    await expect(promise).rejects.toThrow("Request cancelled by user");
  });
});
