import { logger } from "@infrastructure/Logger";
import {
  storagePathForBasename,
  validatePathOwnership,
} from "@services/storage/utils/pathUtils";
import { ownerSegment } from "./OwnerSegment";

/**
 * The one owner-checked resolver for a session picture's media (ADR-0022
 * decision 4, issue #109).
 *
 * A picture take is durable in one of two stores, addressed one of two ways,
 * and which pair applies depends only on the take's origin:
 *
 *  - a **generated** take records an asset basename and no path; its bytes live
 *    in the user-scoped store under `users/<uid>/previews/images/<basename>`;
 *  - an **admitted** take (upload, sketchpad, studio) records an explicit
 *    `storagePath` in the image-asset store under `<base>/<owner>/<assetId>`.
 *
 * Ownership is proven the same way in both: the path is anchored to the
 * caller's own namespace, so a handle can never address another creator's
 * object. The resolver refuses (returns `null`) rather than rewriting a path
 * or widening the check — a refusal reads as absence, the bridge's own posture.
 *
 * This replaces the two independent, `users/`-only assumptions the bridge and
 * the session-picture lookup each made (the studio bridge required a
 * `users/<uid>/` path; the lookup rebuilt a missing path in that namespace),
 * either of which failed a real picture stored under `image-previews/`.
 */

/** A durable handle to a picture's media, as the session recorded it. */
export interface OwnedPictureHandle {
  /** The stored path, in whichever store owns the object. */
  storagePath?: string | undefined;
  /** The asset basename/id the record carries, when it has one. */
  assetId?: string | undefined;
}

/** A resolved, owner-verified picture: the durable path plus a fresh read URL. */
export interface ResolvedOwnedPicture {
  /** The object's actual stored path — verified owned, never rewritten. */
  storagePath: string;
  /** A freshly minted read URL for the object, for reading or copying it. */
  viewUrl: string;
}

/**
 * The image-asset store (`image-previews/<owner>/<assetId>`). `ImageAssetStore`
 * satisfies this: `getPublicUrl` rebuilds the owner-scoped path from the
 * caller's uid, so an asset id alone never grants a read, and returns `null`
 * when the object is not present under that prefix.
 */
export interface ImagePreviewAssetReader {
  getPublicUrl(assetId: string, userId: string): Promise<string | null>;
}

/**
 * The user-scoped store (`users/<uid>/...`). `StorageService` satisfies this:
 * `getViewUrl` mints a URL for a path the anchored `users/<uid>/` rule already
 * proved is the caller's, and `getPreviewImageViewUrl` rebuilds the path from
 * the caller's uid, returning `null` when the object is not present.
 */
export interface UserScopedMediaReader {
  getViewUrl(userId: string, storagePath: string): Promise<{ viewUrl: string }>;
  getPreviewImageViewUrl(
    userId: string,
    assetBasename: string,
  ): Promise<string | null>;
}

const USER_SCOPE_PREFIX = "users/";

const log = logger.child({ service: "OwnedPictureResolver" });

function lastSegment(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * The owner segment of an image-asset-store path: `<base>/<owner>/<assetId>`,
 * so the owner is always the second-to-last segment — base-path-agnostic, and
 * so it never has to duplicate the store's `IMAGE_STORAGE_BASE_PATH`.
 */
function imageAssetOwnerSegment(path: string): string | undefined {
  const parts = path.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : undefined;
}

/**
 * Whether `storagePath` is anchored to `userId` in EITHER store — the pure
 * ownership predicate both this resolver and the studio bridge's own
 * defense-in-depth check use, so there is one source of truth for "is this
 * path yours". A `users/` path uses the storage module's anchored rule; an
 * image-asset path compares its owner segment to the caller's, the same
 * ownership `GcsImageAssetStore` bakes into every path it writes.
 */
export function isOwnedPicturePath(
  userId: string,
  storagePath: string,
): boolean {
  if (storagePath.startsWith(USER_SCOPE_PREFIX)) {
    return validatePathOwnership(storagePath, userId);
  }
  return imageAssetOwnerSegment(storagePath) === ownerSegment(userId);
}

export interface OwnedPictureResolver {
  /**
   * Resolve a picture handle to its owner-verified path and a fresh read URL,
   * or `null` when the creator does not own it or it cannot be found.
   */
  resolveOwnedPicture(
    userId: string,
    handle: OwnedPictureHandle,
  ): Promise<ResolvedOwnedPicture | null>;
}

export function createOwnedPictureResolver(deps: {
  imageAssets: ImagePreviewAssetReader;
  userStorage: UserScopedMediaReader;
}): OwnedPictureResolver {
  const { imageAssets, userStorage } = deps;

  return {
    async resolveOwnedPicture(userId, handle) {
      const { storagePath, assetId } = handle;

      if (storagePath) {
        // A user-scoped object: prove ownership with the anchored rule, then
        // sign it. An unowned path is refused before anything is minted.
        if (storagePath.startsWith(USER_SCOPE_PREFIX)) {
          if (!validatePathOwnership(storagePath, userId)) {
            log.warn("Refused picture: storage path is not the creator's", {
              userId,
            });
            return null;
          }
          const { viewUrl } = await userStorage.getViewUrl(userId, storagePath);
          return { storagePath, viewUrl };
        }
        // Otherwise an image-asset-store object. Prove ownership by its owner
        // segment — the same segment the store anchors every write to — then
        // sign via the store, which rebuilds that exact owner-scoped path from
        // the caller's uid. The path itself is returned unchanged.
        if (imageAssetOwnerSegment(storagePath) !== ownerSegment(userId)) {
          log.warn("Refused picture: storage path is not the creator's", {
            userId,
          });
          return null;
        }
        const viewUrl = await imageAssets.getPublicUrl(
          lastSegment(storagePath),
          userId,
        );
        return viewUrl ? { storagePath, viewUrl } : null;
      }

      if (assetId) {
        // A handle with an asset id but no path is a generated take, whose bytes
        // live in the user-scoped store under the basename. Resolved through the
        // store (present-or-null), not by assuming the object is there.
        const viewUrl = await userStorage.getPreviewImageViewUrl(
          userId,
          assetId,
        );
        if (!viewUrl) return null;
        return {
          storagePath: storagePathForBasename(userId, "preview-image", assetId),
          viewUrl,
        };
      }

      return null;
    },
  };
}
