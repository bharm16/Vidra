import React from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@promptstudio/system/components/ui/dropdown-menu";
import type { SpaceNode } from "../lineage/types";

export interface SpaceNodeMenuProps {
  node: SpaceNode;
  /** True when this node is a childless leaf (server's removal rule). */
  removable: boolean;
  onReword: (node: SpaceNode) => void;
  onRemove: (node: SpaceNode) => void;
}

/**
 * A space node's context menu (RULINGS §5). Two actions are wired today:
 * Reword restores the node's paired words for re-editing, and Remove
 * soft-archives a childless leaf (server-enforced). The remaining RULINGS
 * actions (Animate / Re-roll / Share / Download / New clip) route through
 * existing generation and session flows and are wired separately.
 */
export function SpaceNodeMenu({
  node,
  removable,
  onReword,
  onRemove,
}: SpaceNodeMenuProps): React.ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Take actions"
          data-testid={`space-node-menu-${node.id}`}
          className="border-tool-rail-border bg-tool-surface-card/80 rounded-md border backdrop-blur"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onReword(node)}>
          Reword
        </DropdownMenuItem>
        {removable ? (
          <DropdownMenuItem
            onSelect={() => onRemove(node)}
            data-testid={`space-node-remove-${node.id}`}
          >
            Remove
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
