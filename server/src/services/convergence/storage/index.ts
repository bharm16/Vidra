/**
 * Storage module for Visual Convergence
 *
 * Provides GCS storage operations for convergence images.
 *
 * @module convergence/storage
 */

export type { StorageService } from "./StorageService";
export {
  GCSStorageService,
  createGCSStorageService,
  DEFAULT_CONVERGENCE_SIGNED_URL_TTL_MS,
} from "./StorageService";
