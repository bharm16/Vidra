import type { ReactElement } from "react";
import { Users } from "@promptstudio/system/components/ui";
import type { Asset, AssetType } from "@shared/types/asset";
import { AssetThumbnail } from "@features/prompt-optimizer/components/AssetsSidebar/AssetThumbnail";
import {
  useSidebarAssetsDomain,
  useSidebarPromptInteractionDomain,
} from "@/components/ToolSidebar/context";
import { PanelHeader } from "./PanelHeader";

interface CharactersPanelProps {
  assets?: Asset[];
  characterAssets?: Asset[];
  isLoading?: boolean;
  onInsertTrigger?: (trigger: string) => void;
  onEditAsset?: (assetId: string) => void;
  onCreateAsset?: (type: AssetType) => void;
}

const noopWithString = (_value: string): void => {};
const noopCreate = (_type: AssetType): void => {};

export function CharactersPanel(props: CharactersPanelProps): ReactElement {
  const assetsDomain = useSidebarAssetsDomain();
  const promptInteractionDomain = useSidebarPromptInteractionDomain();

  const assets = props.assets ?? assetsDomain?.assets ?? [];
  const characterAssets =
    props.characterAssets ?? assetsDomain?.assetsByType.character ?? [];
  const isLoading = props.isLoading ?? assetsDomain?.isLoadingAssets ?? false;
  const onInsertTrigger =
    props.onInsertTrigger ??
    promptInteractionDomain?.onInsertTrigger ??
    noopWithString;
  const onEditAsset =
    props.onEditAsset ?? assetsDomain?.onEditAsset ?? noopWithString;
  const onCreateAsset =
    props.onCreateAsset ?? assetsDomain?.onCreateAsset ?? noopCreate;

  const items = characterAssets.length
    ? characterAssets
    : assets.filter((asset) => asset.type === "character");

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={Users}
        title="Characters"
        onNew={() => onCreateAsset("character")}
      />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="border-tool-accent-soft h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-ghost text-sm">No characters yet</div>
          <button
            type="button"
            onClick={() => onCreateAsset("character")}
            className="border-tool-border-primary text-ghost h-8 rounded-md border px-3 text-sm"
          >
            Create character
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            {items.map((asset) => (
              <AssetThumbnail
                key={asset.id}
                asset={asset}
                onInsert={() => onInsertTrigger(asset.trigger)}
                onEdit={() => onEditAsset(asset.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
