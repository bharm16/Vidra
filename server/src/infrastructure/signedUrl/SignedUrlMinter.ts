import type { Bucket, File, GetSignedUrlConfig } from "@google-cloud/storage";
import type { SignedUrlLedger } from "./SignedUrlLedger";

/**
 * Every signed URL this server issues is a v4 URL.
 *
 * The SDK default is v2, whose URLs carry `Signature`/`GoogleAccessId` instead
 * of `X-Goog-Signature`. Both the ledger and the media proxy key off
 * `X-Goog-Signature`, so a v2 mint site records nothing and can never be
 * rescued — and does so silently, because neither side distinguishes "no
 * signature present" from "not a grant we issued".
 */
const SIGNING_VERSION = "v4" as const;

/** A signed URL and the moment it stops working. */
export interface SignedUrlGrant {
  url: string;
  expiresAtMs: number;
  /** `expiresAtMs` as ISO-8601, the shape wire responses carry. */
  expiresAt: string;
}

export interface ReadGrantOptions {
  ttlMs: number;
  /**
   * `Content-Disposition` GCS should answer with. Omitted by default so the
   * signed URL stays byte-identical to one minted without the option.
   */
  disposition?: string;
}

export interface WriteGrantOptions {
  ttlMs: number;
  contentType: string;
  /** Caps the upload via `x-goog-content-length-range` when set. */
  maxSizeBytes?: number | null;
}

const toGrant = (url: string, expiresAtMs: number): SignedUrlGrant => ({
  url,
  expiresAtMs,
  expiresAt: new Date(expiresAtMs).toISOString(),
});

/**
 * The one place an object path becomes a signed URL.
 *
 * Minting and recording the grant are a single operation rather than a call
 * plus a caller obligation. The media proxy's bucket rescue honours only
 * grants recorded on the ledger, so a mint site that forgot to record would
 * lose its rescue without any signal — which is exactly what happened while
 * five stores each carried their own private `getSignedUrl` helper.
 *
 * Write grants are deliberately not recorded: the rescue only ever reads.
 */
export class SignedUrlMinter {
  constructor(
    private readonly bucket: Bucket,
    private readonly ledger: SignedUrlLedger | null = null,
  ) {}

  get bucketName(): string {
    return this.bucket.name;
  }

  async mintRead(
    objectPath: string,
    options: ReadGrantOptions,
  ): Promise<SignedUrlGrant> {
    return this.signRead(this.bucket.file(objectPath), objectPath, options);
  }

  /**
   * Mint a read grant only when the object actually exists. GCS signs URLs
   * for absent objects too, so signing blindly turns a caller's honest 404
   * into a URL that dies at the bucket.
   */
  async mintReadIfPresent(
    objectPath: string,
    options: ReadGrantOptions,
  ): Promise<SignedUrlGrant | null> {
    const file = this.bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) {
      return null;
    }
    return this.signRead(file, objectPath, options);
  }

  async mintWrite(
    objectPath: string,
    options: WriteGrantOptions,
  ): Promise<SignedUrlGrant> {
    const expiresAtMs = Date.now() + options.ttlMs;
    const extensionHeaders: Record<string, string> = {
      "x-goog-if-generation-match": "0",
    };
    if (options.maxSizeBytes) {
      extensionHeaders["x-goog-content-length-range"] =
        `0,${options.maxSizeBytes}`;
    }

    const [url] = await this.bucket.file(objectPath).getSignedUrl({
      version: SIGNING_VERSION,
      action: "write",
      expires: expiresAtMs,
      contentType: options.contentType,
      extensionHeaders,
    });

    return toGrant(url, expiresAtMs);
  }

  private async signRead(
    file: File,
    objectPath: string,
    options: ReadGrantOptions,
  ): Promise<SignedUrlGrant> {
    const expiresAtMs = Date.now() + options.ttlMs;
    const config: GetSignedUrlConfig = {
      version: SIGNING_VERSION,
      action: "read",
      expires: expiresAtMs,
      ...(options.disposition
        ? { responseDisposition: options.disposition }
        : {}),
    };

    const [url] = await file.getSignedUrl(config);
    this.ledger?.record(objectPath, url);
    return toGrant(url, expiresAtMs);
  }
}
