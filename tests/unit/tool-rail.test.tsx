import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ToolRail } from "@components/ToolSidebar/components/ToolRail";
import type { User } from "@features/prompt-optimizer/types/domain/prompt-session";

vi.mock("@utils/cn", () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

const useCreditBalanceMock = vi.hoisted(() => vi.fn());
const useBillingStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/CreditBalanceContext", () => ({
  useCreditBalance: (...args: unknown[]) => useCreditBalanceMock(...args),
}));

vi.mock("@/features/billing/hooks/useBillingStatus", () => ({
  useBillingStatus: (...args: unknown[]) => useBillingStatusMock(...args),
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

      const link = screen.getByRole("link", { name: "Account" });
      expect(link.getAttribute("href")).toBe("/account");
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

    it("renders account link for a subscribed user", () => {
      // The visible plan-tier text was removed in the 52px icon rail redesign
      // (planLabel is still computed but intentionally not rendered). Assert
      // the authenticated user still gets the account affordance.
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

      const accountLink = screen.getByRole("link", { name: "Account" });
      expect(accountLink.getAttribute("href")).toBe("/account");
    });

    it("renders account link for an unsubscribed user", () => {
      renderToolRail({
        activePanel: "studio",
        user: {
          uid: "user-1",
          email: "user@example.com",
          displayName: "User",
        },
        onPanelChange: vi.fn(),
      });

      const accountLink = screen.getByRole("link", { name: "Account" });
      expect(accountLink.getAttribute("href")).toBe("/account");
    });
  });
});
