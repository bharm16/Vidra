import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SignInPage } from "../SignInPage";
import { SignUpPage } from "../SignUpPage";
import { ForgotPasswordPage } from "../ForgotPasswordPage";
import { PasswordResetPage } from "../PasswordResetPage";
import { EmailVerificationPage } from "../EmailVerificationPage";

const navigate = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  sendPasswordReset: vi.fn(),
  validatePasswordResetCode: vi.fn(),
  confirmPasswordResetWithCode: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@hooks/useAuthUser", () => ({ useAuthUser: () => null }));
// Firebase is the authentication wire boundary, exposed through this repository.
vi.mock("@repositories/index", () => ({ getAuthRepository: () => auth }));
vi.mock("@components/Toast", () => ({ useToast: () => toast }));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

function renderPage(page: React.ReactElement, path: string): void {
  render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("Auth form behavior through the Page 21 rebuild", () => {
  it("keeps distinct signup field labels and rejects mismatched passwords before account creation", async () => {
    renderPage(<SignUpPage />, "/signup");
    const password = screen.getByLabelText("Password", { exact: true });
    const confirmation = screen.getByLabelText("Confirm password", {
      exact: true,
    });
    expect(password).not.toBe(confirmation);
    expect(screen.getByLabelText("Full name (optional)")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "creator@example.com" },
    });
    fireEvent.change(password, { target: { value: "password-a" } });
    fireEvent.change(confirmation, { target: { value: "password-b" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Create account & continue" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Passwords do not match.",
    );
    expect(auth.signUpWithEmail).not.toHaveBeenCalled();
  });

  it("retains credentials and the return destination when sign-in is rejected", async () => {
    auth.signInWithEmail.mockRejectedValue({ code: "auth/invalid-credential" });
    renderPage(<SignInPage />, "/signin?redirect=%2Fstudio");
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "creator@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "incorrect" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in & continue" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveValue("creator@example.com");
    expect(
      screen.getByRole("link", { name: "Create an account" }),
    ).toHaveAttribute("href", "/signup?redirect=%2Fstudio");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not report reset-email delivery after the authentication service rejects it", async () => {
    auth.sendPasswordReset.mockRejectedValue({
      code: "auth/too-many-requests",
    });
    renderPage(
      <ForgotPasswordPage />,
      "/forgot-password?email=creator%40example.com&redirect=%2Fstudio",
    );
    fireEvent.click(screen.getByRole("button", { name: "Send reset email" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("creator@example.com");
    expect(auth.sendPasswordReset).toHaveBeenCalledWith(
      "creator@example.com",
      "/studio",
    );
  });

  it("rejects a non-reset action code without validating or redeeming it", async () => {
    renderPage(
      <PasswordResetPage />,
      "/reset-password?mode=verifyEmail&oobCode=wrong-action&redirect=%2Fstudio",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This link is not a password reset link.",
    );
    expect(auth.validatePasswordResetCode).not.toHaveBeenCalled();
    expect(auth.confirmPasswordResetWithCode).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Request new email" }),
    ).toHaveAttribute("href", "/forgot-password?redirect=%2Fstudio");
  });

  it("keeps signed-out verification resend disabled and preserves the continuation destination", async () => {
    renderPage(
      <EmailVerificationPage />,
      "/email-verification?redirect=%2Fstudio",
    );
    expect(screen.getByRole("button", { name: "Resend email" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Sign in to continue" }),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/signin?redirect=%2Fstudio", {
        replace: true,
      }),
    );
    expect(auth.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("requires matching valid passwords before redeeming a verified reset code", async () => {
    auth.validatePasswordResetCode.mockResolvedValue("creator@example.com");
    auth.confirmPasswordResetWithCode.mockResolvedValue(undefined);
    renderPage(
      <PasswordResetPage />,
      "/reset-password?mode=resetPassword&oobCode=valid-code&redirect=%2Fstudio",
    );
    const password = await screen.findByLabelText("New password");
    const confirmation = screen.getByLabelText("Confirm password");
    fireEvent.change(password, { target: { value: "short" } });
    fireEvent.change(confirmation, { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Password must be at least 6 characters.",
    );
    expect(auth.confirmPasswordResetWithCode).not.toHaveBeenCalled();
    fireEvent.change(password, { target: { value: "valid-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Passwords do not match.",
    );
    expect(auth.confirmPasswordResetWithCode).not.toHaveBeenCalled();
    fireEvent.change(confirmation, { target: { value: "valid-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(
      await screen.findByRole("heading", { name: "Password updated" }),
    ).toBeVisible();
    expect(auth.confirmPasswordResetWithCode).toHaveBeenCalledWith(
      "valid-code",
      "valid-password",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to sign in" }),
    );
    expect(navigate).toHaveBeenCalledWith("/signin?redirect=%2Fstudio", {
      replace: true,
    });
  });
});
