import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import App from "@/App";

const { mockSetActiveTool } = vi.hoisted(() => ({
  mockSetActiveTool: vi.fn(),
}));

vi.mock("@/config/features.config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/config/features.config")>();
  return {
    ...actual,
    FEATURES: { ...actual.FEATURES, BILLING_UI: true },
  };
});

vi.mock("@components/navigation/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  FeatureErrorBoundary: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/features/share/SharedClip", () => ({
  default: () => <div>SharedClip</div>,
}));

vi.mock("@/components/Toast", () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/contexts/AppShellContext", () => ({
  AppShellProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  useAppShell: () => ({
    setActiveTool: mockSetActiveTool,
  }),
}));

vi.mock("@/components/layout/MainWorkspace", () => ({
  MainWorkspace: () => <div>MainWorkspace</div>,
}));

vi.mock("@/pages/HomePage", () => ({ HomePage: () => <div>HomePage</div> }));
vi.mock("@/pages/ProductsPage", () => ({
  ProductsPage: () => <div>ProductsPage</div>,
}));
vi.mock("@/pages/PricingPage", () => ({
  PricingPage: () => <div>PricingPage</div>,
}));
vi.mock("@/pages/DocsPage", () => ({ DocsPage: () => <div>DocsPage</div> }));
vi.mock("@/pages/SignInPage", () => ({
  SignInPage: () => <div>SignInPage</div>,
}));
vi.mock("@/pages/SignUpPage", () => ({
  SignUpPage: () => <div>SignUpPage</div>,
}));
vi.mock("@/pages/ForgotPasswordPage", () => ({
  ForgotPasswordPage: () => <div>ForgotPasswordPage</div>,
}));
vi.mock("@/pages/EmailVerificationPage", () => ({
  EmailVerificationPage: () => <div>EmailVerificationPage</div>,
}));
vi.mock("@/pages/PasswordResetPage", () => ({
  PasswordResetPage: () => <div>PasswordResetPage</div>,
}));
vi.mock("@/pages/AccountPage", () => ({
  AccountPage: () => <div>AccountPage</div>,
}));
vi.mock("@/pages/PrivacyPolicyPage", () => ({
  PrivacyPolicyPage: () => <div>PrivacyPolicyPage</div>,
}));
vi.mock("@/pages/TermsOfServicePage", () => ({
  TermsOfServicePage: () => <div>TermsOfServicePage</div>,
}));
vi.mock("@/pages/ContactSupportPage", () => ({
  ContactSupportPage: () => <div>ContactSupportPage</div>,
}));
vi.mock("@/pages/BillingPage", () => ({
  BillingPage: () => <div>BillingPage</div>,
}));
vi.mock("@/pages/BillingInvoicesPage", () => ({
  BillingInvoicesPage: () => <div>BillingInvoicesPage</div>,
}));
vi.mock("@/pages/HistoryPage", () => ({
  HistoryPage: () => <div>HistoryPage</div>,
}));
vi.mock("@/pages/AssetsPage", () => ({
  AssetsPage: () => <div>AssetsPage</div>,
}));

describe("App routes", () => {
  beforeEach(() => {
    mockSetActiveTool.mockClear();
  });

  describe("error handling", () => {
    it("redirects /login to the sign-in page", async () => {
      window.history.pushState({}, "", "/login");
      render(<App />);

      expect(await screen.findByText("SignInPage")).toBeInTheDocument();
    });

    it("redirects /consistent to the main workspace", async () => {
      window.history.pushState({}, "", "/consistent");
      render(<App />);

      expect(await screen.findByText("MainWorkspace")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("renders the shared clip page for share routes", async () => {
      window.history.pushState({}, "", "/share/123");
      render(<App />);

      expect(await screen.findByText("SharedClip")).toBeInTheDocument();
    });

    it("renders nested billing invoices routes", async () => {
      window.history.pushState({}, "", "/settings/billing/invoices");
      render(<App />);

      expect(
        await screen.findByText("BillingInvoicesPage"),
      ).toBeInTheDocument();
    });
  });

  describe("core behavior", () => {
    it("renders the main workspace on the root route", async () => {
      window.history.pushState({}, "", "/");
      render(<App />);

      expect(await screen.findByText("MainWorkspace")).toBeInTheDocument();
    });
  });
});
