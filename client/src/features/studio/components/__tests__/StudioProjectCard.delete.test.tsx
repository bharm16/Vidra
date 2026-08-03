import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { StudioProject } from "@features/studio/api/schemas";
import { StudioProjectCard } from "../StudioProjectCard";

/**
 * Deleting a studio project takes its whole thread with it, so it must never
 * be one click away (UX rule: destructive actions are deliberate and
 * labeled). This used to be an arm-then-confirm trash chip; it is now the
 * conventional overflow menu. The invariant is the same either way and is
 * what these tests hold: the card's own surface exposes no delete verb, and
 * reaching one costs a deliberate second step that names the action.
 */

// Radix menus measure themselves via ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
window.ResizeObserver =
  window.ResizeObserver ?? (ResizeObserverStub as typeof ResizeObserver);

const project: StudioProject = {
  id: "p1",
  title: "Fox Logo",
  createdAtMs: 1,
  updatedAtMs: 1,
};

function renderCard(onDelete = vi.fn()) {
  render(
    <MemoryRouter>
      <StudioProjectCard project={project} onDelete={onDelete} />
    </MemoryRouter>,
  );
  return onDelete;
}

describe("StudioProjectCard — delete is never one click", () => {
  it("exposes no delete control until the menu is opened", () => {
    renderCard();

    // The chip is an overflow menu, not a verb: nothing on the resting card
    // deletes anything.
    expect(
      screen.getByLabelText("Project options: Fox Logo"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Delete project")).toBeNull();
  });

  it("opening the menu still does not delete", async () => {
    const user = userEvent.setup();
    const onDelete = renderCard();

    await user.click(screen.getByLabelText("Project options: Fox Logo"));

    expect(await screen.findByRole("menuitem")).toHaveTextContent(
      "Delete project",
    );
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("deletes on the named item inside the menu", async () => {
    const user = userEvent.setup();
    const onDelete = renderCard();

    await user.click(screen.getByLabelText("Project options: Fox Logo"));
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete project" }),
    );

    expect(onDelete).toHaveBeenCalledWith("p1");
  });

  it("opens the project's own workspace URL", () => {
    renderCard();

    expect(
      screen.getByLabelText("Open studio project: Fox Logo"),
    ).toHaveAttribute("href", "/studio/p1");
  });
});
