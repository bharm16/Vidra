import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NavRail } from "../NavRail";

const viewport = vi.hoisted(() => ({ compact: false }));

vi.mock("@hooks/useAuthUser", () => ({ useAuthUser: () => null }));
vi.mock("@/hooks/useCompactViewport", () => ({
  useCompactViewport: () => viewport.compact,
}));

const rail = () => (
  <MemoryRouter>
    <NavRail active="library" />
  </MemoryRouter>
);

beforeEach(() => {
  viewport.compact = false;
});

describe("NavRail responsive navigation", () => {
  it("keeps every destination reachable after collapse and preserves separate mobile preferences", () => {
    const { rerender } = render(rail());
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    const destinations: ReadonlyArray<readonly [string, string]> = [
      ["New session", "/"],
      ["Library", "/history"],
      ["Live editor", "/live-editor"],
      ["Studio", "/studio"],
      ["Docs & help", "/docs"],
      ["Sign in", "/signin"],
    ];
    for (const [name, href] of destinations) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    viewport.compact = true;
    rerender(rail());
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeInTheDocument();

    viewport.compact = false;
    rerender(rail());
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
  });

  it("does not turn an initially compact viewport into a collapsed desktop preference", () => {
    viewport.compact = true;
    const { rerender } = render(rail());
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
    viewport.compact = false;
    rerender(rail());
    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeInTheDocument();
  });
});
