import React, { useCallback } from "react";
import { ChevronRight } from "@promptstudio/system/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@promptstudio/system/components/ui/dialog";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import { Textarea } from "@promptstudio/system/components/ui/textarea";
import type { Asset } from "@shared/types/asset";
import { cn } from "@/utils/cn";
import { ImageUploadGrid } from "./ImageUploadGrid";
import { useQuickCharacterCreate } from "./hooks/useQuickCharacterCreate";

interface QuickCharacterCreateProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (asset: Asset) => void;
  prefillTrigger?: string | undefined;
}

export function QuickCharacterCreate({
  isOpen,
  onClose,
  onCreate,
  prefillTrigger,
}: QuickCharacterCreateProps): React.ReactElement {
  const {
    trigger,
    setTrigger,
    name,
    setName,
    images,
    textDefinition,
    setTextDefinition,
    negativePrompt,
    setNegativePrompt,
    isAdvancedOpen,
    setIsAdvancedOpen,
    isCreating,
    error,
    handleAddImages,
    handleRemoveImage,
    handleSetPrimary,
    createCharacter,
  } = useQuickCharacterCreate({ isOpen, prefillTrigger });

  const handleCreate = useCallback(async () => {
    const asset = await createCharacter();
    if (asset) {
      onCreate(asset);
    }
  }, [createCharacter, onCreate]);

  const isCreateDisabled =
    isCreating || !trigger.trim() || !name.trim() || images.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-surface-1 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border p-6 shadow-lg">
        <DialogHeader>
          <DialogTitle>Create Character</DialogTitle>
          <DialogDescription>
            Upload reference photos for face consistency.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-foreground mb-1 block text-sm font-medium">
              Trigger
            </label>
            <div className="flex items-center gap-2">
              <span className="text-muted text-sm">@</span>
              <Input
                value={trigger}
                onChange={(event) => setTrigger(event.target.value)}
                placeholder="marcus"
              />
            </div>
            <p className="text-muted mt-1 text-xs">
              How you will reference this character in prompts.
            </p>
          </div>

          <div>
            <label className="text-foreground mb-1 block text-sm font-medium">
              Name
            </label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Marcus Chen"
            />
          </div>

          <div>
            <label className="text-foreground mb-1 block text-sm font-medium">
              Reference Photos
            </label>
            <p className="text-muted mb-2 text-xs">
              Upload 3-5 clear photos showing the face from different angles.
            </p>
            <ImageUploadGrid
              images={images}
              onAdd={handleAddImages}
              onRemove={handleRemoveImage}
              onSetPrimary={handleSetPrimary}
              maxImages={10}
            />
          </div>

          <button
            type="button"
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className="text-muted flex items-center gap-1 text-sm"
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 transition",
                isAdvancedOpen && "rotate-90",
              )}
            />
            Advanced options
          </button>

          {isAdvancedOpen && (
            <div className="border-border space-y-4 border-l pl-4">
              <div>
                <label className="text-foreground mb-1 block text-sm font-medium">
                  Description (optional)
                </label>
                <Textarea
                  value={textDefinition}
                  onChange={(event) => setTextDefinition(event.target.value)}
                  placeholder="Asian man in his 40s, salt-and-pepper hair..."
                  rows={2}
                />
                <p className="text-muted mt-1 text-xs">
                  Added to prompts when @{trigger || "trigger"} is used.
                </p>
              </div>

              <div>
                <label className="text-foreground mb-1 block text-sm font-medium">
                  Negative prompt (optional)
                </label>
                <Textarea
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  placeholder="blurry, distorted face..."
                  rows={2}
                />
              </div>
            </div>
          )}

          {error && <div className="text-danger text-sm">{error}</div>}
        </div>

        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={isCreateDisabled}
          >
            {isCreating ? "Creating..." : `Create @${trigger || "character"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default QuickCharacterCreate;
