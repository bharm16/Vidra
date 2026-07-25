import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStudioProject } from "../useStudioProject";

/**
 * Regression (found live 2026-07-25, S-12 verification): the browser PUT
 * to the signed GCS upload URL failed 400 because the V4 signature covers
 * two extension headers (x-goog-if-generation-match, create-only, and
 * x-goog-content-length-range from the granted maxSizeBytes) that the
 * client never sent.
 *
 * Invariant: for any staged upload, the PUT carries every header the
 * signature covers, and the attachment registers with the granted
 * storagePath.
 */

vi.mock("../../api/studioApi", () => ({
  createStudioProject: vi.fn(async () => ({
    id: "p1",
    title: "Untitled",
    createdAtMs: 1,
    updatedAtMs: 1,
  })),
  deleteStudioProject: vi.fn(),
  getStudioModels: vi.fn(async () => []),
  getStudioProject: vi.fn(),
  getStudioTurn: vi.fn(),
  listStudioProjects: vi.fn(async () => []),
  listStudioTurns: vi.fn(async () => []),
  registerStudioAttachment: vi.fn(async () => ({
    id: "att-1",
    storagePath: "users/u1/previews/images/sketch.png",
    filename: "fox-sketch.png",
    createdAtMs: 2,
  })),
  runStudioTurn: vi.fn(),
  updateStudioProject: vi.fn(),
}));

vi.mock("@/api/storageApi", () => ({
  storageApi: {
    getUploadUrl: vi.fn(async () => ({
      uploadUrl: "https://storage.googleapis.com/bucket/signed",
      storagePath: "users/u1/previews/images/sketch.png",
      expiresAt: "2026-07-26T00:00:00Z",
      maxSizeBytes: 12_582_912,
    })),
  },
}));

import { registerStudioAttachment } from "../../api/studioApi";

describe("regression: signed uploads send every header the signature covers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PUTs with the signed extension headers and registers the attachment", async () => {
    const put = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", put);

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await result.current.attachFile(
        new File([new Uint8Array([1, 2, 3])], "fox-sketch.png", {
          type: "image/png",
        }),
      );
    });

    const [url, init] = put.mock.calls[0] as unknown as [
      string,
      { method: string; headers: Record<string, string> },
    ];
    expect(url).toBe("https://storage.googleapis.com/bucket/signed");
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Type"]).toBe("image/png");
    // The V4 signature covers these; omitting either is a GCS 400.
    expect(init.headers["x-goog-if-generation-match"]).toBe("0");
    expect(init.headers["x-goog-content-length-range"]).toBe("0,12582912");

    expect(registerStudioAttachment).toHaveBeenCalledWith("p1", {
      storagePath: "users/u1/previews/images/sketch.png",
      filename: "fox-sketch.png",
    });
    await waitFor(() =>
      expect(result.current.state.pendingAttachments.map((a) => a.id)).toEqual([
        "att-1",
      ]),
    );

    vi.unstubAllGlobals();
  });
});
