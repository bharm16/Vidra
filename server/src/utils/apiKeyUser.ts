import { createHash } from "node:crypto";
import { DomainError } from "@server/errors/DomainError";

/** API-key principals remain non-credit-bearing, but never contain a credential. */
export const API_KEY_UID_PREFIX = "api-key-v1:";
const LEGACY_API_KEY_UID_PREFIX = "api-key:";
const PRINCIPAL_PATTERN = /^api-key-v1:[a-f0-9]{64}$/;

/** A versioned identity, not an alias for the former raw-key owner namespace. */
export function apiKeyUid(apiKey: string): string {
  if (!apiKey) throw new Error("An API key is required");
  const digest = createHash("sha256")
    .update("vidra.api-key-principal.v1\0")
    .update(apiKey)
    .digest("hex");
  return `${API_KEY_UID_PREFIX}${digest}`;
}

export function isApiKeyUid(userId: string): boolean {
  return userId.startsWith(API_KEY_UID_PREFIX) || userId.startsWith(LEGACY_API_KEY_UID_PREFIX);
}

export function isLegacyApiKeyUid(userId: string): boolean {
  // Former credentials were arbitrary strings: no suffix in their namespace
  // can prove that an owner is a new principal, even a version plus a digest.
  return userId.startsWith(LEGACY_API_KEY_UID_PREFIX)
    || (userId.startsWith(API_KEY_UID_PREFIX) && !PRINCIPAL_PATTERN.test(userId));
}

class LegacyApiKeyIdentityError extends DomainError {
  readonly code = "AUTH_REQUIRED";
  constructor() {
    super("This media is unavailable.");
    this.name = "LegacyApiKeyIdentityError";
  }
  getHttpStatus(): number { return 403; }
  getUserMessage(): string { return this.message; }
}

/**
 * Old owner paths exposed credentials. Refuse them before signing, encoding or
 * logging; never infer that a raw-key owner belongs to a new hashed principal.
 */
export function assertNoLegacyApiKeyData(value: string): void {
  let decoded = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (decoded.split("/").some(segment => isLegacyApiKeyUid(segment.trim()))) {
      throw new LegacyApiKeyIdentityError();
    }
    // Inspect encoded owner delimiters even if unrelated bytes aren't valid
    // UTF-8. This is detection only: it never rewrites the actual identity/path.
    const next = decoded.replace(/%([a-f0-9]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
    if (next === decoded) return;
    decoded = next;
  }
  // An excessively nested representation cannot establish a safe namespace.
  throw new LegacyApiKeyIdentityError();
}
