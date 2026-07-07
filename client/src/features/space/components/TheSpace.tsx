import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@/utils/cn";
import { computeLineageLayout } from "../lineage/computeLineageLayout";
import { deriveEdgeKind } from "../lineage/deriveEdgeKind";
import type { EdgeKind, SpaceNode } from "../lineage/types";

const COL_W = 264;
const ROW_H = 176;
const NODE_W = 208;
const NODE_H = 128;

/** Edge stroke by derived kind — the drawn relationship reads the verb. */
const EDGE_STROKE: Record<EdgeKind, string> = {
  spine: "rgba(255,255,255,0.20)",
  roll: "#d3a44e", // a re-roll sibling (motion gold)
  reword: "#8b8baa", // a reworded words-version
  move: "#6b8a6b", // picture → clip
};

export interface TheSpaceProps {
  nodes: SpaceNode[];
  /** The current take — rendered enlarged, camera centered (ADR-0012). */
  liveNodeId?: string | null;
  /** Selecting a node restores its paired words (the take-restore contract). */
  onSelectNode?: (id: string) => void;
}

function nodeLeft(column: number): number {
  return column * COL_W;
}
function nodeTop(row: number): number {
  return row * ROW_H;
}

/**
 * The space (ADR-0012 / ADR-0013): the page's content as an auto-laid-out
 * lineage network. Three fixed generations as columns, siblings as rows, edges
 * typed by the verb that made them. Nothing is dragged or placed — layout is
 * derived every render; the creator only ever operates the guided loop.
 */
export function TheSpace({
  nodes,
  liveNodeId,
  onSelectNode,
}: TheSpaceProps): React.ReactElement {
  const positioned = computeLineageLayout(nodes);
  const byId = new Map(positioned.map((node) => [node.id, node]));

  const columns = positioned.reduce((max, n) => Math.max(max, n.column + 1), 1);
  const rows = positioned.reduce((max, n) => Math.max(max, n.row + 1), 1);
  const width = columns * COL_W;
  const height = rows * ROW_H;

  const centerX = (column: number): number => nodeLeft(column) + NODE_W / 2;
  const centerY = (row: number): number => nodeTop(row) + NODE_H / 2;

  return (
    <div
      className="relative mx-auto my-8"
      style={{ width, height }}
      data-testid="the-space"
    >
      <svg
        className="pointer-events-none absolute inset-0"
        width={width}
        height={height}
        aria-hidden="true"
      >
        {positioned.map((node) => {
          if (!node.ancestorId) return null;
          const ancestor = byId.get(node.ancestorId);
          if (!ancestor) return null;
          return (
            <line
              key={`edge-${node.id}`}
              x1={centerX(ancestor.column)}
              y1={centerY(ancestor.row)}
              x2={centerX(node.column)}
              y2={centerY(node.row)}
              stroke={EDGE_STROKE[deriveEdgeKind(node, positioned)]}
              strokeWidth={2}
            />
          );
        })}
      </svg>

      {positioned.map((node) => {
        const isLive = node.id === liveNodeId;
        return (
          <Button
            key={node.id}
            type="button"
            variant="ghost"
            data-testid={`space-node-${node.id}`}
            data-live={isLive ? "true" : "false"}
            onClick={() => onSelectNode?.(node.id)}
            className={cn(
              "absolute flex flex-col items-start gap-1 overflow-hidden rounded-xl border p-3 text-left",
              "border-tool-rail-border bg-tool-surface-card hover:border-tool-text-label",
              isLive &&
                "border-tool-text-label ring-tool-text-label/30 z-10 ring-2",
            )}
            style={{
              left: nodeLeft(node.column),
              top: nodeTop(node.row),
              width: NODE_W,
              height: NODE_H,
              transform: isLive ? "scale(1.06)" : undefined,
            }}
          >
            <SpaceNodeBody node={node} />
          </Button>
        );
      })}
    </div>
  );
}

function SpaceNodeBody({ node }: { node: SpaceNode }): React.ReactElement {
  if (node.kind === "words") {
    return (
      <>
        <span className="text-tool-text-subdued rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px]">
          prompt
        </span>
        <span className="text-foreground line-clamp-3 text-[12px] leading-snug">
          {node.label ?? "—"}
        </span>
      </>
    );
  }
  if (node.status === "forming") {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white/60" />
      </div>
    );
  }
  return (
    <div className="relative h-full w-full">
      {node.mediaUrl ? (
        <img
          src={node.mediaUrl}
          alt=""
          className="absolute inset-0 h-full w-full rounded-md object-cover"
        />
      ) : (
        <div className="bg-tool-surface-deep absolute inset-0 rounded-md" />
      )}
      {node.status === "kept" ? (
        <span className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
          kept
        </span>
      ) : null}
    </div>
  );
}
