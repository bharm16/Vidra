import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StudioProject } from "@features/studio/api/schemas";
import { ProjectList } from "../ProjectList";

/**
 * Deleting a project is deliberate (house UX rule): the first click arms
 * the row ("Delete?"), only the second click deletes. Opening a project
 * never deletes anything.
 */

const projects: StudioProject[] = [
  { id: "p1", title: "Fox Logo", createdAtMs: 1, updatedAtMs: 1 },
];

function renderList(onDeleteProject = vi.fn(), onOpenProject = vi.fn()) {
  render(
    <ProjectList
      projects={projects}
      activeProjectId={null}
      open
      onOpenProject={onOpenProject}
      onDeleteProject={onDeleteProject}
      onClose={vi.fn()}
    />,
  );
  return { onDeleteProject, onOpenProject };
}

describe("ProjectList — two-step delete", () => {
  it("arms on the first click and deletes only on the second", () => {
    const { onDeleteProject } = renderList();

    fireEvent.click(screen.getByRole("button", { name: "Delete Fox Logo" }));
    expect(onDeleteProject).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm delete Fox Logo" }),
    );
    expect(onDeleteProject).toHaveBeenCalledWith("p1");
  });

  it("opening a project does not delete it", () => {
    const { onDeleteProject, onOpenProject } = renderList();

    // Click the title inside the open button (bubbles to its handler).
    fireEvent.click(screen.getByText("Fox Logo"));

    expect(onOpenProject).toHaveBeenCalled();
    expect(onDeleteProject).not.toHaveBeenCalled();
  });
});
