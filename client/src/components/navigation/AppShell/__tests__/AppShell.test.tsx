import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "../AppShell";
import { useCreditBalance } from "@/contexts/CreditBalanceContext";
import type { IconComponent, NavItemsByVariant } from "../types";

const unsubscribeMock = vi.fn();
const onAuthStateChangedMock = vi.fn(() => unsubscribeMock);
const useNavigationConfigMock = vi.fn();
const useUserCreditBalanceMock = vi.hoisted(() => vi.fn());

vi.mock("@repositories/index", () => ({
  getAuthRepository: () => ({
    onAuthStateChanged: onAuthStateChangedMock,
  }),
}));

vi.mock("../hooks/useNavigationConfig", () => ({
  useNavigationConfig: () => useNavigationConfigMock(),
}));

vi.mock("@/hooks/useUserCreditBalance", () => ({
  useUserCreditBalance: (...args: unknown[]) =>
    useUserCreditBalanceMock(...args),
}));

vi.mock("../variants/TopNavbar", () => ({
  TopNavbar: (props: any) => (
    <div data-testid="top-navbar" data-items={props.navItems.length} />
  ),
}));

describe("AppShell", () => {
  const navItems: NavItemsByVariant = {
    topNav: [
      {
        to: "/pricing",
        label: "Pricing",
        icon: (() => null) as unknown as IconComponent,
        showInTopNav: true,
        showInSidebar: true,
      },
    ],
    sidebar: [
      {
        to: "/assets",
        label: "Assets",
        icon: (() => null) as unknown as IconComponent,
        showInTopNav: false,
        showInSidebar: true,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useUserCreditBalanceMock.mockReturnValue({
      balance: 42,
      isLoading: false,
      error: null,
    });
    useNavigationConfigMock.mockReturnValue({
      variant: "sidebar",
      navItems,
      currentPath: "/assets",
    });
  });

  const CreditProbe = () => {
    const { balance } = useCreditBalance();
    return <span data-testid="credit-probe">{balance ?? "none"}</span>;
  };

  describe("error handling", () => {
    it("cleans up auth subscription on unmount", () => {
      const { unmount } = render(<AppShell>Content</AppShell>);

      unmount();

      expect(onAuthStateChangedMock).toHaveBeenCalledTimes(1);
      expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge cases", () => {
    it("renders children without shell for auth routes", () => {
      useNavigationConfigMock.mockReturnValue({
        variant: "none",
        navItems,
        currentPath: "/signin",
      });

      render(<AppShell>Auth Content</AppShell>);

      expect(screen.getByText("Auth Content")).toBeInTheDocument();
      expect(screen.queryByTestId("top-navbar")).toBeNull();
    });
  });

  describe("core behavior", () => {
    it("renders top navigation variant with nav items", () => {
      useNavigationConfigMock.mockReturnValue({
        variant: "topnav",
        navItems,
        currentPath: "/pricing",
      });

      render(<AppShell>Marketing</AppShell>);

      expect(screen.getByTestId("top-navbar")).toBeInTheDocument();
      expect(screen.getByText("Marketing")).toBeInTheDocument();
    });

    it("renders workspace content in the sidebar variant (no tool rail — ADR-0010 D7)", () => {
      useNavigationConfigMock.mockReturnValue({
        variant: "sidebar",
        navItems,
        currentPath: "/assets",
      });

      render(<AppShell>Workspace</AppShell>);

      expect(screen.getByText("Workspace")).toBeInTheDocument();
      // The left tool rail was removed in D7; the sidebar variant is now just
      // the workspace content. Its chrome (Library + account) lives in the
      // page's WorkspaceTopBar, not here.
      expect(screen.queryByTestId("top-navbar")).toBeNull();
    });

    it("provides credit context to workspace children in the sidebar variant", () => {
      useNavigationConfigMock.mockReturnValue({
        variant: "sidebar",
        navItems,
        currentPath: "/assets",
      });

      render(
        <AppShell>
          <CreditProbe />
        </AppShell>,
      );

      expect(screen.getByTestId("credit-probe")).toHaveTextContent("42");
    });
  });
});
