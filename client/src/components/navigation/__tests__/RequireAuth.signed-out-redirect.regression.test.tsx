import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { RequireAuth } from "../RequireAuth";
import type { User } from "@hooks/types";

/**
 * Regression: account-scoped surfaces (Library, Account, Live editor,
 * Studio) rendered for signed-out visitors — in production every
 * account-scoped call then failed raw (Studio submits 401'd, live-editor
 * strokes died silently), while the dev API-key fallback masked it all
 * locally. Signed-out visits must land on sign-in with a way back.
 */

type AuthOptions = { onChange?: (user: User | null) => void };
const authState = vi.hoisted(() => ({
  user: null as User | null,
  resolved: true,
}));

vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: (options: AuthOptions = {}) => {
    const { onChange } = options;
    React.useEffect(() => {
      if (authState.resolved) onChange?.(authState.user);
    }, [onChange]);
    return authState.user;
  },
}));

function SignInProbe(): React.ReactElement {
  const location = useLocation();
  return <div data-testid="signin">{location.search}</div>;
}

const renderGuarded = (initialPath: string): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/signin" element={<SignInProbe />} />
        <Route
          path="/studio"
          element={
            <RequireAuth>
              <div data-testid="studio-page" />
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe("regression: signed-out visits to account-scoped routes land on sign-in", () => {
  it("a signed-out visitor is redirected to /signin with a redirect back to the original location", () => {
    authState.user = null;
    authState.resolved = true;

    renderGuarded("/studio?tab=recent");

    expect(screen.getByTestId("signin").textContent).toBe(
      `?redirect=${encodeURIComponent("/studio?tab=recent")}`,
    );
    expect(screen.queryByTestId("studio-page")).toBeNull();
  });

  it("nothing renders (and no redirect fires) before the initial auth state lands", () => {
    authState.user = null;
    authState.resolved = false;

    renderGuarded("/studio");

    expect(screen.queryByTestId("signin")).toBeNull();
    expect(screen.queryByTestId("studio-page")).toBeNull();
  });

  it("a signed-in visitor renders the surface", () => {
    authState.user = { uid: "user-1" } as User;
    authState.resolved = true;

    renderGuarded("/studio");

    expect(screen.getByTestId("studio-page")).toBeInTheDocument();
    expect(screen.queryByTestId("signin")).toBeNull();
  });
});
