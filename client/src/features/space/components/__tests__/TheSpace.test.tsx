import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TheSpace } from "../TheSpace";
import type { SpaceNode } from "@/features/space/lineage/types";

const spine: SpaceNode[] = [
  { id: "w", kind: "words", ancestorId: null, label: "a cat on a couch" },
  { id: "p", kind: "picture", ancestorId: "w", status: "ready" },
  { id: "c", kind: "clip", ancestorId: "p", status: "ready" },
];

describe("TheSpace", () => {
  it("renders a node per visible take, in three generations", () => {
    render(<TheSpace nodes={spine} liveNodeId="p" />);
    expect(screen.getAllByTestId(/^space-node-/)).toHaveLength(3);
  });

  it("marks the live node so the player centers on it", () => {
    render(<TheSpace nodes={spine} liveNodeId="p" />);
    expect(screen.getByTestId("space-node-p")).toHaveAttribute(
      "data-live",
      "true",
    );
  });

  it("restores a take on selecting its node (the take-restore contract)", () => {
    const onSelectNode = vi.fn();
    render(
      <TheSpace nodes={spine} liveNodeId="p" onSelectNode={onSelectNode} />,
    );
    fireEvent.click(screen.getByTestId("space-node-w"));
    expect(onSelectNode).toHaveBeenCalledWith("w");
  });

  it("demotes words nodes to a quiet origin chip by default (ADR-0015)", () => {
    render(<TheSpace nodes={spine} liveNodeId="p" />);
    // The chip: a small "Prompt" marker with an Edit-words hover hint —
    // the full prompt text does not render in the space.
    expect(screen.queryByText("a cat on a couch")).not.toBeInTheDocument();
    expect(screen.getByText("Prompt")).toBeInTheDocument();
    expect(screen.getByText("Edit words")).toBeInTheDocument();
    // Still the same selectable node (the chip is the door back to editing).
    expect(screen.getByTestId("space-node-w")).toBeInTheDocument();
  });

  it("renders the focused words node as its full card (box open)", () => {
    render(<TheSpace nodes={spine} liveNodeId="p" focusedNodeId="w" />);
    expect(screen.getByText("a cat on a couch")).toBeInTheDocument();
    expect(screen.queryByText("Edit words")).not.toBeInTheDocument();
  });

  it("excludes archived nodes (nothing vanishes, but the render skips them)", () => {
    render(
      <TheSpace
        nodes={[
          ...spine,
          { id: "p2", kind: "picture", ancestorId: "w", archived: true },
        ]}
        liveNodeId="p"
      />,
    );
    expect(screen.queryByTestId("space-node-p2")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^space-node-/)).toHaveLength(3);
  });
});
