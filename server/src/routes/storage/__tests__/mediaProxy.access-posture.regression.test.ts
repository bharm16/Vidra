/**
 * Regression test: the media proxy's access posture is named at every mount.
 *
 * The handler used to take three optional positional parameters, the last of
 * which was the access policy. Omitting it served any object in the bucket to
 * anyone holding a parseable URL — and the two mount sites (pre-auth storage,
 * authenticated convergence) were indistinguishable at the call site. The
 * posture is now a required, named choice, so a mount cannot fall into the
 * permissive shape by leaving an argument off.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { createMediaProxyRoutes } from "../mediaProxy.routes";

const BUCKET = "test-bucket";
const OBJECT_URL = `https://storage.googleapis.com/${BUCKET}/users/owner-1/clip.png`;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("media proxy access posture", () => {
  it("refuses an object the owner-scoped posture rejects", async () => {
    const canAccessObject = vi.fn().mockReturnValue(false);
    const app = express();
    app.use(
      "/api/storage",
      createMediaProxyRoutes({
        bucketName: BUCKET,
        access: { kind: "owner-scoped", canAccessObject },
      }),
    );

    const res = await request(app).get(
      `/api/storage/proxy?url=${encodeURIComponent(OBJECT_URL)}`,
    );

    expect(res.status).toBe(403);
    expect(canAccessObject).toHaveBeenCalledWith(
      expect.anything(),
      "users/owner-1/clip.png",
    );
    // The refusal happens before any upstream traffic.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves an object the owner-scoped posture allows", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("png-bytes", {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const app = express();
    app.use(
      "/api/storage",
      createMediaProxyRoutes({
        bucketName: BUCKET,
        access: {
          kind: "owner-scoped",
          canAccessObject: (_req, objectPath) =>
            objectPath.startsWith("users/owner-1/"),
        },
      }),
    );

    const res = await request(app).get(
      `/api/storage/proxy?url=${encodeURIComponent(OBJECT_URL)}`,
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("consults no policy when the signature is the authorization", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("png-bytes", {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const app = express();
    app.use(
      "/api/storage",
      createMediaProxyRoutes({
        bucketName: BUCKET,
        access: { kind: "signed-url-is-authorization" },
      }),
    );

    const res = await request(app).get(
      `/api/storage/proxy?url=${encodeURIComponent(OBJECT_URL)}`,
    );

    expect(res.status).toBe(200);
  });
});
