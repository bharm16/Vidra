import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioProject } from "../api/schemas";
import { StudioIndexPage } from "../StudioIndexPage";

/**
 * Regression (live, 2026-08-01): the Studio rail destination opened a
 * project instead of listing them. It listed the creator's projects, sorted
 * by updatedAtMs, and auto-opened projects[0] — while the panel's "New
 * project" button POSTed an empty "Untitled" immediately. An abandoned new
 * project therefore sat at the top of that sort forever, so every later
 * visit to Studio opened an empty thread and the creator's real work looked
 * unsaved. The only route back was an unlabeled folder icon.
 *
 * Invariants, both at the failure boundary:
 *   1. The destination LISTS. It never silently opens one project.
 *   2. Starting a new project WRITES NOTHING until the creator sends a
 *      message — no empty record can be left behind to bury the rest.
 */

vi.mock("@components/navigation/NavRail", () => ({
  NavRail: () => null,
}));

vi.mock("@/components/atmosphere", () => ({
  AmbientLight: () => null,
  Grain: () => null,
}));

vi.mock("../api/studioApi", () => ({
  listStudioProjects: vi.fn(),
  deleteStudioProject: vi.fn(),
  createStudioProject: vi.fn(),
}));

import { createStudioProject, listStudioProjects } from "../api/studioApi";

const projects: StudioProject[] = [
  {
    id: "p-empty",
    // The abandoned project that used to hijack the surface: newest, and
    // carrying no work at all.
    title: "Untitled",
    createdAtMs: 500,
    updatedAtMs: 500,
  },
  {
    id: "p-real",
    title: "Minimalist Fox Logo",
    coverUrl: "https://example.test/fox.png",
    createdAtMs: 100,
    updatedAtMs: 200,
  },
];

function renderIndex() {
  return render(
    <MemoryRouter>
      <StudioIndexPage />
    </MemoryRouter>,
  );
}

describe("regression: the Studio destination lists projects, never opens one", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows every project, including the one an auto-open would have hidden", async () => {
    vi.mocked(listStudioProjects).mockResolvedValue(projects);

    renderIndex();

    // The real work is reachable from the destination itself — it is not
    // buried behind the newest empty project.
    const real = await screen.findByLabelText(
      "Open studio project: Minimalist Fox Logo",
    );
    expect(real).toHaveAttribute("href", "/studio/p-real");

    expect(
      screen.getByLabelText("Open studio project: Untitled"),
    ).toHaveAttribute("href", "/studio/p-empty");
  });

  it("offers to start a project without creating one", async () => {
    vi.mocked(listStudioProjects).mockResolvedValue(projects);

    renderIndex();

    const create = await screen.findByLabelText("Create new project");
    // Routing, not writing. A POST here is what produced the empty
    // "Untitled" records that buried real work.
    expect(create).toHaveAttribute("href", "/studio/new");
    expect(createStudioProject).not.toHaveBeenCalled();
  });

  it("still offers the create tile when the creator has no projects", async () => {
    vi.mocked(listStudioProjects).mockResolvedValue([]);

    renderIndex();

    await waitFor(() =>
      expect(screen.getByLabelText("Create new project")).toBeInTheDocument(),
    );
    expect(createStudioProject).not.toHaveBeenCalled();
  });
});
