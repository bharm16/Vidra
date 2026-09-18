import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SpaceNodeMenu } from "../SpaceNodeMenu";
import type { SpaceNode } from "../../lineage/types";

/**
 * "Refine in the studio" (issue #88, ADR-0022 decision 4) is a picture's
 * action: it opens a studio project born from that take. A clip cannot be
 * refined, and words are not media — the item appears on pictures and only on
 * pictures.
 */

const picture: SpaceNode = { id: "p1", kind: "picture", ancestorId: null };
const clip: SpaceNode = { id: "g1", kind: "clip", ancestorId: null };
const words: SpaceNode = { id: "words-v1", kind: "words", ancestorId: null };
const noop = (): void => {};

describe("SpaceNodeMenu — Refine in the studio", () => {
  it("offers it on a picture and invokes onRefine with the node", async () => {
    const onRefine = vi.fn();
    render(
      <SpaceNodeMenu
        node={picture}
        removable={false}
        onReword={noop}
        onRemove={noop}
        onRefine={onRefine}
      />,
    );

    await userEvent.click(screen.getByTestId("space-node-menu-p1"));
    await userEvent.click(await screen.findByTestId("space-node-refine-p1"));

    expect(onRefine).toHaveBeenCalledWith(picture);
  });

  it("does not offer it on a clip", async () => {
    render(
      <SpaceNodeMenu
        node={clip}
        removable={false}
        onReword={noop}
        onRemove={noop}
        onRefine={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByTestId("space-node-menu-g1"));

    expect(screen.queryByTestId("space-node-refine-g1")).toBeNull();
  });

  it("does not offer it on a words node", async () => {
    render(
      <SpaceNodeMenu
        node={words}
        removable={false}
        onReword={noop}
        onRemove={noop}
        onRefine={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByTestId("space-node-menu-words-v1"));

    expect(screen.queryByTestId("space-node-refine-words-v1")).toBeNull();
  });

  it("omits it when no handler is wired", async () => {
    render(
      <SpaceNodeMenu
        node={picture}
        removable={false}
        onReword={noop}
        onRemove={noop}
      />,
    );

    await userEvent.click(screen.getByTestId("space-node-menu-p1"));

    expect(screen.queryByTestId("space-node-refine-p1")).toBeNull();
  });
});
