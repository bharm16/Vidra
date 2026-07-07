import { describe, expect, it, vi, beforeEach } from "vitest";

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock("@/services/ApiClient", () => ({
  apiClient: { post: postMock },
}));

import { archiveGeneration } from "../spaceApi";

describe("spaceApi.archiveGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POSTs to the leaf-archive endpoint with encoded ids", async () => {
    postMock.mockResolvedValue({ success: true, data: { id: "session-1" } });

    await archiveGeneration("session-1", "gen/pic 1");

    expect(postMock).toHaveBeenCalledWith(
      "/sessions/session-1/generations/gen%2Fpic%201/archive",
      {},
    );
  });

  it("propagates a rejected removal (server 409 for a non-leaf)", async () => {
    postMock.mockRejectedValue(
      new Error("Only a childless node can be removed"),
    );

    await expect(archiveGeneration("session-1", "pic-1")).rejects.toThrow(
      "childless",
    );
  });
});
