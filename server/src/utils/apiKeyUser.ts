/**
 * API-key principals are minted by apiAuth as `api-key:<key>` uids. They are
 * not credit-bearing users: the starter-grant middleware never creates a user
 * doc for them and the availability gate treats them as plan-tier "unknown".
 * This is the single home for that rule — apiAuth (the producer) and every
 * consumer derive from it.
 *
 * Known consequence (audit run 4, A2-F5): because no user doc exists,
 * reserveCredits returns false for these uids, so an API-key caller reaching
 * a credit-charging route gets a 402. Whether API-key auth should ever reach
 * generation is an open product decision; centralizing the predicate is the
 * prerequisite either way.
 */
export const API_KEY_UID_PREFIX = "api-key:";

export function isApiKeyUid(userId: string): boolean {
  return userId.startsWith(API_KEY_UID_PREFIX);
}
