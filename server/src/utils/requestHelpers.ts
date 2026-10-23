/**
 * Request Helper Utilities
 *
 * Common utilities for extracting and handling request metadata
 */

import type { Request } from "express";
import { isLegacyApiKeyUid } from "./apiKeyUser";

/**
 * Extract userId from request
 * Uses only the identity established by authentication. Unverified request
 * fields and credentials must never become log or persistence identities.
 *
 * @param req - Express request object
 * @returns userId string
 */
export function extractUserId(req: Request): string {
  return extractFirebaseUid(req) ?? "anonymous";
}

/**
 * Extract the authenticated uid, including a nonsecret API-key principal, or
 * null when no safe identity was established. Handlers that reject anonymous
 * callers depend on null rather than extractUserId's log label. No credential
 * or request-body field can supply a fallback identity.
 *
 * @param req - Express request object
 * @returns Authenticated uid, or null if unauthenticated
 */
export function extractFirebaseUid(req: Request): string | null {
  const uid = (req as Request & { user?: { uid?: string } }).user?.uid;
  return uid && !isLegacyApiKeyUid(uid) ? uid : null;
}
