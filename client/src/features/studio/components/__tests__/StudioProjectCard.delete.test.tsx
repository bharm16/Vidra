import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StudioProject } from "@features/studio/api/schemas";
import { StudioProjectCard } from "../StudioProjectCard";

/**
 * The two-step delete, carried over from the project overlay this card
 * replaced: the first click arms the row, the second confirms. Deleting a
 * studio project takes its whole thread with it, so it must not be one
 * stray click away (UX rule: destructive actions are deliberate and
 * labeled).
 */

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

describe("StudioProjectCard — two-step delete", () => {
  it("arms on the first click and does not delete", () => {
    const onDelete = renderCard();

    fireEvent.click(screen.getByLabelText("Delete Fox Logo"));

    expect(onDelete).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText("Confirm delete Fox Logo"),
    ).toBeInTheDocument();
  });

  it("deletes on the confirming second click", () => {
    const onDelete = renderCard();

    fireEvent.click(screen.getByLabelText("Delete Fox Logo"));
    fireEvent.click(screen.getByLabelText("Confirm delete Fox Logo"));

    expect(onDelete).toHaveBeenCalledWith("p1");
  });

  it("disarms when the pointer leaves the card", () => {
    const onDelete = renderCard();

    fireEvent.click(screen.getByLabelText("Delete Fox Logo"));
    fireEvent.pointerLeave(screen.getByLabelText("Confirm delete Fox Logo"));

    expect(screen.getByLabelText("Delete Fox Logo")).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("opens the project's own workspace URL", () => {
    renderCard();

    expect(
      screen.getByLabelText("Open studio project: Fox Logo"),
    ).toHaveAttribute("href", "/studio/p1");
  });
});
