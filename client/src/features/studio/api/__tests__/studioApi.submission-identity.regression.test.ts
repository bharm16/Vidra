import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #115 — the submission identity and captured selection/pin ride on the
 * wire in the run-turn request body.
 *
 * This sits at the api/ layer because the body assembled here is what the auth
 * transport re-sends verbatim on a 401 sign-in retry, so the same identity
 * converges on one turn rather than a second paid decision. fetch is this
 * module's own external boundary (same seam the attach-upload test uses).
 */

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer t" })),
}));

import { runStudioTurn } from "../studioApi";

/** An NDJSON response whose single line is the terminal `accepted` event. */
function ndjsonAccepted(): Response {
  const line = `${JSON.stringify({
    type: "accepted",
    turnId: "t1",
    decision: {
      action: "generate",
      basePrompt: "a fox logo",
      variants: ["a", "b", "c", "d"],
      capability: "design",
      suggestions: ["s1", "s2", "s3"],
    },
  })}\n`;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(line));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
}

describe("regression: run-turn carries the submission identity on the wire (#115)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serializes submissionId, selectedImageId and pinnedModel into the POST body", async () => {
    const calls: Array<[string, RequestInit]> = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return Promise.resolve(ndjsonAccepted());
    });

    const result = await runStudioTurn("p1", "a fox logo", {
      submissionId: "sub-123",
      selectedImageId: "img-a",
      pinnedModel: "recraft-v4.1-pro",
    });

    expect(result.turnId).toBe("t1");
    const [url, init] = calls[0] as [string, RequestInit];
    expect(url).toContain("/studio/projects/p1/turns");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      message: "a fox logo",
      submissionId: "sub-123",
      selectedImageId: "img-a",
      pinnedModel: "recraft-v4.1-pro",
    });
  });

  it("sends an explicit null selection/pin when the creator captured none", async () => {
    const calls: Array<[string, RequestInit]> = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return Promise.resolve(ndjsonAccepted());
    });

    await runStudioTurn("p1", "a fox logo", {
      submissionId: "sub-123",
      selectedImageId: null,
      pinnedModel: null,
    });

    const body = JSON.parse(
      String((calls[0] as [string, RequestInit])[1].body),
    );
    // null is an explicit "no selection"/"Auto" captured at submit time — sent,
    // not omitted, so a change in another tab cannot alter this turn server-side.
    expect(body.selectedImageId).toBeNull();
    expect(body.pinnedModel).toBeNull();
  });
});
