import React from "react";
import { X } from "@promptstudio/system/components/ui";
import {
  Dialog,
  DialogContent,
} from "@promptstudio/system/components/ui/dialog";
import type { PromptCanvasViewProps } from "./PromptCanvasView.types";
import { CanvasButton, iconSizes } from "./PromptCanvasView.shared";

type PromptCanvasDiffDialogProps = Pick<
  PromptCanvasViewProps,
  "showDiff" | "onShowDiffChange" | "inputPrompt" | "normalizedDisplayedPrompt"
>;

export function PromptCanvasDiffDialog({
  showDiff,
  onShowDiffChange,
  inputPrompt,
  normalizedDisplayedPrompt,
}: PromptCanvasDiffDialogProps): React.ReactElement | null {
  if (!showDiff) {
    return null;
  }

  return (
    <Dialog open={showDiff} onOpenChange={onShowDiffChange}>
      <DialogContent className="border-border bg-raise w-full max-w-5xl gap-0 rounded-xl border p-0 shadow-lg [&>button]:hidden">
        <div className="border-border flex items-center justify-between border-b p-4">
          <div>
            <div className="text-body-lg text-foreground font-semibold">
              Diff
            </div>
            <div className="text-meta text-muted mt-1">
              Input vs optimized output
            </div>
          </div>
          <CanvasButton
            type="button"
            className="border-border text-muted hover:bg-surface-2 hover:text-foreground inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors"
            onClick={() => onShowDiffChange(false)}
            aria-label="Close diff"
          >
            <X weight="bold" size={iconSizes.md} />
          </CanvasButton>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div className="border-border bg-surface-2 p-ps-3 rounded-lg border">
            <div className="text-label-sm text-muted font-semibold uppercase tracking-widest">
              Input
            </div>
            <pre className="text-body-sm text-muted mt-3 whitespace-pre-wrap font-mono">
              {inputPrompt || "—"}
            </pre>
          </div>
          <div className="border-border bg-surface-2 p-ps-3 rounded-lg border">
            <div className="text-label-sm text-muted font-semibold uppercase tracking-widest">
              Optimized
            </div>
            <pre className="text-body-sm text-muted mt-3 whitespace-pre-wrap font-mono">
              {normalizedDisplayedPrompt || "—"}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
