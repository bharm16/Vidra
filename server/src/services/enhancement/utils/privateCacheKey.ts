import { sha256Hex } from "@utils/hash";
import { canonicalJson } from "@shared/workflow/canonicalJson";

/** Private generation results require an explicit, verified owner from intake. */
export function privateCacheKey(
  namespace: string,
  ownerId: string | undefined,
  effectiveInputs: unknown,
): string | null {
  if (!ownerId?.trim() || ownerId.trim() === "anonymous") return null;

  // Hash exact inputs together: semantic normalization can merge distinct
  // private requests, and raw identifiers or prompt text must not reach logs.
  const digest = sha256Hex(canonicalJson([ownerId, effectiveInputs]));
  return `${namespace}:private-v3:${digest}`;
}
