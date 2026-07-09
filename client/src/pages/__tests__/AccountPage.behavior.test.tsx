/**
 * Account page behavior (design_handoff_vidra/Account.dc.html · ADR-0014).
 *
 * Guards the real behavior carried through the rebuild — sign out, email
 * verification, reset-password link, the signed-out CTA — plus the new
 * settings-section switching. Tests exercise the public surface (render,
 * click, assert observable content) so they survive the visual polish pass.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { User } from "@features/prompt-optimizer";
import { AccountPage } from "../AccountPage";

const mockUseAuthUser = vi.hoisted(() => vi.fn());
const mockNavigate = vi.hoisted(() => vi.fn());
const authRepositoryMock = vi.hoisted(() => ({
  signOut: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: mockUseAuthUser,
}));

vi.mock("@repositories/index", () => ({
  getAuthRepository: () => authRepositoryMock,
}));

vi.mock("@components/Toast", () => ({
  useToast: () => toastMock,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// Local Button stub: render `asChild` children as-is (so links stay anchors)
// and forward only DOM-valid props, keeping the design-system's variant/
// loading props off the DOM.
vi.mock("@promptstudio/system/components/ui/button", () => ({
  Button: ({
    asChild,
    children,
    onClick,
    disabled,
    type,
    className,
  }: {
    asChild?: boolean;
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLElement>;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    className?: string;
  }) => {
    if (asChild) return <>{children}</>;
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        type={type}
        className={className}
      >
        {children}
      </button>
    );
  },
}));

const signedIn = (overrides?: Partial<User>): User => ({
  uid: "user-1",
  email: "alex@vidra.test",
  displayName: "Alex Rivera",
  emailVerified: true,
  ...overrides,
});

const renderPage = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter>
      <AccountPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  authRepositoryMock.signOut.mockResolvedValue(undefined);
  authRepositoryMock.sendVerificationEmail.mockResolvedValue(undefined);
});

describe("AccountPage behavior", () => {
  it("carries the nav rail so every surface stays navigable", () => {
    mockUseAuthUser.mockReturnValue(signedIn());
    renderPage();

    expect(
      screen.getByRole("link", { name: /Live editor/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Library/ })).toBeInTheDocument();
  });

  it("signs out through the settings nav, then navigates to /signin", async () => {
    mockUseAuthUser.mockReturnValue(signedIn());
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() =>
      expect(authRepositoryMock.signOut).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/signin", { replace: true }),
    );
  });

  it("unverified: shows Resend verification and sends to /account", async () => {
    mockUseAuthUser.mockReturnValue(signedIn({ emailVerified: false }));
    renderPage();

    expect(screen.getByText("Not verified")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /resend verification/i }),
    );

    await waitFor(() =>
      expect(authRepositoryMock.sendVerificationEmail).toHaveBeenCalledWith(
        "/account",
      ),
    );
  });

  it("verified: shows the Verified badge and no Resend verification", () => {
    mockUseAuthUser.mockReturnValue(signedIn({ emailVerified: true }));
    renderPage();

    expect(screen.getByText("Verified")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /resend verification/i }),
    ).toBeNull();
  });

  it("not signed in: renders the Sign in / Create account CTA", () => {
    mockUseAuthUser.mockReturnValue(null);
    renderPage();

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/signin",
    );
    expect(
      screen.getByRole("link", { name: "Create account" }),
    ).toHaveAttribute("href", "/signup");
  });

  it("switches settings sections via the sub-nav", () => {
    mockUseAuthUser.mockReturnValue(signedIn());
    renderPage();

    // Personal profile is the default section.
    expect(screen.getByText("Reset password")).toBeTruthy();
    expect(screen.queryByText("Billing history")).toBeNull();
    expect(screen.queryByText("Daily credits")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /subscription/i }));
    expect(screen.getByText("Billing history")).toBeTruthy();
    expect(screen.queryByText("Reset password")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /usage/i }));
    expect(screen.getByText("Daily credits")).toBeTruthy();
    expect(screen.queryByText("Billing history")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /personal profile/i }));
    expect(screen.getByText("Reset password")).toBeTruthy();
  });
});
