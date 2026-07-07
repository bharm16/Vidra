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
  /** Animate a picture into a clip (arms the video loop from this frame). */
  onAnimate?: (node: SpaceNode) => void;
  /** Download a clip's media. */
  onDownload?: (node: SpaceNode) => void;
}

/**
 * A space node's context menu (RULINGS §5), adapting to node kind: a picture
 * offers Animate, a clip offers Download, all takes offer Reword, and a
 * childless leaf offers Remove (server-enforced). The remaining RULINGS actions
 * (Re-roll / Share / New clip) route through generation and session flows that
 * don't fit the per-node handler and are wired separately.
 */
export function SpaceNodeMenu({
  node,
  removable,
  onReword,
  onRemove,
  onAnimate,
  onDownload,
}: SpaceNodeMenuProps): React.ReactElement {
  const showAnimate = node.kind === "picture" && Boolean(onAnimate);
  const showDownload = node.kind === "clip" && Boolean(onDownload);
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
        {showAnimate ? (
          <DropdownMenuItem
            onSelect={() => onAnimate?.(node)}
            data-testid={`space-node-animate-${node.id}`}
          >
            Animate
          </DropdownMenuItem>
        ) : null}
        {showDownload ? (
          <DropdownMenuItem
            onSelect={() => onDownload?.(node)}
            data-testid={`space-node-download-${node.id}`}
          >
            Download
          </DropdownMenuItem>
        ) : null}
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
