import React, { useEffect, useRef } from "react";
import {
  User,
  Palette,
  MapPin,
  Box,
  Loader2,
  type IconType,
} from "@promptstudio/system/components/ui";
import { rewriteGcsUrlToProxy } from "@/services/media/MediaUrlResolver";
import { getAssetTypeConfig } from "../config/assetConfig";
import type { AssetSuggestion } from "../hooks/useTriggerAutocomplete";
import type { AnimatedPresencePhase } from "@/hooks/useAnimatedPresence";

const TYPE_ICONS: Record<string, IconType> = {
  character: User,
  style: Palette,
  location: MapPin,
  object: Box,
};

interface TriggerAutocompleteProps {
  isOpen: boolean;
  suggestions: AssetSuggestion[];
  selectedIndex: number;
  position: { top: number; left: number };
  isLoading: boolean;
  onSelect: (asset: AssetSuggestion) => void;
  onClose: () => void;
  setSelectedIndex: (index: number) => void;
  motionPhase?: AnimatedPresencePhase;
}

export function TriggerAutocomplete({
  isOpen,
  suggestions,
  selectedIndex,
  position,
  isLoading,
  onSelect,
  onClose,
  setSelectedIndex,
  motionPhase = "entered",
}: TriggerAutocompleteProps): React.ReactElement | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current && suggestions.length > 0) {
      const selectedItem = listRef.current.children[selectedIndex] as
        | HTMLElement
        | undefined;
      if (selectedItem && typeof selectedItem.scrollIntoView === "function") {
        selectedItem.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, suggestions.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
    return undefined;
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="motion-presence-panel fixed z-dropdown overflow-hidden rounded-lg border border-border bg-surface-1 shadow-lg"
      data-motion-state={motionPhase}
      style={{
        top: position.top,
        left: position.left,
        minWidth: 280,
        maxWidth: 420,
        maxHeight: 320,
      }}
    >
      {isLoading && suggestions.length === 0 && (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      )}

      {!isLoading && suggestions.length === 0 && (
        <div className="p-3 text-center">
          <p className="text-sm text-muted">No assets found</p>
          <p className="mt-1 text-xs text-muted">
            Create one in the Asset Library
          </p>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="max-h-72 overflow-y-auto" ref={listRef}>
          {suggestions.map((asset, index) => {
            const config = getAssetTypeConfig(asset.type);
            const Icon = TYPE_ICONS[asset.type] || Box;

            return (
              <button
                key={asset.id}
                onClick={() => onSelect(asset)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  index === selectedIndex
                    ? "bg-surface-2"
                    : "hover:bg-surface-2/70"
                }`}
                type="button"
              >
                {asset.thumbnailUrl ? (
                  <img
                    src={
                      rewriteGcsUrlToProxy(asset.thumbnailUrl ?? null) ??
                      undefined
                    }
                    alt=""
                    className="h-10 w-10 flex-shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md ${config.bgClass}`}
                  >
                    <Icon className={`h-5 w-5 ${config.colorClass}`} />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {asset.name}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${config.bgClass} ${config.colorClass}`}
                    >
                      {config.label}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {asset.trigger}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="border-t border-border bg-surface-2/70 px-3 py-2">
        <p className="text-xs text-muted">
          <kbd className="rounded bg-surface-3 px-1 py-0.5 text-xs text-muted">
            up/down
          </kbd>{" "}
          navigate{" "}
          <kbd className="rounded bg-surface-3 px-1 py-0.5 text-xs text-muted">
            enter
          </kbd>{" "}
          select{" "}
          <kbd className="rounded bg-surface-3 px-1 py-0.5 text-xs text-muted">
            esc
          </kbd>{" "}
          close
        </p>
      </div>
    </div>
  );
}
