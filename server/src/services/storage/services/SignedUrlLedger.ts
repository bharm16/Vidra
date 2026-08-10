import { createHash } from "node:crypto";
import { logger } from "@infrastructure/Logger";

/**
 * Ledger of signed URLs this server has minted.
 *
 * The media proxy is mounted pre-auth ("the signed URL is the authorization"),
 * and its bucket rescue streams objects with SERVER credentials when the
 * upstream signed-URL fetch fails (expiry, key rotation, GCS refusals). That
 * rescue is only sound if possession of the URL proves a grant WE issued —
 * otherwise anyone can read arbitrary bucket objects behind a forged
 * signature. Cryptographic re-derivation can't prove it either: the SDK
 * refuses to re-sign past-dated windows, and a rotated key can't verify its
 * own history.
 *
 * So every mint records sha256(objectPath|signature) here, and the rescue
 * checks membership. Binding the signature to its object path means a leaked
 * signature can never be replayed onto a different object.
 *
 * Durability is whatever the injected cache provides, and today that is the
 * process-local one: grants do not survive a restart and are not shared across
 * instances, so isMintedGrant answers false for URLs this deployment really
 * minted. The rescue is best-effort by construction, not a guarantee.
 *
 * Everything fails safe: a missing cache, a write error, an evicted entry, or a
 * grant minted by a process that has since gone away all mean the same thing —
 * "not verifiable". The rescue is itself a fallback for an upstream fetch that
 * already failed, so refusing it returns the status the caller would have seen
 * anyway, and the client's media resolver re-mints through the authed asset
 * routes. Availability never depends on this ledger. Refusals are visible at
 * the proxy as `media_proxy.rescue_refused_unverified`; a sustained rate of
 * them on restarts is the expected shape, not an incident.
 */

/** Structural slice of CacheService the ledger needs. */
export interface SignedUrlLedgerCache {
  get<T = unknown>(key: string, cacheType?: string): Promise<T | null>;
  set<T = unknown>(
    key: string,
    value: T,
    options?: { ttl?: number },
  ): Promise<boolean>;
}

/**
 * Grants stay verifiable well past their 1h signing TTL — long enough that
 * any persisted URL a returning user still holds can be rescued, short enough
 * that the ledger stays bounded.
 */
const LEDGER_TTL_SECONDS = 7 * 24 * 3600;
const KEY_PREFIX = "signed-url-grant:";
const CACHE_TYPE = "signedUrlLedger";

const log = logger.child({ service: "SignedUrlLedger" });

const grantKey = (objectPath: string, signature: string): string =>
  KEY_PREFIX +
  createHash("sha256").update(`${objectPath}|${signature}`).digest("hex");

const extractSignature = (signedUrl: string): string | null => {
  try {
    return new URL(signedUrl).searchParams.get("X-Goog-Signature");
  } catch {
    return null;
  }
};

export class SignedUrlLedger {
  constructor(private readonly cache: SignedUrlLedgerCache | null) {}

  /**
   * Record a freshly minted signed URL for its object path. Fire-and-forget:
   * minting must never fail or slow down because the ledger hiccuped.
   */
  record(objectPath: string, signedUrl: string): void {
    if (!this.cache) return;
    const signature = extractSignature(signedUrl);
    if (!signature) return;
    void this.cache
      .set(grantKey(objectPath, signature), true, { ttl: LEDGER_TTL_SECONDS })
      .catch((error: unknown) => {
        log.warn("Failed to record minted grant", {
          objectPath,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  /** True iff we minted this exact signature for this exact object path. */
  async isMintedGrant(objectPath: string, signature: string): Promise<boolean> {
    if (!this.cache || !signature) return false;
    try {
      const entry = await this.cache.get<boolean>(
        grantKey(objectPath, signature),
        CACHE_TYPE,
      );
      return entry === true;
    } catch (error) {
      log.warn("Ledger lookup failed", {
        objectPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
