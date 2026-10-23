import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";

/**
 * A mask input must be an area painted on this request's exact picture at its exact size (CONTEXT: area drawing).
 * `media[i]` is the version resolved for `inputs[i]`. A mismatch blocks the request; it never becomes a whole-picture edit.
 */
export function areaMaskMismatch(inputs: ReadonlyArray<{ role: string; versionId: string }>, media: readonly MediaVersion[]): boolean {
  const masks = inputs.flatMap((input, index) => input.role === "mask" ? [media[index]] : []);
  if (!masks.length) return false;
  const primaryIndex = inputs.findIndex(input => input.role === "primary");
  const primary = primaryIndex < 0 ? undefined : media[primaryIndex];
  const size = (version: MediaVersion | undefined): string | undefined => version?.metadata.state === "verified" ? `${version.metadata.width}x${version.metadata.height}` : undefined;
  return masks.some(mask => !mask || !primary || mask.origin.kind !== "area-mask" || mask.origin.versionId !== primary.id || size(mask) === undefined || size(mask) !== size(primary));
}
