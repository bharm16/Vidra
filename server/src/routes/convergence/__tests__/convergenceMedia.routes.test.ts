import express from "express";
import { Readable } from "node:stream";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConvergenceMediaRoutes } from "../convergenceMedia.routes";
import { SignedUrlLedger } from "@services/storage/services/SignedUrlLedger";

// Security-maintenance exception to ADR-0002's frozen-stack test policy:
// this P0 regression must keep the ownership boundary executable.
const TEST_API_KEY = "convergence-media-proxy-test-key";
const BUCKET = "test-bucket";
const OWNER_ID = `api-key:${TEST_API_KEY}`;

const fetchMock = vi.fn();
const refreshSignedUrlMock = vi.fn();

const signedUrl = (objectPath: string, signature?: string): string =>
  `https://storage.googleapis.com/${BUCKET}/${objectPath}` +
  (signature ? `?X-Goog-Signature=${signature}` : "");

function createApp(
  bucket: unknown = { name: BUCKET, file: vi.fn() },
  signedUrlLedger = new SignedUrlLedger(null),
): express.Express {
  const app = express();
  app.use(
    "/api/motion/media",
    createConvergenceMediaRoutes(
      () =>
        ({
          getBucketName: () => BUCKET,
          uploadBuffer: vi.fn(),
          refreshSignedUrl: refreshSignedUrlMock,
        }) as never,
      bucket as never,
      signedUrlLedger,
    ),
  );
  return app;
}

function makeLedger(): SignedUrlLedger {
  const grants = new Map<string, unknown>();
  return new SignedUrlLedger({
    get: async <T>(key: string): Promise<T | null> =>
      grants.has(key) ? (grants.get(key) as T) : null,
    set: async (key: string, value: unknown): Promise<boolean> => {
      grants.set(key, value);
      return true;
    },
  });
}

function makeFakeBucket(payload: Buffer): {
  bucket: { name: string; file: ReturnType<typeof vi.fn> };
  createReadStreamMock: ReturnType<typeof vi.fn>;
} {
  const createReadStreamMock = vi.fn(() => Readable.from([payload]));
  return {
    bucket: {
      name: BUCKET,
      file: vi.fn(() => ({
        createReadStream: createReadStreamMock,
        getMetadata: async () => [
          { contentType: "image/png", size: String(payload.length) },
        ],
      })),
    },
    createReadStreamMock,
  };
}

describe("convergence media proxy", () => {
  let previousAllowedApiKeys: string | undefined;

  beforeEach(() => {
    previousAllowedApiKeys = process.env.ALLOWED_API_KEYS;
    process.env.ALLOWED_API_KEYS = TEST_API_KEY;
    fetchMock.mockReset();
    refreshSignedUrlMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousAllowedApiKeys === undefined) {
      delete process.env.ALLOWED_API_KEYS;
      return;
    }
    process.env.ALLOWED_API_KEYS = previousAllowedApiKeys;
  });

  it("requires authentication before reading convergence media", async () => {
    const response = await request(createApp()).get(
      `/api/motion/media/proxy?url=${encodeURIComponent(signedUrl(`convergence/${OWNER_ID}/frame.png`))}`,
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an authenticated user access to another owner's convergence media", async () => {
    const response = await request(createApp())
      .get(
        `/api/motion/media/proxy?url=${encodeURIComponent(signedUrl("convergence/another-user/frame.png"))}`,
      )
      .set("x-api-key", TEST_API_KEY);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never falls back to server credentials for an unminted convergence URL", async () => {
    const objectPath = `convergence/${OWNER_ID}/frame.png`;
    const { bucket, createReadStreamMock } = makeFakeBucket(Buffer.from([1]));
    fetchMock.mockResolvedValueOnce(
      new Response("Access denied", { status: 403 }),
    );

    const response = await request(createApp(bucket, makeLedger()))
      .get(
        `/api/motion/media/proxy?url=${encodeURIComponent(signedUrl(objectPath, "unminted"))}`,
      )
      .set("x-api-key", TEST_API_KEY);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("UPSTREAM_ERROR");
    expect(createReadStreamMock).not.toHaveBeenCalled();
  });

  it("recovers an owner’s minted convergence URL without re-signing it", async () => {
    const objectPath = `convergence/${OWNER_ID}/frame.png`;
    const signature = "minted";
    const mintedUrl = signedUrl(objectPath, signature);
    const { bucket, createReadStreamMock } = makeFakeBucket(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    const ledger = makeLedger();
    ledger.record(objectPath, mintedUrl);
    fetchMock.mockResolvedValueOnce(new Response("Expired", { status: 403 }));

    const response = await request(createApp(bucket, ledger))
      .get(`/api/motion/media/proxy?url=${encodeURIComponent(mintedUrl)}`)
      .set("x-api-key", TEST_API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(createReadStreamMock).toHaveBeenCalledOnce();
    expect(refreshSignedUrlMock).not.toHaveBeenCalled();
  });
});
