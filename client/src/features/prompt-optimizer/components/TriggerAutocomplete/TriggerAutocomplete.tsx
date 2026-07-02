import React, { useEffect, useRef } from "react";
import { Plus } from "@promptstudio/system/components/ui";
import type { Asset } from "@shared/types/asset";
import { TriggerSuggestion } from "./TriggerSuggestion";

interface TriggerAutocompleteProps {
  isOpen: boolean;
  suggestions: Asset[];
  selectedIndex: number;
  position: { top: number; left: number };
  query: string;
  onSelect: (asset: Asset) => void;
  onCreateNew: (trigger: string) => void;
  onClose: () => void;
  onHoverIndex: (index: number) => void;
}

export function TriggerAutocomplete({
  isOpen,
  suggestions,
  selectedIndex,
  position,
  query,
  onSelect,
  onCreateNew,
  onClose,
  onHoverIndex,
}: TriggerAutocompleteProps): React.ReactElement | null {
  const containerRef = useRef<HTMLDivElement>(null);

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
      className="fixed z-dropdown w-72 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface-1 shadow-lg"
      style={{ top: position.top, left: position.left }}
    >
      {suggestions.length > 0 ? (
        <div className="max-h-52 overflow-y-auto">
          {suggestions.map((asset, index) => (
            <div key={asset.id} onMouseEnter={() => onHoverIndex(index)}>
              <TriggerSuggestion
                asset={asset}
                isSelected={index === selectedIndex}
                onSelect={() => onSelect(asset)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 text-sm text-muted">No matching assets</div>
      )}

      {query.trim() && (
        <button
          type="button"
          onClick={() => onCreateNew(query.trim())}
          className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-foreground hover:bg-surface-2"
        >
          <Plus className="h-4 w-4" />
          Create "@{query.trim()}" as new asset
        </button>
      )}
    </div>
  );
}

export default TriggerAutocomplete;
