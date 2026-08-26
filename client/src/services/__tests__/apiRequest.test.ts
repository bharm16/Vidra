import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { apiRequest } from "../apiRequest";
import { apiClient } from "../ApiClient";

vi.mock("../ApiClient", () => ({
  apiClient: { rawRequest: vi.fn() },
}));

const rawRequest = vi.mocked(apiClient.rawRequest);

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as unknown as Response;

const schema = z.object({ value: z.number() });

describe("apiRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("unwraps the success envelope's data and forwards method/body to rawRequest", async () => {
    rawRequest.mockResolvedValue(
      jsonResponse({ success: true, data: { value: 42 } }),
    );

    const result = await apiRequest("/thing", schema, {
      method: "POST",
      body: { q: 1 },
    });

    expect(result).toEqual({ value: 42 });
    expect(rawRequest).toHaveBeenCalledWith("/thing", {
      method: "POST",
      body: { q: 1 },
    });
  });

  it("throws the server's error message on a non-OK response", async () => {
    rawRequest.mockResolvedValue(
      jsonResponse({ success: false, error: "over the limit" }, false, 400),
    );

    await expect(apiRequest("/thing", schema)).rejects.toThrow(
      "over the limit",
    );
  });

  it("falls back to a status message when the error body isn't the envelope", async () => {
    rawRequest.mockResolvedValue(jsonResponse("gateway boom", false, 502));

    await expect(apiRequest("/thing", schema)).rejects.toThrow("502");
  });

  it("passes an abort signal through when given", async () => {
    rawRequest.mockResolvedValue(
      jsonResponse({ success: true, data: { value: 1 } }),
    );
    const signal = new AbortController().signal;

    await apiRequest("/thing", schema, { method: "POST", body: {}, signal });

    expect(rawRequest).toHaveBeenCalledWith("/thing", {
      method: "POST",
      body: {},
      signal,
    });
  });
});
