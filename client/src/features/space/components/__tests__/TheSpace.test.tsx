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
