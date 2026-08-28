import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "../AppShell";
import { useCreditBalance } from "@/contexts/CreditBalanceContext";

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
  TopNavbar: () => <div data-testid="top-navbar" />,
}));

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserCreditBalanceMock.mockReturnValue({
      balance: 42,
      isLoading: false,
      error: null,
    });
    useNavigationConfigMock.mockReturnValue({
      variant: "sidebar",
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
        currentPath: "/signin",
      });

      render(<AppShell>Auth Content</AppShell>);

      expect(screen.getByText("Auth Content")).toBeInTheDocument();
      expect(screen.queryByTestId("top-navbar")).toBeNull();
    });
  });

  describe("core behavior", () => {
    it("renders the top navigation variant", () => {
      useNavigationConfigMock.mockReturnValue({
        variant: "topnav",
        currentPath: "/pricing",
      });

      render(<AppShell>Marketing</AppShell>);

      expect(screen.getByTestId("top-navbar")).toBeInTheDocument();
      expect(screen.getByText("Marketing")).toBeInTheDocument();
    });

    it("renders workspace content in the sidebar variant (no tool rail — ADR-0010 D7)", () => {
      useNavigationConfigMock.mockReturnValue({
        variant: "sidebar",
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
