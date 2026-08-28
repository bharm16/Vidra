import { describe, expect, it, vi, beforeEach } from "vitest";

const { rawRequestMock } = vi.hoisted(() => ({ rawRequestMock: vi.fn() }));
vi.mock("@/services/ApiClient", () => ({
  apiClient: { rawRequest: rawRequestMock },
}));

import { createShare } from "../createShare";

function jsonResponse(payload: unknown): {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
} {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => payload,
  };
}

describe("createShare", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs the clip ids and returns the shareId", async () => {
    rawRequestMock.mockResolvedValue(
      jsonResponse({ success: true, data: { shareId: "abc-123" } }),
    );

    const id = await createShare({ sessionId: "s1", generationId: "g1" });

    expect(id).toBe("abc-123");
    expect(rawRequestMock).toHaveBeenCalledWith(
      "/share",
      expect.objectContaining({
        method: "POST",
        body: { sessionId: "s1", generationId: "g1" },
      }),
    );
  });

  it("rejects a malformed response", async () => {
    rawRequestMock.mockResolvedValue(jsonResponse({ success: true, data: {} }));
    await expect(
      createShare({ sessionId: "s1", generationId: "g1" }),
    ).rejects.toThrow();
  });
});
