/**
 * Regression: when a client requests `/api/storage/proxy?url=<gcs-signed-url>`
 * for an expired GCS signed URL, the upstream `fetch()` returns 400 (the
 * X-Goog-Signature has expired). Before this fix the proxy passed that 400
 * through unchanged, so any user returning to the app after >1 hour saw
 * broken thumbnails — the session DTO has cached signed URLs whose 1-hour
 * TTL has expired.
 *
 * The proxy already extracts the object path from the URL, so it has all
 * the info it needs to fetch the bytes via the Firebase Admin Bucket
 * reference (which uses the server's own GCS credentials and never
 * expires). When upstream returns 400, we fall back to the bucket stream.
 *
 * Invariant: For any in-bucket object URL that is a grant we minted (on the
 * signed-URL ledger) and whose signed URL fetch fails upstream, the proxy
 * responds 200 with the object bytes by streaming from the bucket reference
 * instead.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { Readable } from "node:stream";
import { createMediaProxyRoutes } from "../mediaProxy.routes";
import { SignedUrlLedger } from "@services/storage/services/SignedUrlLedger";

const BUCKET = "test-bucket";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type FakeFile = {
  createReadStream: () => Readable;
  getMetadata: () => Promise<[{ contentType: string; size: string }]>;
};

function makeFakeBucket(payload: { body: Buffer; contentType: string }): {
  file: (path: string) => FakeFile;
} {
  return {
    file: () => ({
      createReadStream: () => Readable.from([payload.body]),
      getMetadata: async () => [
        {
          contentType: payload.contentType,
          size: String(payload.body.length),
        },
      ],
    }),
  };
}

// The rescue contract now requires a grant we minted: the signed-URL ledger
// records every mint and the proxy only streams for signatures on it (see
// mediaProxy.rescue-authenticity.regression.test.ts). This test pre-records
// the grant, modeling a genuine expired-but-authentic URL.
const EXPIRED_SIGNATURE = "cc".repeat(64);
const OBJECT_PATH = "users/u/preview-image/asset-1";

const expiredSignedUrl = `https://storage.googleapis.com/test-bucket/${OBJECT_PATH}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20260420T000000Z&X-Goog-Expires=3600&X-Goog-Signature=${EXPIRED_SIGNATURE}`;

const makeLedger = (): SignedUrlLedger => {
  const store = new Map<string, unknown>();
  const ledger = new SignedUrlLedger({
    get: async <T>(key: string): Promise<T | null> =>
      store.has(key) ? (store.get(key) as T) : null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
      return true;
    },
  });
  ledger.record(OBJECT_PATH, expiredSignedUrl);
  return ledger;
};

describe("regression: media proxy falls back to bucket stream on expired signed URL", () => {
  it("recovers from upstream 400 by streaming via bucket.file", async () => {
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    fetchMock.mockResolvedValueOnce(
      new Response("Signature expired", { status: 400 }),
    );

    const app = express();
    app.use(
      "/api/storage",
      createMediaProxyRoutes(
        BUCKET,
        makeFakeBucket({ body: fakePng, contentType: "image/png" }) as never,
        makeLedger(),
      ),
    );

    const res = await request(app).get(
      `/api/storage/proxy?url=${encodeURIComponent(expiredSignedUrl)}`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.body).toEqual(fakePng);
  });

  it("returns the upstream error when bucket fallback is unavailable", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Signature expired", { status: 400 }),
    );

    const app = express();
    // No bucket argument — proxy should preserve the existing pass-through
    // behavior so existing deployments keep working.
    app.use("/api/storage", createMediaProxyRoutes(BUCKET));

    const res = await request(app).get(
      `/api/storage/proxy?url=${encodeURIComponent(expiredSignedUrl)}`,
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("UPSTREAM_ERROR");
  });
});
