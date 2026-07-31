/**
 * A media take must be watchable from the space. The node menu offers the
 * viewer entry as its first action — "Play" on a clip, "View" on a picture —
 * and never on a words node (there is nothing to view). Browsing-only:
 * onView receives the node and the caller opens the read-only viewer.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SpaceNodeMenu } from "../SpaceNodeMenu";
import type { SpaceNode } from "../../lineage/types";

const clip: SpaceNode = { id: "g1", kind: "clip", ancestorId: null };
const picture: SpaceNode = { id: "p1", kind: "picture", ancestorId: null };
const words: SpaceNode = { id: "w1", kind: "words", ancestorId: null };
const noop = (): void => {};

describe("SpaceNodeMenu view entry", () => {
  it("offers Play on a clip and invokes onView with the node", async () => {
    const onView = vi.fn();
    render(
      <SpaceNodeMenu
        node={clip}
        removable={false}
        onReword={noop}
        onRemove={noop}
        onView={onView}
      />,
    );

    await userEvent.click(screen.getByTestId("space-node-menu-g1"));
    const item = await screen.findByTestId("space-node-view-g1");
    expect(item.textContent).toBe("Play");

    await userEvent.click(item);
    expect(onView).toHaveBeenCalledWith(clip);
  });

  it("offers View on a picture", async () => {
    render(
      <SpaceNodeMenu
        node={picture}
        removable={false}
        onReword={noop}
        onRemove={noop}
        onView={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByTestId("space-node-menu-p1"));
    const item = await screen.findByTestId("space-node-view-p1");
    expect(item.textContent).toBe("View");
  });

  it("offers nothing to view on a words node", async () => {
    render(
      <SpaceNodeMenu
        node={words}
        removable={false}
        onReword={noop}
        onRemove={noop}
        onView={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByTestId("space-node-menu-w1"));

    expect(screen.queryByTestId("space-node-view-w1")).toBeNull();
  });
});
