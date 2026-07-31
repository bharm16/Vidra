/**
 * Asset contract types.
 *
 * The response shapes are inferred from the Zod schemas in
 * `shared/schemas/asset.schemas.ts` — that module is the single declaration,
 * so a schema and its type cannot disagree. Request shapes below are the
 * client's input, never parsed off the wire, so they stay hand-written.
 */
import type { z } from "zod";
import type {
  AssetListResponseSchema,
  AssetReferenceImageSchema,
  AssetSchema,
  AssetTypeSchema,
  ResolvedPromptSchema,
} from "../schemas/asset.schemas.js";

export type AssetType = z.infer<typeof AssetTypeSchema>;

export type AssetReferenceImage = z.infer<typeof AssetReferenceImageSchema>;

export type Asset = z.infer<typeof AssetSchema>;

export type AssetListResponse = z.infer<typeof AssetListResponseSchema>;

export type ResolvedPrompt = z.infer<typeof ResolvedPromptSchema>;

export interface CreateAssetRequest {
  type: AssetType;
  trigger: string;
  name: string;
  textDefinition?: string;
  negativePrompt?: string;
}

export interface UpdateAssetRequest {
  trigger?: string;
  name?: string;
  textDefinition?: string;
  negativePrompt?: string;
}

export function isCharacterAsset(asset: Asset): boolean {
  return asset.type === "character";
}

export function isStyleAsset(asset: Asset): boolean {
  return asset.type === "style";
}

export function isLocationAsset(asset: Asset): boolean {
  return asset.type === "location";
}
