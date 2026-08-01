import React from "react";
import { ChevronDown, Image, Video } from "@promptstudio/system/components/ui";
import { cn } from "@utils/cn";
import type { GenerationControlsTab } from "../types";

interface PanelHeaderProps {
  activeTab: GenerationControlsTab;
  onBack?: (() => void) | undefined;
  onSelectTab: (tab: GenerationControlsTab) => void;
}

/**
 * Panel header matching v5 mockup:
 * [ (●Video) (Image) ] ——————— Untitled session ▾
 *
 * 48px tall, pill-shaped tab switcher in dark container.
 */
export function PanelHeader({
  activeTab,
  onBack,
  onSelectTab,
}: PanelHeaderProps): React.ReactElement {
  return (
    <header className="h-12 px-3.5 border-b border-tool-rail-border flex items-center gap-3">
      {/* Tab switcher container */}
      <div className="flex items-center gap-0.5 bg-tool-surface-deep rounded-2xl p-0.5">
        <button
          type="button"
          onClick={() => onSelectTab("video")}
          className={cn(
            "h-[30px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors",
            activeTab === "video"
              ? "bg-foreground text-tool-surface-deep shadow-[0_1px_0_rgba(255,255,255,0.15)]"
              : "text-tool-text-subdued hover:text-tool-text-dim",
          )}
        >
          <Video
            className={cn("w-3.5 h-3.5", activeTab !== "video" && "opacity-60")}
          />
          Video
        </button>
        <button
          type="button"
          onClick={() => onSelectTab("image")}
          className={cn(
            "h-[30px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors",
            activeTab === "image"
              ? "bg-foreground text-tool-surface-deep shadow-[0_1px_0_rgba(255,255,255,0.15)]"
              : "text-tool-text-subdued hover:text-tool-text-dim",
          )}
        >
          <Image
            className={cn("w-3.5 h-3.5", activeTab !== "image" && "opacity-60")}
          />
          Image
        </button>
      </div>

      <div className="flex-1" />

      {/* Session selector */}
      <button
        type="button"
        className="text-meta font-medium text-tool-text-subdued hover:text-tool-text-dim transition-colors inline-flex items-center gap-1"
        aria-label={onBack ? "Open sessions" : "Session selector"}
        onClick={onBack}
      >
        Untitled session
        <ChevronDown className="w-2.5 h-2.5" />
      </button>
    </header>
  );
}
