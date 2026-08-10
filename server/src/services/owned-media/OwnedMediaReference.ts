import type { StorageType } from "@services/storage/config/storageConfig";
import { storagePathForBasename } from "@services/storage/utils/pathUtils";

const REFERENCE_PREFIX = "om1";
const SEGMENT_SEPARATOR = ".";
const SAFE_BASENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/;

export interface OwnedMediaReference {
  type: StorageType;
  basename: string;
}

/**
 * An owned-media reference is deliberately a purpose + opaque object name,
 * never a GCS path. The owner is supplied by the authenticated request and
 * the path is built only inside this module.
 */
export function createOwnedMediaReference(
  type: StorageType,
  storagePath: string,
): string {
  const basename = storagePath.split("/").filter(Boolean).pop() ?? "";
  if (!SAFE_BASENAME.test(basename)) {
    throw new Error("Cannot create an owned-media reference for this object");
  }
  return [REFERENCE_PREFIX, type, basename].join(SEGMENT_SEPARATOR);
}

export function parseOwnedMediaReference(
  value: string,
): OwnedMediaReference | null {
  const firstSeparator = value.indexOf(SEGMENT_SEPARATOR);
  const secondSeparator = value.indexOf(
    SEGMENT_SEPARATOR,
    firstSeparator + 1,
  );
  if (firstSeparator < 1 || secondSeparator < 0) {
    return null;
  }
  const prefix = value.slice(0, firstSeparator);
  const type = value.slice(firstSeparator + 1, secondSeparator);
  const basename = value.slice(secondSeparator + 1);
  if (prefix !== REFERENCE_PREFIX || !basename) return null;
  if (
    type !== "preview-image" &&
    type !== "preview-video" &&
    type !== "generation"
  ) {
    return null;
  }
  if (!SAFE_BASENAME.test(basename)) {
    return null;
  }
  return { type, basename };
}

/** Build the sole storage path for an owned-media reference and request owner. */
export function resolveOwnedMediaPath(
  ownerId: string,
  reference: string,
): string | null {
  const parsed = parseOwnedMediaReference(reference);
  if (!parsed) return null;
  return storagePathForBasename(ownerId, parsed.type, parsed.basename);
}

export function isOwnedMediaReference(value: string): boolean {
  return parseOwnedMediaReference(value) !== null;
}
