import { describe, expect, it, vi, beforeEach } from "vitest";

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock("@/services/ApiClient", () => ({ apiClient: { post: postMock } }));

import { createShare } from "../createShare";

describe("createShare", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs the clip ids and returns the shareId", async () => {
    postMock.mockResolvedValue({ success: true, data: { shareId: "abc-123" } });

    const id = await createShare({ sessionId: "s1", generationId: "g1" });

    expect(id).toBe("abc-123");
    expect(postMock).toHaveBeenCalledWith("/share", {
      sessionId: "s1",
      generationId: "g1",
    });
  });

  it("rejects a malformed response", async () => {
    postMock.mockResolvedValue({ success: true, data: {} });
    await expect(
      createShare({ sessionId: "s1", generationId: "g1" }),
    ).rejects.toThrow();
  });
});
