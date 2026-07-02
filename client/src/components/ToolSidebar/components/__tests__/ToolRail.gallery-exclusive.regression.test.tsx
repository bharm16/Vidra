import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToolRail } from "../ToolRail";

vi.mock("@/contexts/CreditBalanceContext", () => ({
  useCreditBalance: () => ({
    balance: 10,
    isLoading: false,
  }),
}));

vi.mock("@/features/billing/hooks/useBillingStatus", () => ({
  useBillingStatus: () => ({
    status: { isSubscribed: false },
    isLoading: false,
  }),
}));

describe("regression: nav rail buttons reflect activePanel", () => {
  it("marks nav button matching activePanel as active", () => {
    render(
      <MemoryRouter>
        <ToolRail
          activePanel="characters"
          onPanelChange={vi.fn()}
          user={null}
        />
      </MemoryRouter>,
    );

    const charsButton = screen.getByRole("button", { name: "Chars" });
    expect(charsButton).toHaveAttribute("aria-pressed", "true");
    expect(charsButton.className).toContain("bg-tool-nav-active");
  });

  it("does not mark non-matching nav buttons as active", () => {
    render(
      <MemoryRouter>
        <ToolRail
          activePanel="characters"
          onPanelChange={vi.fn()}
          user={null}
        />
      </MemoryRouter>,
    );

    const stylesButton = screen.getByRole("button", { name: "Styles" });
    expect(stylesButton).toHaveAttribute("aria-pressed", "false");
    expect(stylesButton.className).not.toContain("bg-tool-nav-active");
  });
});
