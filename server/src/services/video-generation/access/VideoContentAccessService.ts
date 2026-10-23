import crypto from "node:crypto";
import { logger } from "@infrastructure/Logger";
import { assertNoLegacyApiKeyData } from "@utils/apiKeyUser";

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60;
const CONTENT_PATH_PREFIX = "/api/preview/video/content";
const CURRENT_TOKEN_VERSION = 1;

export interface VideoContentTokenPayload {
  assetId: string;
  userId?: string;
  expiresAtMs: number;
}

interface VideoContentAccessOptions {
  secret: string;
  /**
   * Optional previous secret(s). Tokens signed with these are still accepted
   * during a rotation grace period. New tokens are always signed with `secret`.
   */
  previousSecrets?: readonly string[];
  ttlMs: number;
}

interface IssueTokenParams {
  assetId: string;
  userId?: string;
  ttlMs?: number;
}

export class VideoContentAccessService {
  private readonly secret: string;
  private readonly previousSecrets: readonly string[];
  private readonly ttlMs: number;

  constructor(options: VideoContentAccessOptions) {
    this.secret = options.secret;
    this.previousSecrets = (options.previousSecrets ?? []).filter(
      (s) => typeof s === "string" && s.length > 0,
    );
    this.ttlMs = options.ttlMs;
  }

  issueToken({ assetId, userId, ttlMs }: IssueTokenParams): string {
    assertNoLegacyApiKeyData(assetId);
    if (userId) assertNoLegacyApiKeyData(userId);
    const payload = {
      assetId,
      userId,
      expiresAtMs: Date.now() + (ttlMs ?? this.ttlMs),
      version: CURRENT_TOKEN_VERSION,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.signWith(this.secret, encoded);
    return `${encoded}.${signature}`;
  }

  verifyToken(token: string, assetId: string): VideoContentTokenPayload | null {
    const parts = token.split(".");
    if (parts.length !== 2) {
      return null;
    }

    const [encoded, signature] = parts;
    if (!encoded || !signature) {
      return null;
    }

    if (!this.signatureMatchesAnyKey(encoded, signature)) {
      return null;
    }

    let parsed: VideoContentTokenPayload & { version?: number };
    try {
      parsed = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8"),
      ) as VideoContentTokenPayload & {
        version?: number;
      };
    } catch {
      return null;
    }

    if (parsed.assetId !== assetId) {
      return null;
    }

    if (parsed.userId !== undefined && typeof parsed.userId !== "string") return null;
    try {
      assertNoLegacyApiKeyData(parsed.assetId);
      if (parsed.userId) assertNoLegacyApiKeyData(parsed.userId);
    } catch { return null; }

    if (
      !Number.isFinite(parsed.expiresAtMs) ||
      parsed.expiresAtMs <= Date.now()
    ) {
      return null;
    }

    return {
      assetId: parsed.assetId,
      ...(parsed.userId ? { userId: parsed.userId } : {}),
      expiresAtMs: parsed.expiresAtMs,
    };
  }

  buildAccessUrl(url: string, assetId: string, userId?: string): string {
    assertNoLegacyApiKeyData(url);
    assertNoLegacyApiKeyData(assetId);
    if (userId) assertNoLegacyApiKeyData(userId);
    if (!this.isLocalContentUrl(url)) {
      return url;
    }

    const token = this.issueToken({
      assetId,
      ...(userId ? { userId } : {}),
    });
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  }

  private isLocalContentUrl(url: string): boolean {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      try {
        const parsed = new URL(url);
        return parsed.pathname.startsWith(CONTENT_PATH_PREFIX);
      } catch {
        return false;
      }
    }

    return url.startsWith(CONTENT_PATH_PREFIX);
  }

  /**
   * Try the current secret first; if it fails, fall back to previous secrets.
   * This supports zero-downtime rotation: deploy the new secret as `secret`
   * and keep the old one in `previousSecrets` for the grace period.
   */
  private signatureMatchesAnyKey(encoded: string, signature: string): boolean {
    if (this.timingSafeEqual(signature, this.signWith(this.secret, encoded))) {
      return true;
    }
    for (const prev of this.previousSecrets) {
      if (this.timingSafeEqual(signature, this.signWith(prev, encoded))) {
        return true;
      }
    }
    return false;
  }

  private signWith(key: string, value: string): string {
    return crypto.createHmac("sha256", key).update(value).digest("base64url");
  }

  private timingSafeEqual(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(aBuffer, bBuffer);
  }
}

interface AccessConfig {
  tokenSecret: string | undefined;
  /**
   * Comma-separated list of retired token secrets still accepted during a
   * rotation grace period. Read from VIDEO_CONTENT_TOKEN_SECRET_PREVIOUS.
   */
  previousTokenSecrets?: readonly string[];
  tokenTtlSeconds: number;
}

export function createVideoContentAccessService(
  config: AccessConfig,
): VideoContentAccessService | null {
  const ttlMs = config.tokenTtlSeconds * 1000;
  const previousSecrets = (config.previousTokenSecrets ?? []).filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0,
  );

  if (config.tokenSecret && config.tokenSecret.trim().length > 0) {
    return new VideoContentAccessService({
      secret: config.tokenSecret,
      ttlMs,
      ...(previousSecrets.length > 0 ? { previousSecrets } : {}),
    });
  }

  if (process.env.NODE_ENV === "production") {
    logger.error(
      "VIDEO_CONTENT_TOKEN_SECRET is required in production for secure video access",
    );
    return null;
  }

  const ephemeralSecret = crypto.randomBytes(32).toString("hex");
  logger.warn(
    "VIDEO_CONTENT_TOKEN_SECRET not set; using ephemeral key for development",
  );
  return new VideoContentAccessService({ secret: ephemeralSecret, ttlMs });
}
