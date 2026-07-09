import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { SignInPage } from "../SignInPage";
import { SignUpPage } from "../SignUpPage";
import { EmailVerificationPage } from "../EmailVerificationPage";

const mockUseAuthUser = vi.hoisted(() => vi.fn());
const authRepositoryMock = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  verifyEmailWithCode: vi.fn(),
  refreshCurrentUser: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/utils/cn", () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
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

vi.mock("@promptstudio/system/components/ui/button", () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    children: React.ReactNode;
  }) => {
    if (asChild) {
      return (
        <span {...(props as React.HTMLAttributes<HTMLSpanElement>)}>
          {children}
        </span>
      );
    }
    return <button {...props}>{children}</button>;
  },
}));

type LocationSnapshot = {
  pathname: string;
  search: string;
  state: unknown;
};

const authenticatedUser = {
  uid: "user-1",
  email: "ada@example.com",
  displayName: "Ada",
  emailVerified: false,
  isAnonymous: false,
};

function LocationProbe(): React.ReactElement {
  const location = useLocation();
  const snapshot: LocationSnapshot = {
    pathname: location.pathname,
    search: location.search,
    state: location.state ?? null,
  };

  return (
    <output data-testid="location-probe">{JSON.stringify(snapshot)}</output>
  );
}

function VerificationRoute(): React.ReactElement {
  return (
    <>
      <LocationProbe />
      <EmailVerificationPage />
    </>
  );
}

function renderSignUp(path: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/email-verification" element={<VerificationRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderSignIn(path: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEmailVerification(
  entry:
    | string
    | {
        pathname: string;
        search?: string;
        state?: unknown;
      },
): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/email-verification" element={<VerificationRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

function readLocationProbe(): LocationSnapshot {
  const payload = screen.getByTestId("location-probe").textContent;
  if (!payload) {
    throw new Error("Missing location probe payload");
  }
  return JSON.parse(payload) as LocationSnapshot;
}

describe("regression: auth page hard-bug fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthUser.mockReturnValue(null);
    authRepositoryMock.signInWithGoogle.mockResolvedValue(undefined);
    authRepositoryMock.signInWithEmail.mockResolvedValue(undefined);
    authRepositoryMock.signUpWithEmail.mockResolvedValue(undefined);
    authRepositoryMock.sendVerificationEmail.mockResolvedValue(undefined);
    authRepositoryMock.verifyEmailWithCode.mockResolvedValue(undefined);
    authRepositoryMock.refreshCurrentUser.mockResolvedValue(null);
  });

  it("preserves redirect on the sign-up footer sign-in link", () => {
    renderSignUp("/signup?redirect=%2Fsettings%2Fbilling");

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/signin?redirect=%2Fsettings%2Fbilling",
    );
  });

  it("preserves redirect on the sign-in footer create-account link", () => {
    renderSignIn("/signin?redirect=%2Fsettings%2Fbilling");

    expect(
      screen.getByRole("link", { name: "Create an account" }),
    ).toHaveAttribute("href", "/signup?redirect=%2Fsettings%2Fbilling");
  });

  it("maps auth/invalid-credential to the credential guidance copy", async () => {
    authRepositoryMock.signInWithEmail.mockRejectedValueOnce({
      code: "auth/invalid-credential",
    });

    renderSignIn("/signin");

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in & continue" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Incorrect email or password.",
      );
    });
  });

  it("routes to email verification with failed delivery state when signup email delivery fails", async () => {
    authRepositoryMock.signUpWithEmail.mockResolvedValueOnce({
      ...authenticatedUser,
      displayName: "Ada",
    });
    authRepositoryMock.sendVerificationEmail.mockRejectedValueOnce({
      code: "auth/unauthorized-continue-uri",
    });

    renderSignUp("/signup?redirect=%2Fsettings%2Fbilling");

    fireEvent.change(screen.getByPlaceholderText("Your name (optional)"), {
      target: { value: "Ada" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Password (at least 6 characters)"),
      {
        target: { value: "Passw0rd!" },
      },
    );
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
      target: { value: "Passw0rd!" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create account & continue" }),
    );

    await waitFor(() => {
      expect(readLocationProbe()).toMatchObject({
        pathname: "/email-verification",
        search: "?redirect=%2Fsettings%2Fbilling&email=ada%40example.com",
        state: { delivery: "failed" },
      });
    });

    expect(screen.queryByText(/We sent a verification link to/i)).toBeNull();
    expect(
      screen.getByText(/couldn't send the verification email yet/i),
    ).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith(
      "Account created. Welcome, Ada!",
    );
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("routes to email verification with sent delivery state when signup email delivery succeeds", async () => {
    authRepositoryMock.signUpWithEmail.mockResolvedValueOnce({
      ...authenticatedUser,
      displayName: "Ada",
    });

    renderSignUp("/signup?redirect=%2Fsettings%2Fbilling");

    fireEvent.change(screen.getByPlaceholderText("Your name (optional)"), {
      target: { value: "Ada" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Password (at least 6 characters)"),
      {
        target: { value: "Passw0rd!" },
      },
    );
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), {
      target: { value: "Passw0rd!" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create account & continue" }),
    );

    await waitFor(() => {
      expect(readLocationProbe()).toMatchObject({
        pathname: "/email-verification",
        search: "?redirect=%2Fsettings%2Fbilling&email=ada%40example.com",
        state: { delivery: "sent" },
      });
    });

    expect(
      screen.getByText(/We sent a verification link to/i),
    ).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith(
      "Account created. Welcome, Ada!",
    );
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("shows the failed delivery panel when entered with failed delivery state", () => {
    renderEmailVerification({
      pathname: "/email-verification",
      search: "?email=ada%40example.com",
      state: { delivery: "failed" },
    });

    expect(screen.getByText("Verification email not sent")).toBeInTheDocument();
    expect(
      screen.getByText(/couldn't send the verification email yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/We sent a verification link to/i)).toBeNull();
  });

  it("switches from failed delivery to inbox state after a successful resend", async () => {
    mockUseAuthUser.mockReturnValue(authenticatedUser);

    renderEmailVerification({
      pathname: "/email-verification",
      search: "?email=ada%40example.com",
      state: { delivery: "failed" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Resend email" }));

    await waitFor(() => {
      expect(screen.getByText("Check your inbox")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/We sent a verification link to/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Verification email not sent")).toBeNull();
    expect(authRepositoryMock.sendVerificationEmail).toHaveBeenCalledWith(
      undefined,
    );
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("keeps the failed delivery state and shows inline feedback after a resend failure", async () => {
    mockUseAuthUser.mockReturnValue(authenticatedUser);
    authRepositoryMock.sendVerificationEmail.mockRejectedValueOnce({
      code: "auth/unauthorized-continue-uri",
    });

    renderEmailVerification({
      pathname: "/email-verification",
      search: "?email=ada%40example.com",
      state: { delivery: "failed" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Resend email" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Email verification links aren't configured for this domain yet.",
      );
    });

    expect(screen.getByText("Verification email not sent")).toBeInTheDocument();
    expect(screen.queryByText(/We sent a verification link to/i)).toBeNull();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
