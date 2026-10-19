import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SignInPage } from "../SignInPage";
import { SignUpPage } from "../SignUpPage";
import { ForgotPasswordPage } from "../ForgotPasswordPage";
import { PasswordResetPage } from "../PasswordResetPage";
import { EmailVerificationPage } from "../EmailVerificationPage";

const navigate = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ signInWithEmail: vi.fn(), signInWithGoogle: vi.fn(), signUpWithEmail: vi.fn(), sendPasswordReset: vi.fn(), validatePasswordResetCode: vi.fn(), confirmPasswordResetWithCode: vi.fn(), sendVerificationEmail: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@hooks/useAuthUser", () => ({ useAuthUser: () => null }));
vi.mock("@repositories/index", () => ({ getAuthRepository: () => auth }));
vi.mock("@components/Toast", () => ({ useToast: () => toast }));
vi.mock("react-router-dom", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-router-dom")>()), useNavigate: () => navigate }));
function renderPage(page: React.ReactElement, path: string): ReturnType<typeof render> { return render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>); }
beforeEach(() => { vi.resetAllMocks(); });

describe("Approved single-card auth behavior", () => {
  it("uses one password with Show and rejects a short signup password before creating an account", () => {
    renderPage(<SignUpPage />, "/signup");
    expect(screen.queryByLabelText("Confirm password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Full name (optional)")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "creator@example.com" } });
    const password = screen.getByLabelText("Password", { exact: true });
    fireEvent.change(password, { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Use at least 6 characters.");
    expect(auth.signUpWithEmail).not.toHaveBeenCalled();
  });
  it("keeps credentials and the return destination when sign-in is rejected", async () => {
    auth.signInWithEmail.mockRejectedValue({ code: "auth/invalid-credential" });
    renderPage(<SignInPage />, "/signin?redirect=%2Fstudio");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "creator@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "incorrect" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(screen.getByLabelText("Email")).toHaveValue("creator@example.com");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/signup?redirect=%2Fstudio");
    expect(navigate).not.toHaveBeenCalled();
  });
  it("does not navigate from a stale auth operation after the page unmounts", async () => {
    let complete: ((user: { uid: string }) => void) | undefined;
    auth.signInWithEmail.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const view = renderPage(<SignInPage />, "/signin");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "creator@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    view.unmount();
    await act(async () => { complete?.({ uid: "creator" }); });
    expect(navigate).not.toHaveBeenCalled();
  });
  it("does not report reset delivery after the provider rejects it", async () => {
    auth.sendPasswordReset.mockRejectedValue({ code: "auth/too-many-requests" });
    renderPage(<ForgotPasswordPage />, "/forgot-password?email=creator%40example.com&redirect=%2Fstudio");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Check your inbox" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("creator@example.com");
    expect(auth.sendPasswordReset).toHaveBeenCalledWith("creator@example.com", "/studio");
  });
  it("keeps reset success non-enumerating and offers a different address", async () => {
    auth.sendPasswordReset.mockResolvedValue(undefined);
    renderPage(<ForgotPasswordPage />, "/forgot-password?email=creator%40example.com");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toBeVisible();
    expect(screen.getByText(/If an account uses creator@example.com/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByLabelText("Email")).toHaveValue("creator@example.com");
  });
  it("rejects non-reset action codes before validation or redemption", async () => {
    renderPage(<PasswordResetPage />, "/reset-password?mode=verifyEmail&oobCode=wrong-action&redirect=%2Fstudio");
    expect(await screen.findByRole("alert")).toHaveTextContent("This link is not a password reset link.");
    expect(auth.validatePasswordResetCode).not.toHaveBeenCalled();
    expect(auth.confirmPasswordResetWithCode).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password?redirect=%2Fstudio");
  });
  it("keeps signed-out verification disabled and preserves the continuation", async () => {
    renderPage(<EmailVerificationPage />, "/email-verification?redirect=%2Fstudio");
    expect(screen.getByRole("button", { name: "Resend verification" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to continue" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/signin?redirect=%2Fstudio", { replace: true }));
    expect(auth.sendVerificationEmail).not.toHaveBeenCalled();
  });
  it("requires a valid single password before redeeming a verified reset code", async () => {
    auth.validatePasswordResetCode.mockResolvedValue("creator@example.com");
    auth.confirmPasswordResetWithCode.mockResolvedValue(undefined);
    renderPage(<PasswordResetPage />, "/reset-password?mode=resetPassword&oobCode=valid-code&redirect=%2Fstudio");
    const password = await screen.findByLabelText("New password");
    fireEvent.change(password, { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Password must be at least 6 characters.");
    expect(auth.confirmPasswordResetWithCode).not.toHaveBeenCalled();
    fireEvent.change(password, { target: { value: "valid-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByRole("heading", { name: "Your password is changed" })).toBeVisible();
    expect(auth.confirmPasswordResetWithCode).toHaveBeenCalledWith("valid-code", "valid-password");
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(navigate).toHaveBeenCalledWith("/signin?redirect=%2Fstudio", { replace: true });
  });
});
