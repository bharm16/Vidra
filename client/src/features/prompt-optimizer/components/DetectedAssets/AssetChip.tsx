import React from "react";
import {
  Box,
  MapPin,
  Palette,
  User,
  type IconType,
} from "@promptstudio/system/components/ui";
import type { Asset } from "@shared/types/asset";
import { cn } from "@/utils/cn";
import { getAssetTypeConfig } from "@/features/assets/config/assetConfig";
import { AssetPopover } from "./AssetPopover";

const TYPE_ICONS: Record<string, IconType> = {
  character: User,
  style: Palette,
  location: MapPin,
  object: Box,
};

interface AssetChipProps {
  asset: Asset;
  onEdit?: (() => void) | undefined;
}

export function AssetChip({
  asset,
  onEdit,
}: AssetChipProps): React.ReactElement {
  const Icon = TYPE_ICONS[asset.type] || Box;
  const config = getAssetTypeConfig(asset.type);
  const triggerLabel = asset.trigger.startsWith("@")
    ? asset.trigger
    : `@${asset.trigger}`;

  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        aria-label={triggerLabel}
        className={cn(
          "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold transition",
          "bg-surface-2 text-foreground hover:bg-surface-3",
          config.colorClass,
        )}
      >
        <Icon className="h-3 w-3" />
        <span>{triggerLabel}</span>
      </button>
      <div
        className={cn(
          "pointer-events-none absolute left-0 top-full z-popover mt-1",
          "opacity-0 transition-opacity duration-150",
          "group-hover:pointer-events-auto group-hover:opacity-100",
          "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        )}
      >
        <div className="rounded-md border border-border bg-surface-1 shadow-lg">
          <AssetPopover asset={asset} onEdit={onEdit} />
        </div>
      </div>
    </div>
  );
}

export default AssetChip;
