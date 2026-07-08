import React from "react";
import { Button } from "@promptstudio/system/components/ui/button";

import { cn } from "@/utils/cn";
import { computeLineageLayout } from "../lineage/computeLineageLayout";
import { deriveEdgeKind } from "../lineage/deriveEdgeKind";
import { edgePath } from "../lineage/edgePath";
import type { EdgeKind, LineageNodeKind, SpaceNode } from "../lineage/types";
import "./space.css";

const COL_W = 300;
const ROW_H = 210;
const SIZE: Record<LineageNodeKind, { w: number; h: number }> = {
  words: { w: 216, h: 120 },
  picture: { w: 248, h: 155 },
  clip: { w: 248, h: 155 },
};

/** Edge stroke by derived kind — the drawn relationship reads the verb. */
const EDGE_STROKE: Record<EdgeKind, string> = {
  spine: "rgba(255,255,255,0.22)",
  roll: "#d3a44e", // a re-roll sibling (motion gold)
  reword: "#8b8baa", // a reworded words-version
  move: "#6b8a6b", // picture → clip
};

/** The mono caption under each take. */
const CAPTION: Record<LineageNodeKind, string> = {
  words: "prompt",
  picture: "image",
  clip: "clip",
};

export interface TheSpaceProps {
  nodes: SpaceNode[];
  /** The current take — rendered enlarged, camera centered (ADR-0012). */
  liveNodeId?: string | null;
  /** Selecting a node restores its paired words (the take-restore contract). */
  onSelectNode?: (id: string) => void;
  /**
   * Per-node context menu (RULINGS §5), rendered at the node's corner as a
   * sibling of the select button — never nested — so its actions don't collide
   * with selection. Return null to give a node no menu.
   */
  renderNodeMenu?: (node: SpaceNode) => React.ReactNode;
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
  renderNodeMenu,
}: TheSpaceProps): React.ReactElement {
  const positioned = computeLineageLayout(nodes);
  const byId = new Map(positioned.map((node) => [node.id, node]));

  const columns = positioned.reduce((max, n) => Math.max(max, n.column + 1), 1);
  const rows = positioned.reduce((max, n) => Math.max(max, n.row + 1), 1);
  const width = columns * COL_W;
  const height = rows * ROW_H;

  const nodeLeft = (n: { column: number; kind: LineageNodeKind }): number =>
    n.column * COL_W + (COL_W - SIZE[n.kind].w) / 2;
  const nodeTop = (n: { row: number; kind: LineageNodeKind }): number =>
    n.row * ROW_H + (ROW_H - SIZE[n.kind].h) / 2;

  const liveLeftAnchor = (n: {
    column: number;
    row: number;
    kind: LineageNodeKind;
  }): { x: number; y: number } => ({
    x: nodeLeft(n),
    y: nodeTop(n) + SIZE[n.kind].h / 2,
  });
  const rightAnchor = (n: {
    column: number;
    row: number;
    kind: LineageNodeKind;
  }): { x: number; y: number } => ({
    x: nodeLeft(n) + SIZE[n.kind].w,
    y: nodeTop(n) + SIZE[n.kind].h / 2,
  });

  const liveNode = positioned.find((n) => n.id === liveNodeId) ?? null;

  return (
    <div
      className="relative mx-auto my-10"
      style={{ width, height }}
      data-testid="the-space"
    >
      {/* Ambient spotlight behind the live take. */}
      {liveNode ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full blur-[12px]"
          style={{
            left: nodeLeft(liveNode) + SIZE[liveNode.kind].w / 2 - 270,
            top: nodeTop(liveNode) + SIZE[liveNode.kind].h / 2 - 215,
            width: 540,
            height: 430,
            opacity: 0.7,
            background:
              "radial-gradient(ellipse at 50% 50%, color-mix(in srgb, var(--accent) 32%, transparent), color-mix(in srgb, var(--accent) 7%, transparent) 46%, transparent 72%)",
          }}
        />
      ) : null}

      <svg
        className="pointer-events-none absolute inset-0"
        width={width}
        height={height}
        fill="none"
        aria-hidden="true"
      >
        {positioned.map((node) => {
          if (!node.ancestorId) return null;
          const ancestor = byId.get(node.ancestorId);
          if (!ancestor) return null;
          const kind = deriveEdgeKind(node, positioned);
          const isLiveEdge = node.id === liveNodeId;
          return (
            <path
              key={`edge-${node.id}`}
              d={edgePath(rightAnchor(ancestor), liveLeftAnchor(node))}
              stroke={isLiveEdge ? "var(--accent)" : EDGE_STROKE[kind]}
              strokeWidth={isLiveEdge ? 2.2 : 1.8}
              strokeDasharray={kind === "reword" ? "6 4" : undefined}
            />
          );
        })}
      </svg>

      {positioned.map((node) => {
        const isLive = node.id === liveNodeId;
        const menu = renderNodeMenu?.(node);
        const { w, h } = SIZE[node.kind];
        return (
          <React.Fragment key={node.id}>
            <Button
              variant="ghost"
              type="button"
              data-testid={`space-node-${node.id}`}
              data-live={isLive ? "true" : "false"}
              onClick={() => onSelectNode?.(node.id)}
              className="absolute flex h-auto flex-col items-stretch p-0 text-left hover:bg-transparent"
              style={{ left: nodeLeft(node), top: nodeTop(node), width: w }}
            >
              <div
                className={cn(
                  "relative overflow-hidden rounded-[14px] border transition-transform",
                  node.status === "forming"
                    ? "ps-node-forming border-[color:var(--accent)]"
                    : isLive
                      ? "ps-node-live border-[color:var(--accent)]"
                      : "border-tool-rail-border bg-tool-surface-card hover:border-tool-text-label",
                  isLive && node.status !== "forming" && "scale-[1.02]",
                )}
                style={{ height: h }}
              >
                <SpaceNodeBody node={node} />
                {isLive ? (
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-[color:var(--accent)] px-2 py-1 text-[10px] font-medium text-white">
                    <span className="ps-live-badge-dot h-1.5 w-1.5 rounded-full bg-white" />
                    LIVE
                  </span>
                ) : null}
              </div>
              <span
                className={cn(
                  "ps-node-caption mt-2 text-center",
                  isLive
                    ? "text-[color:color-mix(in_srgb,var(--accent)_55%,#fff)]"
                    : "text-tool-text-label",
                )}
              >
                {CAPTION[node.kind]}
              </span>
            </Button>
            {menu ? (
              <div
                className="absolute z-20"
                style={{
                  left: nodeLeft(node) + w - 30,
                  top: nodeTop(node) + 6,
                }}
              >
                {menu}
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SpaceNodeBody({ node }: { node: SpaceNode }): React.ReactElement {
  if (node.status === "forming") {
    return (
      <div className="flex h-full w-full items-center justify-center gap-1.5">
        <span className="ps-node-dot h-[7px] w-[7px] rounded-full bg-[color:color-mix(in_srgb,var(--accent)_75%,#fff)]" />
        <span className="ps-node-dot h-[7px] w-[7px] rounded-full bg-[color:color-mix(in_srgb,var(--accent)_75%,#fff)] [animation-delay:0.16s]" />
        <span className="ps-node-dot h-[7px] w-[7px] rounded-full bg-[color:color-mix(in_srgb,var(--accent)_75%,#fff)] [animation-delay:0.32s]" />
      </div>
    );
  }
  if (node.kind === "words") {
    return (
      <div className="flex h-full w-full items-center px-4 py-3">
        <span className="text-foreground line-clamp-4 text-[13px] leading-snug">
          {node.label ?? "—"}
        </span>
      </div>
    );
  }
  return (
    <>
      {node.mediaUrl ? (
        <img
          src={node.mediaUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="bg-tool-surface-deep absolute inset-0" />
      )}
      {node.status === "kept" ? (
        <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
          kept
        </span>
      ) : null}
    </>
  );
}
