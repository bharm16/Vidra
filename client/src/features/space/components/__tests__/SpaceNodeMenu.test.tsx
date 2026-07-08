import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SpaceNodeMenu } from "../SpaceNodeMenu";
import type { SpaceNode } from "../../lineage/types";

const clip: SpaceNode = { id: "g1", kind: "clip", ancestorId: null };
const picture: SpaceNode = { id: "p1", kind: "picture", ancestorId: null };
const noop = (): void => {};

describe("SpaceNodeMenu Share (ADR-0010 D8)", () => {
  it("offers Share on a clip and invokes onShare with the node", async () => {
    const onShare = vi.fn();
    render(
      <SpaceNodeMenu
        node={clip}
        removable={false}
        onReword={noop}
        onRemove={noop}
        onDownload={noop}
        onShare={onShare}
      />,
    );

    await userEvent.click(screen.getByTestId("space-node-menu-g1"));
    await userEvent.click(await screen.findByTestId("space-node-share-g1"));

    expect(onShare).toHaveBeenCalledWith(clip);
  });

  it("does not offer Share on a picture node", async () => {
    render(
      <SpaceNodeMenu
        node={picture}
        removable={false}
        onReword={noop}
        onRemove={noop}
        onShare={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByTestId("space-node-menu-p1"));

    expect(screen.queryByTestId("space-node-share-p1")).toBeNull();
  });
});
