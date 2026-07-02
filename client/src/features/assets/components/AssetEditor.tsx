import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@promptstudio/system/components/ui/dialog";
import { Input } from "@promptstudio/system/components/ui/input";
import { Textarea } from "@promptstudio/system/components/ui/textarea";
import { Button } from "@promptstudio/system/components/ui/button";
import type { Asset, AssetType } from "@shared/types/asset";
import { ASSET_TYPES, getAssetTypeConfig } from "../config/assetConfig";
import AssetTypeSelector from "./AssetTypeSelector";
import ReferenceImageUploader from "./ReferenceImageUploader";
import ReferenceImageGrid from "./ReferenceImageGrid";

interface AssetEditorProps {
  mode: "create" | "edit";
  asset?: Asset | undefined;
  preselectedType?: AssetType | undefined;
  onClose: () => void;
  onCreate: (data: {
    type: AssetType;
    trigger: string;
    name: string;
    textDefinition?: string;
    negativePrompt?: string;
  }) => Promise<Asset>;
  onUpdate: (
    assetId: string,
    data: {
      trigger?: string;
      name?: string;
      textDefinition?: string;
      negativePrompt?: string;
    },
  ) => Promise<Asset>;
  onAddImage: (
    assetId: string,
    file: File,
    metadata: Record<string, string | undefined>,
  ) => Promise<void>;
  onDeleteImage: (assetId: string, imageId: string) => Promise<void>;
  onSetPrimaryImage: (assetId: string, imageId: string) => Promise<void>;
}

export function AssetEditor({
  mode,
  asset,
  preselectedType,
  onClose,
  onCreate,
  onUpdate,
  onAddImage,
  onDeleteImage,
  onSetPrimaryImage,
}: AssetEditorProps): React.ReactElement {
  const [type, setType] = useState<AssetType>(
    preselectedType || asset?.type || "character",
  );
  const [name, setName] = useState(asset?.name || "");
  const [trigger, setTrigger] = useState(asset?.trigger || "");
  const [textDefinition, setTextDefinition] = useState(
    asset?.textDefinition || "",
  );
  const [negativePrompt, setNegativePrompt] = useState(
    asset?.negativePrompt || "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (asset) {
      setType(asset.type);
      setName(asset.name);
      setTrigger(asset.trigger);
      setTextDefinition(asset.textDefinition);
      setNegativePrompt(asset.negativePrompt || "");
    } else if (preselectedType) {
      setType(preselectedType);
    }
  }, [asset, preselectedType]);

  const config = getAssetTypeConfig(type);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      if (type !== "character" && !textDefinition.trim()) {
        setError("Description is required for this asset type.");
        return;
      }
      if (mode === "create") {
        await onCreate({
          type,
          trigger,
          name,
          ...(textDefinition.trim() ? { textDefinition } : {}),
          negativePrompt,
        });
      } else if (asset) {
        await onUpdate(asset.id, {
          trigger,
          name,
          textDefinition: textDefinition.trim(),
          negativePrompt,
        });
      }
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save asset";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const showReferenceImages = mode === "edit" && asset;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="border-border bg-surface-1 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border p-6 shadow-lg">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-foreground text-lg font-semibold">
            {mode === "create" ? "Create asset" : "Edit asset"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {mode === "create"
              ? "Configure your asset type, name, and description."
              : "Update your asset name and description."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {mode === "create" ? (
            <div>
              <label className="text-foreground mb-2 block text-sm font-medium">
                Asset type
              </label>
              <AssetTypeSelector value={type} onChange={setType} />
              <p className="text-muted mt-2 text-xs">
                {ASSET_TYPES[type].description}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${config.bgClass} ${config.colorClass}`}
              >
                {config.label}
              </span>
              <span className="text-muted text-xs">Type is locked</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-foreground mb-1 block text-sm font-medium">
                Name
              </label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={config.placeholders.name}
              />
            </div>
            <div>
              <label className="text-foreground mb-1 block text-sm font-medium">
                Trigger
              </label>
              <Input
                value={trigger}
                onChange={(event) => setTrigger(event.target.value)}
                placeholder={config.placeholders.trigger}
              />
            </div>
          </div>

          <div>
            <label className="text-foreground mb-1 block text-sm font-medium">
              Description
              <span className="text-muted ml-2 text-xs">
                {type === "character"
                  ? "Optional - images drive consistency"
                  : "Required"}
              </span>
            </label>
            <Textarea
              value={textDefinition}
              onChange={(event) => setTextDefinition(event.target.value)}
              placeholder={config.placeholders.textDefinition}
              className="min-h-[120px]"
            />
          </div>

          <div>
            <label className="text-foreground mb-1 block text-sm font-medium">
              Negative prompt (optional)
            </label>
            <Input
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
              placeholder={config.placeholders.negativePrompt}
            />
          </div>

          {error && (
            <p className="motion-shake-x text-danger text-sm">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>

          {showReferenceImages && asset && (
            <div
              className="motion-presence-panel space-y-4"
              data-motion-state="entered"
            >
              {asset.type === "character" && (
                <div className="border-border bg-surface-2 text-muted rounded-lg border px-3 py-2 text-xs">
                  Character consistency comes from strong reference photos. Add
                  a few clear face shots below.
                </div>
              )}
              <ReferenceImageUploader
                assetType={asset.type}
                onUpload={(file, metadata) =>
                  onAddImage(asset.id, file, metadata)
                }
                maxImages={config.maxReferenceImages}
                currentCount={asset.referenceImages?.length || 0}
              />
              <ReferenceImageGrid
                images={asset.referenceImages || []}
                onDelete={(imageId) => onDeleteImage(asset.id, imageId)}
                onSetPrimary={(imageId) => onSetPrimaryImage(asset.id, imageId)}
              />
            </div>
          )}

          {!showReferenceImages && (
            <p
              className="motion-presence-panel text-muted text-xs"
              data-motion-state="entered"
            >
              You can add reference images after saving this asset.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AssetEditor;
