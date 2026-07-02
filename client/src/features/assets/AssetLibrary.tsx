import React, { useEffect, useCallback } from "react";
import {
  Plus,
  User,
  Palette,
  MapPin,
  Box,
  Layers,
  type IconType,
} from "@promptstudio/system/components/ui";
import type {
  Asset,
  AssetType,
  CreateAssetRequest,
  UpdateAssetRequest,
} from "@shared/types/asset";
import { useAssetState } from "./hooks/useAssetState";
import { assetApi } from "./api/assetApi";
import AssetGrid from "./components/AssetGrid";
import AssetEditor from "./components/AssetEditor";
import { ASSET_TYPE_LIST } from "./config/assetConfig";

const ASSET_TYPE_ICONS: Record<string, IconType> = {
  character: User,
  style: Palette,
  location: MapPin,
  object: Box,
};

export function AssetLibrary({
  onSelectForGeneration,
}: {
  onSelectForGeneration?: (asset: Record<string, unknown>) => void;
}): React.ReactElement {
  const { state, actions, filteredAssets } = useAssetState();
  const {
    assets,
    byType,
    selectedAsset,
    isLoading,
    error,
    editorOpen,
    editorMode,
    editorAssetType,
    filterType,
  } = state;

  const loadAssets = useCallback(async () => {
    actions.setLoading(true);
    try {
      const result = await assetApi.list();
      actions.setAssets(result);
    } catch (err) {
      actions.setError(
        err instanceof Error ? err.message : "Failed to load assets",
      );
    }
  }, [actions]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const handleCreateAsset = useCallback(
    async (data: CreateAssetRequest) => {
      try {
        const asset = await assetApi.create(data);
        actions.addAsset(asset);
        return asset;
      } catch (err) {
        actions.setError(
          err instanceof Error ? err.message : "Failed to create asset",
        );
        throw err;
      }
    },
    [actions],
  );

  const handleUpdateAsset = useCallback(
    async (assetId: string, data: UpdateAssetRequest) => {
      try {
        const asset = await assetApi.update(assetId, data);
        actions.updateAsset(asset);
        return asset;
      } catch (err) {
        actions.setError(
          err instanceof Error ? err.message : "Failed to update asset",
        );
        throw err;
      }
    },
    [actions],
  );

  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      try {
        await assetApi.delete(assetId);
        actions.deleteAsset(assetId);
      } catch (err) {
        actions.setError(
          err instanceof Error ? err.message : "Failed to delete asset",
        );
        throw err;
      }
    },
    [actions],
  );

  const handleAddImage = useCallback(
    async (
      assetId: string,
      file: File,
      metadata: Record<string, string | undefined>,
    ) => {
      try {
        await assetApi.addImage(assetId, file, metadata);
        const updated = await assetApi.get(assetId);
        actions.updateAsset(updated);
      } catch (err) {
        actions.setError(
          err instanceof Error ? err.message : "Failed to upload image",
        );
        throw err;
      }
    },
    [actions],
  );

  const handleDeleteImage = useCallback(
    async (assetId: string, imageId: string) => {
      try {
        await assetApi.deleteImage(assetId, imageId);
        const updated = await assetApi.get(assetId);
        actions.updateAsset(updated);
      } catch (err) {
        actions.setError(
          err instanceof Error ? err.message : "Failed to delete image",
        );
        throw err;
      }
    },
    [actions],
  );

  const handleSetPrimaryImage = useCallback(
    async (assetId: string, imageId: string) => {
      try {
        const updated = await assetApi.setPrimaryImage(assetId, imageId);
        actions.updateAsset(updated);
      } catch (err) {
        actions.setError(
          err instanceof Error ? err.message : "Failed to set primary image",
        );
        throw err;
      }
    },
    [actions],
  );

  const handleSelectForGeneration = useCallback(
    async (asset: Asset) => {
      if (onSelectForGeneration && asset.type === "character") {
        try {
          const generationData = await assetApi.getForGeneration(asset.id);
          onSelectForGeneration(generationData);
        } catch (err) {
          actions.setError(
            err instanceof Error ? err.message : "Failed to load asset",
          );
        }
      }
    },
    [onSelectForGeneration, actions],
  );

  return (
    <div className="bg-surface-1 flex h-full flex-col">
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="text-muted h-5 w-5" />
          <h2 className="text-foreground text-lg font-semibold">
            Asset Library
          </h2>
        </div>
        <button
          type="button"
          onClick={() => actions.openEditor("create")}
          className="bg-primary text-primary-foreground flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-[background-color,transform,box-shadow,filter] duration-[140ms] [transition-timing-function:var(--motion-ease-standard)] hover:-translate-y-px hover:shadow-md hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          New Asset
        </button>
      </div>

      <div className="border-border flex items-center gap-2 overflow-x-auto border-b px-4 py-2">
        <button
          type="button"
          onClick={() => actions.setFilter(null)}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
            filterType === null
              ? "motion-pulse-once bg-surface-2 text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          All
          <span className="bg-surface-3 rounded-full px-1.5 py-0.5 text-xs">
            {assets.length}
          </span>
        </button>

        {ASSET_TYPE_LIST.map((typeConfig) => {
          const count = byType[typeConfig.id as keyof typeof byType] || 0;
          const Icon = ASSET_TYPE_ICONS[typeConfig.id] ?? Box;

          return (
            <button
              key={typeConfig.id}
              type="button"
              onClick={() => actions.setFilter(typeConfig.id as AssetType)}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                filterType === typeConfig.id
                  ? `motion-pulse-once ${typeConfig.bgClass} ${typeConfig.colorClass}`
                  : "text-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {typeConfig.label}
              <span className="bg-surface-3 rounded-full px-1.5 py-0.5 text-xs">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="motion-shake-x border-border border-b bg-[color:var(--ps-badge-danger-bg)] px-4 py-2">
          <p className="text-danger text-sm">{error}</p>
        </div>
      )}

      {isLoading && assets.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <div className="border-tool-accent-soft h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
        </div>
      )}

      {!isLoading && assets.length === 0 && (
        <div
          className="motion-presence-panel flex flex-1 flex-col items-center justify-center px-4 text-center"
          data-motion-state="entered"
        >
          <Layers className="text-muted mb-3 h-12 w-12" />
          <h3 className="text-foreground text-lg font-semibold">
            No assets yet
          </h3>
          <p className="text-muted mt-2 max-w-md text-sm">
            Create characters, styles, locations, and objects to keep visual
            consistency. Use
            <code className="text-foreground bg-surface-2 rounded px-1.5 py-0.5">
              @triggers
            </code>{" "}
            in your prompts to reference them.
          </p>
          <div className="mt-5 grid w-full max-w-md grid-cols-2 gap-3">
            {ASSET_TYPE_LIST.map((typeConfig) => {
              const Icon = ASSET_TYPE_ICONS[typeConfig.id] ?? Box;

              return (
                <button
                  key={typeConfig.id}
                  type="button"
                  onClick={() =>
                    actions.openEditor(
                      "create",
                      null,
                      typeConfig.id as AssetType,
                    )
                  }
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${typeConfig.borderClass} ${typeConfig.bgClass}`}
                >
                  <Icon className={`h-4 w-4 ${typeConfig.colorClass}`} />
                  <div>
                    <p
                      className={`text-sm font-semibold ${typeConfig.colorClass}`}
                    >
                      {typeConfig.label}
                    </p>
                    <p className="text-muted text-xs">
                      {typeConfig.description.split(",")[0]}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {filteredAssets.length > 0 && (
        <AssetGrid
          assets={filteredAssets}
          selectedAsset={selectedAsset}
          onSelect={actions.selectAsset}
          onEdit={(asset) => actions.openEditor("edit", asset)}
          onDelete={handleDeleteAsset}
          onSelectForGeneration={handleSelectForGeneration}
        />
      )}

      {editorOpen && (
        <AssetEditor
          mode={editorMode}
          asset={selectedAsset || undefined}
          preselectedType={editorAssetType || undefined}
          onClose={actions.closeEditor}
          onCreate={handleCreateAsset}
          onUpdate={handleUpdateAsset}
          onAddImage={handleAddImage}
          onDeleteImage={handleDeleteImage}
          onSetPrimaryImage={handleSetPrimaryImage}
        />
      )}
    </div>
  );
}

export default AssetLibrary;
