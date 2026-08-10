/**
 * The single answer to "which path segment identifies this object's owner?".
 *
 * Three stores derived this independently — the convergence store and both
 * image adapters — with the same character rule but different handling of a
 * blank owner. That duplication is load-bearing in a way duplication usually
 * is not: convergence builds object paths with one copy and authorizes reads
 * against another, so any drift between them quietly turns an ownership check
 * into a check of nothing.
 *
 * A blank owner throws rather than resolving to a shared namespace.
 * `anonymous/` is not an owner — it is one namespace every caller without a
 * uid shares, which makes everything filed there readable by all of them.
 *
 * Normalisation is idempotent: the output only contains characters the rule
 * already allows, so calling this on an already-normalised segment is safe.
 */
export function ownerSegment(userId: string | null | undefined): string {
  const normalized = (userId ?? "").trim().replace(/[^a-zA-Z0-9._:@-]/g, "_");
  if (!normalized) {
    throw new Error("Media owner is required");
  }
  return normalized;
}
