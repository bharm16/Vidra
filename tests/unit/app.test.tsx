import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import App from "@/App";
import { createAppRouter } from "@/router";
import { transferableAbortController } from "node:util";

const routers: ReturnType<typeof createAppRouter>[] = [];
function renderApp(): void { const router = createAppRouter(); routers.push(router); render(<App router={router} />); }

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

vi.mock("@/features/public-site/PublicPages", () => ({ LandingPage: () => <div>LandingPage</div>, ProductPage: () => <div>ProductPage</div>, PricingPage: () => <div>PricingPage</div> }));
vi.mock("@/features/workflow-sharing/WorkflowSharePage", () => ({ WorkflowSharePage: () => <div>WorkflowSharePage</div> }));
vi.mock("@/features/project-workspace/ProjectWorkspace", () => ({ default: () => <div>ProjectWorkspace</div> }));
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
    routers.splice(0).forEach(router => router.dispose());
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    // Node Request must receive a native signal rather than jsdom's AbortSignal.
    vi.stubGlobal("AbortController", function NativeAbortController() { return transferableAbortController(); });
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
      renderApp();

      expect(await screen.findByText("SignInPage")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("renders the shared clip page for share routes", async () => {
      window.history.pushState({}, "", "/share/123");
      renderApp();

      expect(await screen.findByText("SharedClip")).toBeInTheDocument();
    });
  });

  it("keeps new exact-version sharing separate from saved legacy links", async () => { window.history.pushState({}, "", "/share/media/123"); renderApp(); expect(await screen.findByText("WorkflowSharePage")).toBeInTheDocument(); });
  it("opens project authoring at /app", async () => { window.history.pushState({}, "", "/app"); renderApp(); expect(await screen.findByText("ProjectWorkspace")).toBeInTheDocument(); });

  describe("core behavior", () => {
    it("renders the retained public landing on the root route", async () => {
      window.history.pushState({}, "", "/");
      renderApp();

      expect(await screen.findByText("LandingPage")).toBeInTheDocument();
    });
  });
});
