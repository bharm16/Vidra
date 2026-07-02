import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { UserMenu } from "../shared/UserMenu";

const signInWithGoogleMock = vi.fn();
const signOutMock = vi.fn();
const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock("@promptstudio/system/components/ui/button", () => ({
  Button: ({ asChild, children, ...props }: any) =>
    asChild ? (
      <span {...props}>{children}</span>
    ) : (
      <button {...props}>{children}</button>
    ),
}));

vi.mock("@repositories/index", () => ({
  getAuthRepository: () => ({
    signInWithGoogle: signInWithGoogleMock,
    signOut: signOutMock,
  }),
}));

vi.mock("@components/Toast", () => ({
  useToast: () => toastMock,
}));

const renderWithRouter = (ui: React.ReactElement, path = "/") =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("shows error toast when sign-in fails", async () => {
      signInWithGoogleMock.mockRejectedValueOnce(new Error("fail"));

      renderWithRouter(<UserMenu user={null} variant="sidebar" />);

      fireEvent.click(
        screen.getByRole("button", { name: "Sign in with Google" }),
      );

      await waitFor(() => {
        expect(signInWithGoogleMock).toHaveBeenCalled();
        expect(toastMock.error).toHaveBeenCalledWith("Failed to sign in");
      });
    });

    it("shows error toast when sign-out fails", async () => {
      signOutMock.mockRejectedValueOnce(new Error("failed to sign out"));

      const user = {
        uid: "u1",
        displayName: "Ada Lovelace",
        email: "ada@example.com",
      };
      renderWithRouter(<UserMenu user={user} variant="sidebar" />);

      const button = screen.getByRole("button", { name: "User menu" });
      fireEvent.click(button);
      fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

      await waitFor(() => {
        expect(signOutMock).toHaveBeenCalled();
        expect(toastMock.error).toHaveBeenCalledWith("Failed to sign out");
        expect(button).toHaveAttribute("aria-expanded", "false");
      });
    });
  });

  describe("edge cases", () => {
    it("builds redirect link for top nav when user is signed out", () => {
      renderWithRouter(
        <UserMenu user={null} variant="topnav" />,
        "/pricing?plan=pro",
      );

      const link = screen.getByRole("link", { name: "Sign in" });
      expect(link).toHaveAttribute(
        "href",
        "/signin?redirect=%2Fpricing%3Fplan%3Dpro",
      );
    });

    it("renders a single workspace link for signed-in top nav", () => {
      const user = {
        uid: "u1",
        displayName: "Ada Lovelace",
        email: "ada@example.com",
      };
      renderWithRouter(<UserMenu user={user} variant="topnav" />);

      expect(
        screen.getByRole("link", { name: "Open workspace" }),
      ).toHaveAttribute("href", "/");
      // The marketing nav carries no account dropdown and no second CTA.
      expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
      expect(screen.queryByText("Try Vidra")).toBeNull();
    });
  });

  describe("core behavior", () => {
    it("calls sign-in repository action in sidebar variant", async () => {
      signInWithGoogleMock.mockResolvedValueOnce(undefined);

      renderWithRouter(<UserMenu user={null} variant="sidebar" />);

      fireEvent.click(
        screen.getByRole("button", { name: "Sign in with Google" }),
      );

      await waitFor(() => {
        expect(signInWithGoogleMock).toHaveBeenCalled();
        expect(toastMock.error).not.toHaveBeenCalled();
      });
    });

    it("signs out and closes menu in sidebar variant", async () => {
      signOutMock.mockResolvedValueOnce(undefined);

      const user = {
        uid: "u2",
        displayName: "Grace Hopper",
        email: "grace@example.com",
      };
      renderWithRouter(<UserMenu user={user} variant="sidebar" />);

      const button = screen.getByRole("button", { name: "User menu" });
      fireEvent.click(button);
      const signOut = screen.getByRole("button", { name: /sign out/i });
      fireEvent.click(signOut);

      await waitFor(() => {
        expect(signOutMock).toHaveBeenCalled();
        expect(toastMock.success).toHaveBeenCalledWith(
          "Signed out successfully",
        );
        expect(button).toHaveAttribute("aria-expanded", "false");
      });
    });
  });
});
