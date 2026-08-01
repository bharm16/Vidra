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

    // The active treatment is CSS keyed off aria-current (.ps-btn[aria-current]
    // in the shared control base), so the contract to assert is the semantic
    // marker, not a utility class that happens to carry the colour today.
    expect(screen.getByRole("link", { name: /Live editor/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
