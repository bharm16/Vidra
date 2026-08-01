/**
 * Media Proxy Route
 *
 * Proxies signed GCS URLs through the app origin to avoid browser ORB
 * (Opaque Response Blocking) failures. When COEP is set to 'credentialless',
 * cross-origin image/video loads from GCS can be blocked if the GCS bucket
 * lacks CORS headers. This proxy eliminates the cross-origin fetch entirely.
 *
 * Adapted from the convergence media proxy pattern.
 */

import express, { type Request, type Response, type Router } from "express";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { Bucket } from "@google-cloud/storage";
import { asyncHandler } from "@middleware/asyncHandler";
import { logger } from "@infrastructure/Logger";
import type { SignedUrlLedger } from "@services/storage/services/SignedUrlLedger";

const log = logger.child({ module: "mediaProxy" });

const STORAGE_HOST = "storage.googleapis.com";
const STORAGE_HOST_SUFFIX = ".storage.googleapis.com";
const FIREBASE_STORAGE_HOST = "firebasestorage.googleapis.com";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/webp",
  "image/png",
  "image/jpeg",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const extractObjectPath = (url: URL, bucketName: string): string | null => {
  const host = url.hostname;
  const path = url.pathname.replace(/^\/+/, "");

  if (!path) return null;

  // storage.googleapis.com/{bucket}/{object}
  if (host === STORAGE_HOST) {
    const [bucket, ...rest] = path.split("/");
    if (bucket !== bucketName) return null;
    return rest.join("/") || null;
  }

  // {bucket}.storage.googleapis.com/{object}
  if (host.endsWith(STORAGE_HOST_SUFFIX)) {
    const bucketFromHost = host.slice(0, -STORAGE_HOST_SUFFIX.length);
    if (bucketFromHost !== bucketName) return null;
    return path;
  }

  // firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedObject}
  if (host === FIREBASE_STORAGE_HOST) {
    const match = path.match(/^v0\/b\/([^/]+)\/o\/(.+)/);
    if (!match) return null;
    const [, bucket, encodedObject] = match;
    // Firebase bucket names may have .appspot.com or .firebasestorage.app suffixes
    const baseBucket = (bucket ?? "").replace(
      /\.(appspot\.com|firebasestorage\.app)$/,
      "",
    );
    const baseName = bucketName.replace(
      /\.(appspot\.com|firebasestorage\.app)$/,
      "",
    );
    if (baseBucket !== baseName) return null;
    return decodeURIComponent(encodedObject ?? "");
  }

  return null;
};

/**
 * Stream an object directly from the bucket reference. Used as a fallback
 * when the upstream signed-URL fetch fails but the presented URL verified as
 * an authentic grant — the server has its own GCS credentials and can read
 * the file via the bucket regardless of the grant's expiry.
 */
async function streamFromBucket(
  bucket: Bucket,
  objectPath: string,
  res: Response,
  isHead: boolean,
): Promise<boolean> {
  try {
    const file = bucket.file(objectPath);
    const [metadata] = await file.getMetadata();
    const contentType =
      typeof metadata.contentType === "string" ? metadata.contentType : null;
    if (
      contentType &&
      !ALLOWED_CONTENT_TYPES.has(contentType.split(";")[0]!.trim())
    ) {
      return false;
    }

    res.status(200);
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    if (
      typeof metadata.size === "string" ||
      typeof metadata.size === "number"
    ) {
      res.setHeader("Content-Length", String(metadata.size));
    }
    res.setHeader("Cache-Control", "public, max-age=300, immutable");

    if (isHead) {
      res.end();
      return true;
    }

    const stream = file.createReadStream();
    stream.on("error", (error) => {
      log.warn("Bucket fallback stream error", {
        error: error instanceof Error ? error.message : String(error),
        objectPath,
      });
      if (!res.headersSent) {
        res.status(502);
      }
      res.end();
    });
    stream.pipe(res);
    return true;
  } catch (error) {
    log.warn("Bucket fallback fetch failed", {
      error: error instanceof Error ? error.message : String(error),
      objectPath,
    });
    return false;
  }
}

export function createMediaProxyRoutes(
  bucketName: string,
  bucket?: Bucket,
  signedUrlLedger?: SignedUrlLedger,
): Router {
  const router = express.Router();

  router.get(
    "/proxy",
    asyncHandler(async (req: Request, res: Response) => {
      const urlParam =
        typeof req.query.url === "string" ? req.query.url.trim() : "";

      if (!urlParam) {
        return res.status(400).json({
          success: false,
          error: "INVALID_REQUEST",
          message: "Missing required query parameter: url",
        });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlParam);
      } catch {
        return res.status(400).json({
          success: false,
          error: "INVALID_REQUEST",
          message: "Invalid url parameter",
        });
      }

      if (parsedUrl.protocol !== "https:") {
        return res.status(400).json({
          success: false,
          error: "INVALID_REQUEST",
          message: "Only https URLs are supported",
        });
      }

      const objectPath = extractObjectPath(parsedUrl, bucketName);
      if (!objectPath) {
        return res.status(403).json({
          success: false,
          error: "FORBIDDEN",
          message: "URL host or bucket is not allowed",
        });
      }

      log.debug("Proxying media asset", { bucketName, objectPath });

      const upstream = await fetch(parsedUrl.toString(), {
        method: req.method === "HEAD" ? "HEAD" : "GET",
        redirect: "follow",
      });

      if (!upstream.ok) {
        log.warn("Upstream media fetch failed", {
          status: upstream.status,
          objectPath,
        });

        // C3 fix, hardened: signed URLs expire after 1 hour (and rotate with
        // the signing key). When the upstream fetch fails for ANY reason,
        // fall back to streaming directly from the bucket — but only after
        // proving the presented URL is a grant we actually minted (the
        // signed-URL ledger records every mint, keyed to its object path).
        // The proxy is mounted pre-auth ("the signed URL is the
        // authorization"), so without this proof the rescue would be an
        // unauthenticated read of arbitrary bucket objects behind a forged
        // signature.
        if (bucket) {
          const presentedSignature =
            parsedUrl.searchParams.get("X-Goog-Signature");
          const authentic =
            presentedSignature && signedUrlLedger
              ? await signedUrlLedger.isMintedGrant(
                  objectPath,
                  presentedSignature,
                )
              : false;
          if (!authentic) {
            log.warn("Bucket rescue refused: signed URL not verifiable", {
              metric: "media_proxy.rescue_refused_unverified",
              objectPath,
              upstreamStatus: upstream.status,
            });
            return res.status(upstream.status).json({
              success: false,
              error: "UPSTREAM_ERROR",
              message: `Upstream returned ${upstream.status}`,
            });
          }
          const isHead = req.method === "HEAD";
          const recovered = await streamFromBucket(
            bucket,
            objectPath,
            res,
            isHead,
          );
          if (recovered) {
            // Emit at warn level so the recovery path is visible by default in
            // ops dashboards. The structured `metric` field gives observability
            // a stable aggregation key — production runbook calls for alerting
            // if this fires on >1% of /api/storage/proxy calls, since that
            // signals a structural signed-URL TTL problem upstream rather
            // than a benign reload of a stale cached URL.
            log.warn("Recovered expired signed URL via bucket fallback", {
              metric: "media_proxy.signed_url_expired_recovery",
              objectPath,
            });
            return res;
          }
        }

        return res.status(upstream.status).json({
          success: false,
          error: "UPSTREAM_ERROR",
          message: `Upstream returned ${upstream.status}`,
        });
      }

      const contentType = upstream.headers.get("content-type");
      if (
        contentType &&
        !ALLOWED_CONTENT_TYPES.has(contentType.split(";")[0]!.trim())
      ) {
        return res.status(403).json({
          success: false,
          error: "FORBIDDEN",
          message: "Content type not allowed",
        });
      }

      res.status(200);

      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }

      const contentLength = upstream.headers.get("content-length");
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      const cacheControl = upstream.headers.get("cache-control");
      res.setHeader(
        "Cache-Control",
        cacheControl || "public, max-age=300, immutable",
      );

      if (req.method === "HEAD" || !upstream.body) {
        return res.end();
      }

      const stream = Readable.fromWeb(
        upstream.body as unknown as NodeReadableStream<Uint8Array>,
      );
      stream.on("error", (error) => {
        log.warn("Media proxy stream error", {
          error: error instanceof Error ? error.message : String(error),
          objectPath,
        });
        if (!res.headersSent) {
          res.status(502);
        }
        res.end();
      });

      stream.pipe(res);
      return res;
    }),
  );

  return router;
}
