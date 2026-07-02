import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ToolRail } from "@components/ToolSidebar/components/ToolRail";
import type { User } from "@features/prompt-optimizer/types/domain/prompt-session";

vi.mock("@utils/cn", () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

const useCreditBalanceMock = vi.hoisted(() => vi.fn());
const useBillingStatusMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/contexts/CreditBalanceContext", () => ({
  useCreditBalance: (...args: unknown[]) => useCreditBalanceMock(...args),
}));

vi.mock("@/features/billing/hooks/useBillingStatus", () => ({
  useBillingStatus: (...args: unknown[]) => useBillingStatusMock(...args),
}));

vi.mock("@repositories/index", () => ({
  getAuthRepository: () => ({ signOut: signOutMock }),
}));

vi.mock("@components/Toast", () => ({
  useToast: () => toastMocks,
}));

const renderToolRail = (props: {
  activePanel: Parameters<typeof ToolRail>[0]["activePanel"];
  user: User | null;
  onPanelChange: (panel: Parameters<typeof ToolRail>[0]["activePanel"]) => void;
}) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/studio", search: "?tab=1" }]}>
      <ToolRail {...props} />
    </MemoryRouter>,
  );

describe("ToolRail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useCreditBalanceMock.mockReturnValue({
      balance: 12,
      isLoading: false,
      error: null,
    });
    useBillingStatusMock.mockReturnValue({
      status: {
        isSubscribed: false,
        planTier: null,
        starterGrantCredits: 25,
        starterGrantGrantedAtMs: 123,
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
  });

  describe("error handling", () => {
    it("renders sign-in link with encoded return path for guests", () => {
      renderToolRail({
        activePanel: "sessions",
        user: null,
        onPanelChange: vi.fn(),
      });

      const link = screen.getByRole("link", { name: "Sign in" });
      expect(link.getAttribute("href")).toBe(
        `/signin?redirect=${encodeURIComponent("/studio?tab=1")}`,
      );
      expect(screen.getByText("U")).toBeInTheDocument();
    });

    it("uses email initial when displayName is empty", () => {
      const user: User = {
        uid: "user-1",
        email: "test@example.com",
        displayName: "   ",
      };

      renderToolRail({
        activePanel: "sessions",
        user,
        onPanelChange: vi.fn(),
      });

      // Signed-in: the avatar chip is a popover trigger, never a link.
      const trigger = screen.getByRole("button", { name: "Account" });
      expect(trigger).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Account" })).toBeNull();
      expect(screen.getByText("T")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("marks Tool as active when active panel is studio", () => {
      renderToolRail({
        activePanel: "studio",
        user: null,
        onPanelChange: vi.fn(),
      });

      const toolButton = screen.getByRole("button", { name: "Tool" });
      expect(toolButton).toHaveAttribute("aria-pressed", "true");
    });

    it("marks Characters as active when active panel is characters", () => {
      renderToolRail({
        activePanel: "characters",
        user: null,
        onPanelChange: vi.fn(),
      });

      const charsButton = screen.getByRole("button", { name: "Characters" });
      expect(charsButton).toHaveAttribute("aria-pressed", "true");
    });

    it("wraps every rail item in a hover tooltip", () => {
      renderToolRail({
        activePanel: "studio",
        user: null,
        onPanelChange: vi.fn(),
      });

      // Radix stamps tooltip triggers with data-state; its presence proves
      // each rail glyph keeps its hover label without racing tooltip timers.
      for (const name of ["Tool", "Characters", "Styles", "Sessions"]) {
        expect(screen.getByRole("button", { name })).toHaveAttribute(
          "data-state",
        );
      }
    });
  });

  describe("core behavior", () => {
    it("switches to studio panel when Tool is clicked", () => {
      const onPanelChange = vi.fn();

      renderToolRail({
        activePanel: "sessions",
        user: null,
        onPanelChange,
      });

      const toolButton = screen.getByRole("button", { name: "Tool" });
      toolButton.click();

      expect(onPanelChange).toHaveBeenCalledWith("studio");
    });

    it("opens the account popover in place — email, sync status, manage link, sign out", async () => {
      // The visible plan-tier text was removed in the 52px icon rail redesign
      // (planLabel is still computed but intentionally not rendered). The
      // authenticated affordance is a popover trigger, not a navigation.
      useBillingStatusMock.mockReturnValue({
        status: {
          isSubscribed: true,
          planTier: "explorer",
          starterGrantCredits: 25,
          starterGrantGrantedAtMs: 123,
        },
        isLoading: false,
        error: null,
        refresh: vi.fn(),
      });

      renderToolRail({
        activePanel: "studio",
        user: {
          uid: "user-1",
          email: "user@example.com",
          displayName: "User",
        },
        onPanelChange: vi.fn(),
      });

      fireEvent.click(screen.getByRole("button", { name: "Account" }));

      expect(await screen.findByText("user@example.com")).toBeInTheDocument();
      expect(screen.getByText("Synced to cloud")).toBeInTheDocument();

      // Leaving the workspace is an explicit, labeled action inside the
      // popover — the only place /account appears.
      const manageLink = screen.getByRole("link", { name: /Manage account/ });
      expect(manageLink.getAttribute("href")).toBe("/account");
      expect(
        screen.getByRole("button", { name: /Sign out/ }),
      ).toBeInTheDocument();
    });

    it("signs out from the popover without navigating", async () => {
      signOutMock.mockResolvedValue(undefined);

      renderToolRail({
        activePanel: "studio",
        user: {
          uid: "user-1",
          email: "user@example.com",
          displayName: "User",
        },
        onPanelChange: vi.fn(),
      });

      fireEvent.click(screen.getByRole("button", { name: "Account" }));
      fireEvent.click(await screen.findByRole("button", { name: /Sign out/ }));

      await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    });
  });
});
