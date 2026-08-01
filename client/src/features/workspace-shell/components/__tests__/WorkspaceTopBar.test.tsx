import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const projectState = { name: "Untitled" };
const authState: { user: unknown } = { user: null };

vi.mock("../../hooks/useWorkspaceProject", () => ({
  useWorkspaceProject: () => ({ name: projectState.name }),
}));
vi.mock("../../hooks/useWorkspaceCredits", () => ({
  useWorkspaceCredits: () => ({ credits: 1234 }),
}));
vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: () => authState.user,
}));
vi.mock("@components/Toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
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

const SIGNED_IN_USER = {
  uid: "u1",
  email: "ann@example.com",
  displayName: "Ann",
  photoURL: null,
};

function renderTopBar(minimal = false): void {
  render(
    <MemoryRouter>
      <WorkspaceTopBar minimal={minimal} />
    </MemoryRouter>,
  );
}

describe("WorkspaceTopBar", () => {
  beforeEach(() => {
    projectState.name = "Untitled";
    authState.user = null;
  });

  it("renders the session's derived title in the breadcrumb", () => {
    projectState.name = "Cozy Coffee Shop On A Rainy";
    renderTopBar();
    expect(screen.getByText("Cozy Coffee Shop On A Rainy")).toBeInTheDocument();
  });

  it("falls back to Untitled when no session title exists", () => {
    renderTopBar();
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("renders the project name as static text (no inline-rename until persistence lands)", () => {
    projectState.name = "My Project";
    renderTopBar();
    const label = screen.getByText("My Project");
    expect(label).toBeInTheDocument();
    // Locked: must NOT be a button — a click affordance that loses data on
    // remount violates the project's "browsing is read-only" UX rule.
    expect(label.tagName.toLowerCase()).toBe("span");
  });

  it("renders the credits formatted with thousands separator", () => {
    renderTopBar();
    expect(screen.getByText(/1,234/)).toBeInTheDocument();
  });

  it("carries no auth affordance when signed out — the rail owns it", () => {
    authState.user = null;
    renderTopBar();
    const banner = screen.getByRole("banner");
    // The top bar used to carry its own Sign in, which meant a guest saw the
    // same action twice at two sizes and two weights: 46x20/600 in the rail
    // and 63x36/500 here. The rail is where nav lives, so the rail keeps it.
    expect(within(banner).queryByRole("link", { name: /sign in/i })).toBeNull();
    // Library and the account popover are signed-in affordances; a guest gets
    // neither (history is auth-gated, and there is no account yet).
    expect(
      within(banner).queryByRole("button", { name: /account/i }),
    ).toBeNull();
    expect(within(banner).queryByRole("link", { name: /library/i })).toBeNull();
  });

  it("shows a Library link to /history when signed in", () => {
    authState.user = SIGNED_IN_USER;
    renderTopBar();
    const library = screen.getByRole("link", { name: /library/i });
    expect(library).toHaveAttribute("href", "/history");
  });

  it("keeps both the cluster gap and the entrance animation when minimal", () => {
    authState.user = SIGNED_IN_USER;
    renderTopBar(true);
    const cluster = screen
      .getByRole("link", { name: /library/i })
      .closest("div");
    // The conditional class was concatenated without a separating space, so
    // the pair collapsed into the single junk class `gap-1ps-rise` and both
    // the spacing and the rise animation were silently lost.
    expect(cluster).toHaveClass("gap-1");
    expect(cluster).toHaveClass("ps-rise");
  });

  it("shows the account avatar popover trigger when signed in", () => {
    authState.user = SIGNED_IN_USER;
    renderTopBar();
    expect(
      screen.getByRole("button", { name: /account/i }),
    ).toBeInTheDocument();
  });
});
