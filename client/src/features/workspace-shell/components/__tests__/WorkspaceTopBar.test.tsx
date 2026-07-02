import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const projectState = { name: "Untitled" };

vi.mock("../../hooks/useWorkspaceProject", () => ({
  useWorkspaceProject: () => ({ name: projectState.name }),
}));
vi.mock("../../hooks/useWorkspaceCredits", () => ({
  useWorkspaceCredits: () => ({ credits: 1234, avatarUrl: null }),
}));

vi.mock("@/config/features.config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/config/features.config")>();
  return {
    ...actual,
    FEATURES: { ...actual.FEATURES, BILLING_UI: true },
  };
});

import { WorkspaceTopBar } from "../WorkspaceTopBar";

describe("WorkspaceTopBar", () => {
  beforeEach(() => {
    projectState.name = "Untitled";
  });

  it("renders the session's derived title in the breadcrumb", () => {
    projectState.name = "Cozy Coffee Shop On A Rainy";
    render(<WorkspaceTopBar />);
    expect(screen.getByText("Cozy Coffee Shop On A Rainy")).toBeInTheDocument();
  });

  it("falls back to Untitled when no session title exists", () => {
    render(<WorkspaceTopBar />);
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("renders the project name as static text (no inline-rename until persistence lands)", () => {
    projectState.name = "My Project";
    render(<WorkspaceTopBar />);
    const label = screen.getByText("My Project");
    expect(label).toBeInTheDocument();
    // Locked: must NOT be a button — a click affordance that loses data on
    // remount violates the project's "browsing is read-only" UX rule.
    expect(label.tagName.toLowerCase()).toBe("span");
  });

  it("renders the credits formatted with thousands separator", () => {
    render(<WorkspaceTopBar />);
    expect(screen.getByText(/1,234/)).toBeInTheDocument();
  });
});
