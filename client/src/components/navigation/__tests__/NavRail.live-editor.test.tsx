import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NavRail } from "../NavRail";

vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: () => null,
}));

describe("NavRail — Live editor entry (ADR-0017)", () => {
  it("sits directly under Library and points at /live-editor", () => {
    render(
      <MemoryRouter>
        <NavRail />
      </MemoryRouter>,
    );

    const library = screen.getByRole("link", { name: /Library/ });
    const liveEditor = screen.getByRole("link", { name: /Live editor/ });

    expect(liveEditor).toHaveAttribute("href", "/live-editor");
    // Directly under Library: next link in document order.
    const links = screen.getAllByRole("link");
    expect(links.indexOf(liveEditor)).toBe(links.indexOf(library) + 1);
  });

  it("highlights when the live editor is the active destination", () => {
    render(
      <MemoryRouter>
        <NavRail active="live-editor" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: /Live editor/ }).className,
    ).toContain("text-foreground");
  });
});
