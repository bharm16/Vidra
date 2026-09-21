import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #135 — the attachment fact rides the studio return's response and the
 * client validates it at the wire (ADR-0022 decision 6). `fetch` is this
 * module's own external boundary (same seam the submission-identity test
 * uses): a studio response whose attachment does not validate must be
 * rejected, never guessed into a saved-or-not-saved state. Issue #136: the
 * arming fact is required by the same wire — fixtures carry a settled one.
 */

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer t" })),
}));

import {
  fetchUnresolvedStudioReturns,
  returnStudioImageToSession,
} from "../studioApi";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const returnedBody = (attachment: unknown): unknown => ({
  success: true,
  data: {
    sessionId: "session-1",
    promptVersionId: "v1",
    generationId: "take-2",
    imageUrl: "https://storage.example.com/returned",
    ancestorGenerationId: null,
    createdSession: false,
    attachment,
    arming: { state: "armed", generationId: "take-2" },
  },
});

describe("regression #135: the attachment outcome is validated at the wire", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces a failed attachment as the return's outcome, never as plain success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(201, {
          success: true,
          data: {
            sessionId: "session-1",
            promptVersionId: "v1",
            generationId: "take-2",
            imageUrl: "https://storage.example.com/returned",
            ancestorGenerationId: null,
            createdSession: false,
            attachment: {
              state: "failed",
              generationId: "take-2",
              sessionId: "session-1",
              promptVersionId: "v1",
              reason: "session write failed",
              record: { id: "take-2", mediaType: "image", origin: "studio" },
            },
            arming: { state: "armed", generationId: "take-2" },
          },
        }),
      ),
    );

    const outcome = await returnStudioImageToSession("p-1", "img-1");

    expect(outcome.state).toBe("returned");
    if (outcome.state !== "returned") return;
    expect(outcome.result.attachment?.state).toBe("failed");
    expect(outcome.result.attachment?.record).toMatchObject({
      id: "take-2",
    });
  });

  it("carries an attached outcome through untouched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          201,
          returnedBody({
            state: "attached",
            generationId: "take-2",
            sessionId: "session-1",
            promptVersionId: "v1",
          }),
        ),
      ),
    );

    const outcome = await returnStudioImageToSession("p-1", "img-1");

    expect(outcome.state).toBe("returned");
    if (outcome.state !== "returned") return;
    expect(outcome.result.attachment?.state).toBe("attached");
  });

  it("rejects a response whose attachment state is not one of the three", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(201, returnedBody({ state: "bananas" })),
      ),
    );

    await expect(returnStudioImageToSession("p-1", "img-1")).rejects.toThrow();
  });

  it("validates the recovery read at the wire too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, {
          success: true,
          data: {
            returns: [
              {
                imageId: "img-1",
                attachment: {
                  state: "failed",
                  generationId: "take-1",
                  sessionId: "session-1",
                  promptVersionId: "v1",
                  reason: "session write failed",
                  record: {
                    id: "take-1",
                    mediaType: "image",
                    origin: "studio",
                  },
                },
              },
            ],
          },
        }),
      ),
    );

    const returns = await fetchUnresolvedStudioReturns("p-1");

    expect(returns).toHaveLength(1);
    expect(returns[0]?.attachment.state).toBe("failed");
  });

  it("rejects a recovery list whose attachment does not validate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, {
          success: true,
          data: {
            returns: [{ imageId: "img-1", attachment: { state: "saved" } }],
          },
        }),
      ),
    );

    await expect(fetchUnresolvedStudioReturns("p-1")).rejects.toThrow();
  });
});
