import React, { useEffect, useState } from "react";
import {
  Edit,
  Trash2,
  Wand2,
  User,
  Palette,
  MapPin,
  Box,
  type IconType,
} from "@promptstudio/system/components/ui";
import type { Asset } from "@shared/types/asset";
import { getAssetTypeConfig } from "../config/assetConfig";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";

const TYPE_ICONS: Record<string, IconType> = {
  character: User,
  style: Palette,
  location: MapPin,
  object: Box,
};

interface AssetCardProps {
  asset: Asset;
  isSelected: boolean;
  onSelect: (asset: Asset) => void;
  onEdit: (asset: Asset) => void;
  onDelete: (assetId: string) => void;
  onUseInGeneration?: ((asset: Asset) => void) | undefined;
}

export function AssetCard({
  asset,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onUseInGeneration,
}: AssetCardProps): React.ReactElement {
  const config = getAssetTypeConfig(asset.type);
  const TypeIcon = TYPE_ICONS[asset.type] || Box;

  const primaryImage =
    asset.referenceImages?.find((img) => img.isPrimary) ||
    asset.referenceImages?.[0];
  const thumbnailUrl = primaryImage?.thumbnailUrl?.trim?.() ?? "";
  const fullUrl = primaryImage?.url?.trim?.() ?? "";
  const { url: resolvedThumbnailUrl } = useResolvedMediaUrl({
    kind: "image",
    url: thumbnailUrl || null,
    storagePath: primaryImage?.thumbnailPath ?? null,
    enabled: Boolean(thumbnailUrl || primaryImage?.thumbnailPath),
  });
  const { url: resolvedFullUrl } = useResolvedMediaUrl({
    kind: "image",
    url: fullUrl || null,
    storagePath: primaryImage?.storagePath ?? null,
    enabled: Boolean(fullUrl || primaryImage?.storagePath),
  });
  const preferredThumbnailUrl = resolvedThumbnailUrl || thumbnailUrl;
  const preferredFullUrl = resolvedFullUrl || fullUrl;
  const [imageUrl, setImageUrl] = useState(
    preferredThumbnailUrl || preferredFullUrl,
  );
  const [didTryFull, setDidTryFull] = useState(false);

  useEffect(() => {
    setImageUrl(preferredThumbnailUrl || preferredFullUrl);
    setDidTryFull(false);
  }, [preferredThumbnailUrl, preferredFullUrl, primaryImage?.id]);

  const handleImageError = () => {
    if (!didTryFull && preferredFullUrl && imageUrl !== preferredFullUrl) {
      setDidTryFull(true);
      setImageUrl(preferredFullUrl);
      return;
    }
    setImageUrl("");
  };

  return (
    <div
      onClick={() => onSelect(asset)}
      className={`group relative overflow-hidden rounded-xl border transition-[transform,border-color,box-shadow] duration-[180ms] [transition-timing-function:var(--motion-ease-emphasized)] ${
        isSelected
          ? "border-border-strong scale-[1.01] shadow-sm"
          : "border-border hover:-translate-y-0.5 hover:shadow-sm"
      }`}
    >
      <div className="bg-surface-2 aspect-square">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={asset.name}
            className="h-full w-full object-cover transition-transform duration-[180ms] [transition-timing-function:var(--motion-ease-emphasized)] group-hover:scale-[1.03]"
            onError={handleImageError}
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center ${config.bgClass}`}
          >
            <TypeIcon className={`h-12 w-12 ${config.colorClass} opacity-60`} />
          </div>
        )}
      </div>

      <div
        className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium ${config.bgClass} ${config.colorClass}`}
      >
        {config.label}
      </div>

      <div className="absolute inset-0 opacity-0 transition-opacity duration-[160ms] [transition-timing-function:var(--motion-ease-standard)] group-hover:opacity-100">
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 via-black/10 to-transparent px-3 pb-3 pt-6">
          <div className="flex gap-1">
            {asset.type === "character" && onUseInGeneration && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUseInGeneration(asset);
                }}
                className="bg-primary text-primary-foreground rounded-md p-1.5 transition-[background-color,filter] hover:brightness-110"
                title="Use in generation"
              >
                <Wand2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(asset);
              }}
              className="rounded-md bg-black/60 p-1.5 text-white transition-colors hover:bg-black/70"
              title="Edit"
            >
              <Edit className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (window.confirm(`Delete "${asset.name}"?`)) {
                onDelete(asset.id);
              }
            }}
            className="hover:bg-danger rounded-md bg-black/60 p-1.5 text-white transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="bg-surface-1 space-y-1 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-foreground truncate text-sm font-semibold">
              {asset.name}
            </h3>
            <p className={`truncate text-xs ${config.colorClass}`}>
              {asset.trigger}
            </p>
          </div>
        </div>
        <p className="ps-line-clamp-2 text-muted text-xs">
          {asset.textDefinition}
        </p>
        <p className="text-muted text-xs">
          {(asset.referenceImages?.length || 0).toString()} image
          {asset.referenceImages?.length !== 1 ? "s" : ""}
          {asset.usageCount > 0 ? ` · Used ${asset.usageCount}x` : ""}
        </p>
      </div>
    </div>
  );
}

export default AssetCard;
