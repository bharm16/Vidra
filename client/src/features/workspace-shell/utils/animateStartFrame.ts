import type { KeyframeTile } from "@features/generation-controls";
import type { SpaceNode } from "@/features/space/lineage/types";

/**
 * Arm a picture space node as the video loop's first frame ("Make it move",
 * RULINGS §5) — issue #125.
 *
 * The node's DURABLE handle (`storagePath` / `assetId`) travels into the armed
 * tile beside its URL, so a node whose signed `mediaUrl` has expired is still
 * animatable: the keyframe-refresh loop re-mints a fresh URL from the handle,
 * and the take's `generationId` still rides through as the clip's source
 * picture. Before this the tile carried the URL and the take id only, so an
 * expired node produced a clip request against a dead URL.
 *
 * Returns `null` when the node offers neither a URL nor a handle — nothing to
 * arm, and inventing one would be a namespace guess. A URL-less node with a
 * handle still arms: the empty URL is filled by the first refresh.
 */
export function buildAnimateStartFrame(
  node: SpaceNode,
  words?: string | null,
): KeyframeTile | null {
  const hasHandle = Boolean(node.storagePath ?? node.assetId);
  if (!node.mediaUrl && !hasHandle) return null;

  return {
    id: `space-animate-${node.id}`,
    url: node.mediaUrl ?? "",
    source: "generation",
    generationId: node.id,
    ...(node.storagePath ? { storagePath: node.storagePath } : {}),
    ...(node.assetId ? { assetId: node.assetId } : {}),
    ...(node.viewUrlExpiresAt
      ? { viewUrlExpiresAt: node.viewUrlExpiresAt }
      : {}),
    ...(words ? { sourcePrompt: words } : {}),
  };
}
