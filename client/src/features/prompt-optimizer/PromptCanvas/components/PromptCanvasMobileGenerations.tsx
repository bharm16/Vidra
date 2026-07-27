import React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@promptstudio/system/components/ui/sheet";
import { GenerationsPanel } from "@features/generations";
import type { PromptCanvasViewProps } from "./PromptCanvasView.types";
import { CanvasButton } from "./PromptCanvasView.shared";

type PromptCanvasMobileGenerationsProps = Pick<
  PromptCanvasViewProps,
  | "generationsSheetOpen"
  | "onGenerationsSheetOpenChange"
  | "generationsPanelProps"
>;

export function PromptCanvasMobileGenerations({
  generationsSheetOpen,
  onGenerationsSheetOpenChange,
  generationsPanelProps,
}: PromptCanvasMobileGenerationsProps): React.ReactElement {
  return (
    <>
      <div className="border-border bg-surface-2 p-ps-3 z-fixed fixed bottom-0 left-0 right-0 border-t lg:hidden">
        <div className="flex items-center gap-3">
          <CanvasButton
            type="button"
            variant="gradient"
            className="flex-1 justify-center"
            onClick={() => onGenerationsSheetOpenChange(true)}
          >
            Open Generations
          </CanvasButton>
        </div>
      </div>

      <Sheet
        open={generationsSheetOpen}
        onOpenChange={onGenerationsSheetOpenChange}
      >
        <SheetContent
          side="bottom"
          className="p-ps-3 h-[85vh] overflow-auto border-0 bg-transparent shadow-none [&>button]:hidden"
        >
          <SheetTitle className="sr-only">Generations panel</SheetTitle>
          <SheetDescription className="sr-only">
            Generated prompt previews and outputs.
          </SheetDescription>
          <GenerationsPanel {...generationsPanelProps} className="h-full" />
        </SheetContent>
      </Sheet>
    </>
  );
}
