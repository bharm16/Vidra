/**
 * Image asset storage types
 */

export interface StoredImageAsset {
  id: string;
  storagePath: string;
  url: string;
  contentType: string;
  createdAt: number;
  sizeBytes?: number;
  expiresAt?: number;
}

export interface ImageAssetStore {
  /**
   * Download an image from a URL and store it
   */
  storeFromUrl(
    sourceUrl: string,
    userId: string,
    contentType?: string,
  ): Promise<StoredImageAsset>;

  /**
   * Store an image from a buffer
   */
  storeFromBuffer(
    buffer: Buffer,
    contentType: string,
    userId: string,
    metadata?: Readonly<Record<string, string>>,
  ): Promise<StoredImageAsset>;

  /**
   * Get a signed/public URL for an asset
   */
  getPublicUrl(assetId: string, userId: string): Promise<string | null>;

  /**
   * Check if an asset exists
   */
  exists(assetId: string, userId: string): Promise<boolean>;

  /**
   * Delete expired assets
   */
  cleanupExpired(olderThanMs: number, maxItems?: number): Promise<number>;
}
