import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NavRail } from "../NavRail";

vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: () => null,
}));

/**
 * Regression: the rail is a signed-out visitor's only route to sign-in.
 *
 * 1. Failure boundary: UI component — NavRail's account row.
 * 2. Mock boundary: useAuthUser (the auth seam), returning a guest.
 * 3. Invariant: a guest sees exactly one sign-in affordance in the rail, and
 *    it points at /signin.
 *
 * The workspace top bar used to carry its own Sign in, so a guest saw the same
 * action twice at two different sizes and weights. That one was removed, which
 * makes this the last one — deleting it would strand guests with no way in.
 */
describe("regression: the rail carries the guest sign-in affordance", () => {
  function renderRail() {
    return render(
      <MemoryRouter>
        <NavRail />
      </MemoryRouter>,
    );
  }

  it("offers exactly one sign-in affordance to a guest", () => {
    renderRail();
    expect(screen.getAllByRole("link", { name: /sign in/i })).toHaveLength(1);
  });

  it("points that affordance at /signin", () => {
    renderRail();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/signin",
    );
  });

  it("does not name a guest as an account holder", () => {
    renderRail();
    // "Guest" over "Sign in" said the same thing twice, in two type faces,
    // inside one 36px row.
    expect(screen.queryByText("Guest")).toBeNull();
  });
});
