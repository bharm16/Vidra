import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import App from "@/App";

const { mockSetActiveTool } = vi.hoisted(() => ({
  mockSetActiveTool: vi.fn(),
}));

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
vi.mock("@/pages/HistoryPage", () => ({
  HistoryPage: () => <div>HistoryPage</div>,
}));

vi.mock("@/pages/NotFoundPage", () => ({
  NotFoundPage: () => <h1>NotFoundPage</h1>,
}));

describe("App routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    mockSetActiveTool.mockClear();
    vi.stubEnv("VITE_FEATURE_BILLING_UI", "true");
    vi.stubEnv("VITE_FEATURE_CONTINUITY_UI", "true");
    vi.stubEnv("VITE_FEATURE_CONVERGENCE_UI", "true");
    vi.stubEnv("VITE_FEATURE_SEQUENCE_EDITOR_UI", "true");
    vi.stubEnv("VITE_FEATURE_MODEL_INTELLIGENCE_UI", "true");
  });

  describe("error handling", () => {
    it("redirects /login to the sign-in page", async () => {
      window.history.pushState({}, "", "/login");
      render(<App />);

      expect(await screen.findByText("SignInPage")).toBeInTheDocument();
    });

    it("leaves the dormant /consistent route unregistered", async () => {
      window.history.pushState({}, "", "/consistent");
      render(<App />);

      expect(await screen.findByText("NotFoundPage")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("renders the shared clip page for share routes", async () => {
      window.history.pushState({}, "", "/share/123");
      render(<App />);

      expect(await screen.findByText("SharedClip")).toBeInTheDocument();
    });
  });

  it.each([
    "/pricing",
    "/settings/billing",
    "/settings/billing/invoices",
    "/billing",
    "/invoices",
    "/assets",
    "/continuity",
    "/continuity/session-1",
    "/session/new/continuity",
    "/session/session-1/continuity",
  ])(
    "keeps dormant route %s unregistered even with old feature flags supplied",
    async (path) => {
      window.history.pushState({}, "", path);
      render(<App />);
      expect(await screen.findByText("NotFoundPage")).toBeInTheDocument();
      expect(screen.queryByText("MainWorkspace")).not.toBeInTheDocument();
    },
  );

  describe("core behavior", () => {
    it("renders the main workspace on the root route", async () => {
      window.history.pushState({}, "", "/");
      render(<App />);

      expect(await screen.findByText("MainWorkspace")).toBeInTheDocument();
    });
  });
});
