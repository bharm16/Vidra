import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useWorkspaceProject", () => ({
  useWorkspaceProject: () => ({
    name: "My Project",
    rename: vi.fn(),
  }),
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
  it("renders the project name as static text (no inline-rename until persistence lands)", () => {
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
