/**
 * Account page behavior (design_handoff_vidra/Account.dc.html · ADR-0014).
 *
 * Guards the real behavior carried through the rebuild — sign out, email
 * verification, reset-password link, the signed-out CTA — plus the new
 * absence of fabricated dashboards. Tests exercise the public surface (render,
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

  it("shows real identity and recovery without fabricated dashboards or navigation", () => {
    mockUseAuthUser.mockReturnValue(signedIn());
    renderPage();

    expect(screen.getByText("alex@vidra.test")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Reset password" }),
    ).toHaveAttribute(
      "href",
      "/forgot-password?email=alex%40vidra.test&redirect=%2Faccount",
    );
    expect(
      screen.queryByRole("button", {
        name: /subscription|usage|top up|upgrade|buy credits/i,
      }),
    ).toBeNull();
    expect(
      screen.queryByText(
        /10 left|monthly pool|Clips made|Daily credits|Activity/,
      ),
    ).toBeNull();
  });

  it("retains the account and reports a sign-out failure without navigating away", async () => {
    mockUseAuthUser.mockReturnValue(signedIn());
    authRepositoryMock.signOut.mockRejectedValue(new Error("Offline"));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Failed to sign out"),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Reset password" }),
    ).toBeInTheDocument();
  });

  it("reports failed verification delivery and keeps recovery available", async () => {
    mockUseAuthUser.mockReturnValue(signedIn({ emailVerified: false }));
    authRepositoryMock.sendVerificationEmail.mockRejectedValue(
      new Error("Offline"),
    );
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: /resend verification/i }),
    );
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "Failed to send verification email.",
      ),
    );
    expect(
      screen.getByRole("button", { name: /resend verification/i }),
    ).toBeInTheDocument();
  });
});
