import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
 *
 * The three-step move lives behind uploadStudioAttachment, so this sits at
 * the api/ layer: fetch is that module's own external boundary. It used to
 * be a hook test that reached past api/ to stub fetch — the reach was the
 * finding.
 */

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer t" })),
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

import { storageApi } from "@/api/storageApi";
import { uploadStudioAttachment } from "../studioApi";

const registered = {
  id: "att-1",
  storagePath: "users/u1/previews/images/sketch.png",
  filename: "fox-sketch.png",
  createdAtMs: 2,
};

describe("regression: signed uploads send every header the signature covers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs with the signed extension headers and registers the attachment", async () => {
    const calls: Array<[string, RequestInit]> = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      calls.push([url, init]);
      if (init.method === "PUT") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: registered }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });

    const attachment = await uploadStudioAttachment(
      "p1",
      new File([new Uint8Array([1, 2, 3])], "fox-sketch.png", {
        type: "image/png",
      }),
    );

    expect(storageApi.getUploadUrl).toHaveBeenCalledWith(
      "preview-image",
      "image/png",
    );

    const [putUrl, putInit] = calls[0] as [
      string,
      { method: string; headers: Record<string, string> },
    ];
    expect(putUrl).toBe("https://storage.googleapis.com/bucket/signed");
    expect(putInit.method).toBe("PUT");
    expect(putInit.headers["Content-Type"]).toBe("image/png");
    // The V4 signature covers these; omitting either is a GCS 400.
    expect(putInit.headers["x-goog-if-generation-match"]).toBe("0");
    expect(putInit.headers["x-goog-content-length-range"]).toBe("0,12582912");

    const [registerUrl, registerInit] = calls[1] as [string, RequestInit];
    expect(registerUrl).toBe("/api/studio/projects/p1/attachments");
    expect(registerInit.method).toBe("POST");
    expect(JSON.parse(String(registerInit.body))).toEqual({
      storagePath: "users/u1/previews/images/sketch.png",
      filename: "fox-sketch.png",
    });

    expect(attachment).toEqual(registered);
  });

  it("never registers an attachment when the PUT is rejected", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url);
      return Promise.resolve(new Response(null, { status: 400 }));
    });

    await expect(
      uploadStudioAttachment(
        "p1",
        new File([new Uint8Array([1])], "fox-sketch.png", {
          type: "image/png",
        }),
      ),
    ).rejects.toThrow("Upload failed (400)");

    expect(calls).toEqual(["https://storage.googleapis.com/bucket/signed"]);
  });
});
