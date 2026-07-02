import React, { useEffect, useState } from "react";
import { Check } from "@promptstudio/system/components/ui";
import type { Asset } from "@shared/types/asset";
import { getAssetTypeConfig } from "@/features/assets/config/assetConfig";
import { rewriteGcsUrlToProxy } from "@/services/media/MediaUrlResolver";
import { cn } from "@/utils/cn";

interface AssetPopoverProps {
  asset: Asset;
  onEdit?: (() => void) | undefined;
}

export function AssetPopover({
  asset,
  onEdit,
}: AssetPopoverProps): React.ReactElement {
  const primaryImage =
    asset.referenceImages?.find((img) => img.isPrimary) ||
    asset.referenceImages?.[0];
  const thumbnailUrl =
    rewriteGcsUrlToProxy(primaryImage?.thumbnailUrl?.trim?.() ?? "") ?? "";
  const fullUrl = rewriteGcsUrlToProxy(primaryImage?.url?.trim?.() ?? "") ?? "";
  const [imageUrl, setImageUrl] = useState(thumbnailUrl || fullUrl);
  const [didTryFull, setDidTryFull] = useState(false);
  const config = getAssetTypeConfig(asset.type);
  const triggerLabel = asset.trigger.startsWith("@")
    ? asset.trigger
    : `@${asset.trigger}`;

  useEffect(() => {
    setImageUrl(thumbnailUrl || fullUrl);
    setDidTryFull(false);
  }, [thumbnailUrl, fullUrl]);

  const handleImageError = () => {
    if (!didTryFull && fullUrl && imageUrl !== fullUrl) {
      setDidTryFull(true);
      setImageUrl(fullUrl);
      return;
    }
    setImageUrl("");
  };

  return (
    <div className="w-64 p-3">
      <div className="flex gap-3">
        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg",
            imageUrl ? "bg-surface-2" : config.bgClass,
          )}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={handleImageError}
            />
          ) : (
            <span className={cn("text-xs font-semibold", config.colorClass)}>
              {config.label}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-foreground text-sm font-semibold">
            {asset.name}
          </h4>
          <p className="text-muted text-xs">{triggerLabel}</p>
          <p className="text-muted mt-1 text-xs">
            {asset.referenceImages?.length || 0} reference images
          </p>
        </div>
      </div>

      {asset.type === "character" && asset.faceEmbedding && (
        <div className="mt-2 flex items-center gap-1 text-xs text-[color:var(--ps-badge-success-text)]">
          <Check className="h-3 w-3" />
          Face embedding ready
        </div>
      )}

      {asset.textDefinition && (
        <p className="text-muted mt-2 line-clamp-3 text-xs">
          {asset.textDefinition}
        </p>
      )}

      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="border-border text-foreground hover:bg-surface-2 mt-3 w-full rounded-md border px-3 py-1.5 text-xs font-semibold transition"
        >
          Edit Asset
        </button>
      )}
    </div>
  );
}

export default AssetPopover;
