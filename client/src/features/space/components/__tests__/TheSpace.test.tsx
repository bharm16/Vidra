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
  it("renders media assets only without prompt nodes", () => {
    render(<TheSpace nodes={spine} liveNodeId="p" />);
    expect(screen.getAllByTestId(/^space-node-/)).toHaveLength(2);
  });

  it("marks the live node so the player centers on it", () => {
    render(<TheSpace nodes={spine} liveNodeId="p" />);
    expect(screen.getByTestId("space-node-p")).toHaveAttribute(
      "data-live",
      "true",
    );
  });

  it("inspects an asset through the selection callback", () => {
    const onSelectNode = vi.fn();
    render(<TheSpace nodes={spine} onSelectNode={onSelectNode} />);
    fireEvent.click(screen.getByTestId("space-node-p"));
    expect(onSelectNode).toHaveBeenCalledWith("p");
    expect(screen.queryByTestId("space-node-w")).toBeNull();
    expect(screen.queryByText("a cat on a couch")).toBeNull();
  });

  it("groups each dispatch's results in a row and appends new rows below", () => {
    render(
      <TheSpace
        nodes={[
          ...spine,
          { id: "p2", kind: "picture", ancestorId: "w", status: "ready" },
        ]}
        rows={[["p", "p2"], ["c"]]}
      />,
    );
    const rows = screen.getAllByRole("group", {
      name: /Generation .* results/,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContainElement(screen.getByTestId("space-node-p"));
    expect(rows[0]).toContainElement(screen.getByTestId("space-node-p2"));
    expect(rows[1]).toContainElement(screen.getByTestId("space-node-c"));
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
    expect(screen.getAllByTestId(/^space-node-/)).toHaveLength(2);
  });
});
