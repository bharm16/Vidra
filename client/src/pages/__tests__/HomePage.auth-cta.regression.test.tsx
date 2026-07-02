/**
 * Regression test: the gallery landing renders a single auth-aware CTA.
 *
 * Previously the hero stacked two CTAs ("Open workspace" + "Create account")
 * and showed the signup CTA even for authenticated users. The manifesto
 * zero-state now renders exactly one CTA: "Sign in" (to /signin) when signed
 * out, "Open workspace" (to the workspace) when signed in (ADR-0008,
 * design-overhaul decision 6).
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "../HomePage";

const mockUseAuthUser = vi.hoisted(() => vi.fn());

vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: mockUseAuthUser,
}));

describe("regression: HomePage single auth-aware CTA", () => {
  it('shows only "Open workspace" when authenticated', () => {
    mockUseAuthUser.mockReturnValue({ uid: "user-1", email: "test@test.com" });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: "Open workspace" }),
    ).toHaveAttribute("href", "/");
    expect(screen.queryByText("Sign in")).toBeNull();
    expect(screen.queryByText("Create account")).toBeNull();
  });

  it('shows only "Sign in" when signed out', () => {
    mockUseAuthUser.mockReturnValue(null);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/signin",
    );
    expect(screen.queryByText("Open workspace")).toBeNull();
    expect(screen.queryByText("Create account")).toBeNull();
  });
});
