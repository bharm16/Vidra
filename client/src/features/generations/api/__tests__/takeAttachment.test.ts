import { describe, expect, it, vi, beforeEach } from "vitest";

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));
vi.mock("@/services/ApiClient", () => ({
  apiClient: { get: getMock, post: postMock },
}));

import {
  fetchOwedPictureAttachments,
  fetchUnresolvedSketchAcceptances,
  retryOwedPictureAttachment,
} from "../takeAttachment";

/**
 * The client half of the quick-picture recovery contract — ADR-0022 decision 6,
 * issue #133. These pin the wire boundary: the endpoints called and the
 * validated shape read back. `#134`/`#135` reuse the same two calls.
 */
describe("owed quick-picture attachment api (issue #133)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("discovers a session's owed takes and validates them at the wire", async () => {
    getMock.mockResolvedValue({
      success: true,
      data: {
        attachments: [
          {
            state: "failed",
            generationId: "gen-1",
            sessionId: "session-1",
            promptVersionId: "v1",
            reason: "firestore unavailable",
            record: { id: "gen-1", mediaType: "image", status: "completed" },
          },
        ],
      },
    });

    const owed = await fetchOwedPictureAttachments("session-1");

    expect(getMock).toHaveBeenCalledWith(
      "/preview/pictures/owed-attachments?sessionId=session-1",
    );
    expect(owed).toHaveLength(1);
    expect(owed[0]).toMatchObject({ state: "failed", generationId: "gen-1" });
  });

  it("returns an empty list when nothing is owed", async () => {
    getMock.mockResolvedValue({ success: true, data: { attachments: [] } });
    expect(await fetchOwedPictureAttachments("session-1")).toEqual([]);
  });

  it("repairs one owed take by identity and returns its outcome", async () => {
    postMock.mockResolvedValue({
      success: true,
      attachment: {
        state: "attached",
        generationId: "gen-1",
        sessionId: "session-1",
        promptVersionId: "v1",
      },
    });

    const outcome = await retryOwedPictureAttachment("gen-1");

    expect(postMock).toHaveBeenCalledWith(
      "/preview/pictures/owed-attachments/gen-1/retry",
      {},
    );
    expect(outcome?.state).toBe("attached");
  });

  it("reports a deleted destination truthfully, not as saved", async () => {
    // The server answers 2xx with a failed attachment: the take could not be
    // saved to a session that is gone, and says so rather than lying.
    postMock.mockResolvedValue({
      success: true,
      attachment: {
        state: "failed",
        generationId: "gen-1",
        sessionId: "session-1",
        promptVersionId: "v1",
        reason: "Session not found: session-1",
      },
    });

    const outcome = await retryOwedPictureAttachment("gen-1");

    expect(outcome?.state).toBe("failed");
    expect(outcome?.reason).toContain("session-1");
  });

  it("throws when the server rejects the retry", async () => {
    postMock.mockResolvedValue({ success: false, error: "Access denied" });
    await expect(retryOwedPictureAttachment("gen-1")).rejects.toThrow(
      "Access denied",
    );
  });
});

/**
 * The sketchpad side of recovery (issue #134): a reloaded client asks the
 * SESSION what accepted live outputs are still not saved into it. Same wire
 * shape as the owed-quick-picture discovery, a different door — the receipts
 * are admission's, not the owed ledger's.
 */
describe("unresolved sketch acceptance api (issue #134)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks the session's unresolved acceptances and validates them at the wire", async () => {
    getMock.mockResolvedValue({
      success: true,
      data: {
        attachments: [
          {
            state: "failed",
            generationId: "take-9",
            sessionId: "session-1",
            promptVersionId: "v1",
            reason: "firestore unavailable",
            record: { id: "take-9", mediaType: "image", status: "completed" },
          },
        ],
      },
    });

    const owed = await fetchUnresolvedSketchAcceptances("session-1");

    expect(getMock).toHaveBeenCalledWith(
      "/sketch/accept/unresolved?sessionId=session-1",
    );
    expect(owed).toHaveLength(1);
    expect(owed[0]).toMatchObject({
      state: "failed",
      generationId: "take-9",
    });
    // The record rides along — it is exactly what the retry re-sends.
    expect(owed[0]?.record?.id).toBe("take-9");
  });

  it("returns an empty list when nothing is unresolved", async () => {
    getMock.mockResolvedValue({ success: true, data: { attachments: [] } });
    expect(await fetchUnresolvedSketchAcceptances("session-1")).toEqual([]);
  });
});
