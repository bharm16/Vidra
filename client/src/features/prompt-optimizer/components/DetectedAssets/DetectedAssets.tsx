import React from "react";
import { Check } from "@promptstudio/system/components/ui";
import type { Asset } from "@shared/types/asset";
import { useDetectedAssets } from "./hooks/useDetectedAssets";
import { AssetChip } from "./AssetChip";

interface DetectedAssetsProps {
  prompt: string;
  assets: Asset[];
  onEditAsset?: (assetId: string) => void;
  onCreateFromTrigger?: (trigger: string) => void;
}

export function DetectedAssets({
  prompt,
  assets,
  onEditAsset,
  onCreateFromTrigger,
}: DetectedAssetsProps): React.ReactElement | null {
  const { detectedAssets, unresolvedTriggers, hasCharacter } =
    useDetectedAssets(prompt, assets);

  if (detectedAssets.length === 0 && unresolvedTriggers.length === 0) {
    return null;
  }

  return (
    <div
      className="motion-presence-panel border-border bg-surface-1 px-ps-4 border-b py-2"
      data-motion-state="entered"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted text-xs">Using:</span>

        {detectedAssets.map((asset) => (
          <AssetChip
            key={asset.id}
            asset={asset}
            onEdit={onEditAsset ? () => onEditAsset(asset.id) : undefined}
          />
        ))}

        {unresolvedTriggers.map((trigger) => (
          <button
            key={trigger}
            type="button"
            onClick={() => onCreateFromTrigger?.(trigger)}
            className="motion-pulse-once rounded border border-[color:var(--ps-badge-warning-border)] bg-[color:var(--ps-badge-warning-bg)] px-2 py-1 text-xs font-semibold text-[color:var(--ps-badge-warning-text)]"
          >
            @{trigger} (create?)
          </button>
        ))}

        {hasCharacter && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--ps-badge-success-text)]">
            <Check className="h-3 w-3" />
            Character consistency enabled
          </span>
        )}
      </div>
    </div>
  );
}

export default DetectedAssets;
