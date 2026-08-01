/**
 * Regression: the media proxy's bucket rescue was an unauthenticated read of
 * arbitrary bucket objects — and simultaneously too narrow to survive key
 * rotation.
 *
 * The proxy is mounted pre-auth ("the signed URL is the authorization"), but
 * the expired-URL rescue streamed via SERVER credentials whenever upstream
 * returned 400 — a status anyone can induce with a garbage X-Goog-Signature
 * on any object path. Possession of a grant we minted was never checked. And
 * because only 400 triggered rescue, an upstream 403 (invalid signature after
 * a service-account key rotation) killed every persisted media URL despite
 * the rescue sitting right there.
 *
 * Invariant: the rescue streams an object iff the presented signature is on
 * the signed-URL ledger FOR THAT OBJECT PATH (i.e. we minted it), for ANY
 * upstream failure status. Unminted signatures are never rescued, and a
 * minted signature cannot be replayed onto a different object.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { Readable } from "node:stream";
import { createMediaProxyRoutes } from "../mediaProxy.routes";
import { SignedUrlLedger } from "@services/storage/services/SignedUrlLedger";

const BUCKET = "test-bucket";
const OBJECT_PATH = "users/u1/previews/images/1785598164559-abc.webp";
const OTHER_OBJECT_PATH = "users/u2/previews/images/1785500000000-def.webp";
const MINTED_SIGNATURE = "aa".repeat(64);
const UNMINTED_SIGNATURE = "bb".repeat(64);

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const makeLedger = (): SignedUrlLedger => {
  const store = new Map<string, unknown>();
  return new SignedUrlLedger({
    get: async <T>(key: string): Promise<T | null> =>
      store.has(key) ? (store.get(key) as T) : null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
      return true;
    },
  });
};

const signedUrl = (objectPath: string, signature: string): string =>
  `https://storage.googleapis.com/${BUCKET}/${objectPath}` +
  `?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20260420T000000Z` +
  `&X-Goog-Expires=3600&X-Goog-SignedHeaders=host&X-Goog-Signature=${signature}`;

function makeFakeBucket(payload: { body: Buffer; contentType: string }): {
  bucket: { file: (path: string) => unknown };
  createReadStreamMock: ReturnType<typeof vi.fn>;
} {
  const createReadStreamMock = vi.fn(() => Readable.from([payload.body]));
  return {
    bucket: {
      file: () => ({
        createReadStream: createReadStreamMock,
        getMetadata: async () => [
          {
            contentType: payload.contentType,
            size: String(payload.body.length),
          },
        ],
      }),
    },
    createReadStreamMock,
  };
}

const buildApp = (
  bucket: unknown,
  ledger: SignedUrlLedger,
): express.Express => {
  const app = express();
  app.use(
    "/api/storage",
    createMediaProxyRoutes(BUCKET, bucket as never, ledger),
  );
  return app;
};

describe("regression: bucket rescue requires a grant we minted", () => {
  it("never streams for an unminted signature, even on upstream 400", async () => {
    const { bucket, createReadStreamMock } = makeFakeBucket({
      body: Buffer.from([1]),
      contentType: "image/png",
    });
    const ledger = makeLedger();
    fetchMock.mockResolvedValueOnce(
      new Response("Bad signature", { status: 400 }),
    );

    const res = await request(buildApp(bucket, ledger)).get(
      `/api/storage/proxy?url=${encodeURIComponent(signedUrl(OBJECT_PATH, UNMINTED_SIGNATURE))}`,
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("UPSTREAM_ERROR");
    expect(createReadStreamMock).not.toHaveBeenCalled();
  });

  it("rescues a minted grant on upstream 400 (expired signature)", async () => {
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const { bucket } = makeFakeBucket({
      body: fakePng,
      contentType: "image/png",
    });
    const ledger = makeLedger();
    ledger.record(OBJECT_PATH, signedUrl(OBJECT_PATH, MINTED_SIGNATURE));
    fetchMock.mockResolvedValueOnce(
      new Response("Signature expired", { status: 400 }),
    );

    const res = await request(buildApp(bucket, ledger)).get(
      `/api/storage/proxy?url=${encodeURIComponent(signedUrl(OBJECT_PATH, MINTED_SIGNATURE))}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakePng);
  });

  it("rescues a minted grant on upstream 403 (key rotation / auth-shaped failures)", async () => {
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const { bucket } = makeFakeBucket({
      body: fakePng,
      contentType: "image/png",
    });
    const ledger = makeLedger();
    ledger.record(OBJECT_PATH, signedUrl(OBJECT_PATH, MINTED_SIGNATURE));
    fetchMock.mockResolvedValueOnce(
      new Response("AccessDenied", { status: 403 }),
    );

    const res = await request(buildApp(bucket, ledger)).get(
      `/api/storage/proxy?url=${encodeURIComponent(signedUrl(OBJECT_PATH, MINTED_SIGNATURE))}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakePng);
  });

  it("a minted signature cannot be replayed onto a different object path", async () => {
    const { bucket, createReadStreamMock } = makeFakeBucket({
      body: Buffer.from([1]),
      contentType: "image/png",
    });
    const ledger = makeLedger();
    ledger.record(OBJECT_PATH, signedUrl(OBJECT_PATH, MINTED_SIGNATURE));
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 400 }));

    const res = await request(buildApp(bucket, ledger)).get(
      `/api/storage/proxy?url=${encodeURIComponent(signedUrl(OTHER_OBJECT_PATH, MINTED_SIGNATURE))}`,
    );

    expect(res.status).toBe(400);
    expect(createReadStreamMock).not.toHaveBeenCalled();
  });

  it("refuses rescue for a URL with no signature at all", async () => {
    const { bucket, createReadStreamMock } = makeFakeBucket({
      body: Buffer.from([1]),
      contentType: "image/png",
    });
    fetchMock.mockResolvedValueOnce(
      new Response("AccessDenied", { status: 403 }),
    );

    const bareUrl = `https://storage.googleapis.com/${BUCKET}/${OBJECT_PATH}`;
    const res = await request(buildApp(bucket, makeLedger())).get(
      `/api/storage/proxy?url=${encodeURIComponent(bareUrl)}`,
    );

    expect(res.status).toBe(403);
    expect(createReadStreamMock).not.toHaveBeenCalled();
  });
});
