import type { ReactElement } from "react";
import { Plus } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@promptstudio/system/components/ui/tooltip";
import type { AppIcon } from "@/types";

interface PanelHeaderProps {
  icon: AppIcon;
  title: string;
  onNew: () => void;
  /** Optional tooltip for the New action (e.g. a keyboard shortcut). */
  newTooltip?: string;
}

/**
 * The one header pattern shared by the rail tool panels (Sessions,
 * Characters, Styles): panel icon + sentence-case title on the left, a
 * single ghost "New" action on the right. Panels open and close from the
 * rail (re-clicking the glyph toggles), so headers carry no back arrow.
 */
export function PanelHeader({
  icon: Icon,
  title,
  onNew,
  newTooltip,
}: PanelHeaderProps): ReactElement {
  const newButton = (
    <Button
      onClick={onNew}
      variant="ghost"
      size="sm"
      className="bg-surface-2 text-ghost h-7 gap-1 rounded-md px-2.5 text-xs font-medium"
    >
      <Plus className="h-3 w-3" />
      New
    </Button>
  );

  return (
    <div className="flex h-12 items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <Icon className="text-ghost h-4 w-4" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {newTooltip ? (
        <TooltipProvider delayDuration={120}>
          <Tooltip>
            <TooltipTrigger asChild>{newButton}</TooltipTrigger>
            <TooltipContent>{newTooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        newButton
      )}
    </div>
  );
}
