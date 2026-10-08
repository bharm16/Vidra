import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@/utils/cn";
import { UnattachedTakeBadge } from "./UnattachedTakeBadge";
import { CANVAS_FOCUS_ATTR } from "@/components/canvas/CanvasViewport";
import { rewriteGcsUrlToProxy } from "@/services/media/MediaUrlResolver";
import type { SpaceNode } from "../lineage/types";
import "./space.css";

const ASSET_WIDTH = 352;
const ASSET_GAP = 32;
const ROW_HEIGHT = 328;

export interface TheSpaceProps {
  nodes: SpaceNode[];
  /** Actual dispatch groups, oldest first. New generations add rows below. */
  rows?: ReadonlyArray<ReadonlyArray<string>>;
  liveNodeId?: string | null;
  onSelectNode?: (id: string) => void;
  renderNodeMenu?: (node: SpaceNode) => React.ReactNode;
  selectedNodeId?: string | null;
  renderSelectedResult?: (node: SpaceNode) => React.ReactNode;
}

/** Pannable asset space. Conversation and ancestry data are owned elsewhere. */
export function TheSpace({
  nodes,
  rows,
  liveNodeId,
  onSelectNode,
  renderNodeMenu,
  selectedNodeId,
  renderSelectedResult,
}: TheSpaceProps): React.ReactElement {
  const assets = nodes.filter(
    (node) => node.kind !== "words" && !node.archived,
  );
  const byId = new Map(assets.map((node) => [node.id, node]));
  const shown = new Set<string>();
  const groups: SpaceNode[][] = [];
  for (const ids of rows ?? assets.map((node) => [node.id])) {
    const group = ids.flatMap((id) => {
      const node = byId.get(id);
      if (!node || shown.has(id)) return [];
      shown.add(id);
      return [node];
    });
    if (group.length) groups.push(group);
  }
  for (const node of assets) if (!shown.has(node.id)) groups.push([node]);
  const width =
    Math.max(1, ...groups.map((group) => group.length)) *
      (ASSET_WIDTH + ASSET_GAP) -
    ASSET_GAP;
  return (
    <div
      className="relative mx-auto my-8"
      style={{ width, height: Math.max(1, groups.length) * ROW_HEIGHT }}
      data-testid="the-space"
    >
      {groups.map((group, row) => (
        <div
          key={group[0]?.id}
          role="group"
          aria-label={"Generation " + (row + 1) + " results"}
        >
          {group.map((node, column) => {
            const live = node.id === liveNodeId;
            const placement = {
              left: column * (ASSET_WIDTH + ASSET_GAP),
              top: row * ROW_HEIGHT,
              width: ASSET_WIDTH,
            };
            if (node.id === selectedNodeId) {
              const selected = renderSelectedResult?.(node);
              if (selected)
                return (
                  <div
                    key={node.id}
                    className="absolute"
                    style={placement}
                    {...{ [CANVAS_FOCUS_ATTR]: node.id }}
                  >
                    {selected}
                  </div>
                );
            }
            return (
              <div key={node.id} className="absolute" style={placement}>
                <Button
                  variant="ghost"
                  type="button"
                  data-testid={"space-node-" + node.id}
                  data-live={live ? "true" : "false"}
                  {...{ [CANVAS_FOCUS_ATTR]: node.id }}
                  onClick={() => onSelectNode?.(node.id)}
                  className="group flex !h-auto w-full flex-col items-stretch !p-0 text-left hover:bg-transparent"
                  aria-label={
                    node.kind === "clip" ? "View clip" : "View picture"
                  }
                >
                  <div
                    className={cn(
                      "rounded-card bg-canvas relative aspect-[8/5] overflow-hidden border-[0.5px]",
                      "border-foreground",
                      node.status === "forming" && "ps-node-forming",
                    )}
                  >
                    {node.status === "forming" ? (
                      <div
                        role="status"
                        className="text-ui text-muted flex h-full items-center justify-center"
                      >
                        Generating…
                      </div>
                    ) : node.status === "failed" ? (
                      <div
                        role="status"
                        className="text-ui text-muted flex h-full items-center justify-center"
                      >
                        Generation failed
                      </div>
                    ) : node.mediaUrl ? (
                      <img
                        src={
                          rewriteGcsUrlToProxy(node.mediaUrl) ?? node.mediaUrl
                        }
                        alt=""
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    ) : null}
                    {node.unattached ? (
                      <UnattachedTakeBadge takeId={node.id} />
                    ) : null}
                  </div>
                  <span className="text-ui text-muted mt-2 text-left">
                    {node.kind === "clip" ? "Clip" : "Image"}
                  </span>
                </Button>
                <div className="absolute right-1.5 top-1.5 z-20">
                  {renderNodeMenu?.(node)}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
