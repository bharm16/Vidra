import React, { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";
import { AppShell } from "@components/navigation/AppShell";
import {
  ErrorBoundary,
  FeatureErrorBoundary,
} from "./components/ErrorBoundary/";
import { ToastProvider } from "./components/Toast";
import { AppShellProvider } from "./contexts/AppShellContext";
import { LoadingDots } from "./components/LoadingDots";
import { GenerationControlsStoreProvider } from "@features/generation-controls";
import { AuthGateDialog } from "@features/auth-gate";
import { apiClient } from "./services/ApiClient";
import { trackPageView } from "./services/analytics";
import { FEATURES } from "./config/features.config";

const PricingPage = lazy(() =>
  import("./pages/PricingPage").then((module) => ({
    default: module.PricingPage,
  })),
);
const DocsPage = lazy(() =>
  import("./pages/DocsPage").then((module) => ({ default: module.DocsPage })),
);
const SignInPage = lazy(() =>
  import("./pages/SignInPage").then((module) => ({
    default: module.SignInPage,
  })),
);
const SignUpPage = lazy(() =>
  import("./pages/SignUpPage").then((module) => ({
    default: module.SignUpPage,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import("./pages/ForgotPasswordPage").then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const EmailVerificationPage = lazy(() =>
  import("./pages/EmailVerificationPage").then((module) => ({
    default: module.EmailVerificationPage,
  })),
);
const PasswordResetPage = lazy(() =>
  import("./pages/PasswordResetPage").then((module) => ({
    default: module.PasswordResetPage,
  })),
);
const AccountPage = lazy(() =>
  import("./pages/AccountPage").then((module) => ({
    default: module.AccountPage,
  })),
);
const PrivacyPolicyPage = lazy(() =>
  import("./pages/PrivacyPolicyPage").then((module) => ({
    default: module.PrivacyPolicyPage,
  })),
);
const TermsOfServicePage = lazy(() =>
  import("./pages/TermsOfServicePage").then((module) => ({
    default: module.TermsOfServicePage,
  })),
);
const ContactSupportPage = lazy(() =>
  import("./pages/ContactSupportPage").then((module) => ({
    default: module.ContactSupportPage,
  })),
);
const BillingPage = lazy(() =>
  import("./pages/BillingPage").then((module) => ({
    default: module.BillingPage,
  })),
);
const BillingInvoicesPage = lazy(() =>
  import("./pages/BillingInvoicesPage").then((module) => ({
    default: module.BillingInvoicesPage,
  })),
);
const HistoryPage = lazy(() =>
  import("./pages/HistoryPage").then((module) => ({
    default: module.HistoryPage,
  })),
);
const SharedClip = lazy(() => import("./features/share/SharedClip"));
const LiveEditor = lazy(() => import("./features/realtime-sketch/LiveEditor"));
const MainWorkspace = lazy(() =>
  import("./components/layout/MainWorkspace").then((module) => ({
    default: module.MainWorkspace,
  })),
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((module) => ({
    default: module.NotFoundPage,
  })),
);

function RouteFallback(): React.ReactElement {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <LoadingDots />
    </div>
  );
}

function MarketingFallback(): React.ReactElement {
  return (
    <div
      className="flex min-h-[200px] items-center justify-center"
      style={{ background: "#131416" }}
    >
      <LoadingDots />
    </div>
  );
}

function MarketingShell(): React.ReactElement {
  const location = useLocation();

  return (
    <AppShell>
      <div
        key={location.pathname}
        className="motion-presence-panel ps-animate-fade-in"
        data-motion-state="entered"
      >
        <Suspense fallback={<MarketingFallback />}>
          <Outlet />
        </Suspense>
      </div>
    </AppShell>
  );
}

function WorkspaceRoute(): React.ReactElement {
  return (
    <GenerationControlsStoreProvider>
      <FeatureErrorBoundary featureName="Main Workspace">
        <MainWorkspace />
      </FeatureErrorBoundary>
    </GenerationControlsStoreProvider>
  );
}

function PromptRedirect(): React.ReactElement {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (!uuid) {
        navigate("/", { replace: true });
        return;
      }
      try {
        const response = await apiClient.get(
          `/sessions/by-prompt/${encodeURIComponent(uuid)}`,
        );
        const data = (response as { data?: { id: string } }).data;
        if (!cancelled && data?.id) {
          navigate(`/session/${data.id}`, { replace: true });
          return;
        }
      } catch {
        // fall through
      }
      if (!cancelled) {
        navigate("/", { replace: true });
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [navigate, uuid]);

  return <RouteFallback />;
}

function RouteTracker(): React.ReactElement | null {
  const location = useLocation();
  useEffect(() => {
    void trackPageView(location.pathname);
  }, [location.pathname]);
  return null;
}

function AppRoutes(): React.ReactElement {
  return (
    <Routes>
      <Route element={<MarketingShell />}>
        {/* Marketing / company navigation. ADR-0010 site-scope (D9/D10): the
            input at "/" is the only front door — /home and /products redirect
            there; /pricing parks on "/" until the subscription rewrite. */}
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/products" element={<Navigate to="/" replace />} />
        {FEATURES.BILLING_UI ? (
          <Route path="/pricing" element={<PricingPage />} />
        ) : (
          <Route path="/pricing" element={<Navigate to="/" replace />} />
        )}
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/email-verification" element={<EmailVerificationPage />} />
        <Route path="/reset-password" element={<PasswordResetPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/login" element={<Navigate to="/signin" replace />} />
        <Route path="/register" element={<Navigate to="/signup" replace />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms-of-service" element={<TermsOfServicePage />} />
        <Route path="/contact" element={<ContactSupportPage />} />
        <Route path="/support" element={<Navigate to="/contact" replace />} />
        {FEATURES.BILLING_UI ? (
          <>
            <Route path="/settings/billing" element={<BillingPage />} />
            <Route
              path="/settings/billing/invoices"
              element={<BillingInvoicesPage />}
            />
            <Route
              path="/billing"
              element={<Navigate to="/settings/billing" replace />}
            />
          </>
        ) : (
          <>
            <Route
              path="/settings/billing"
              element={<Navigate to="/" replace />}
            />
            <Route
              path="/settings/billing/invoices"
              element={<Navigate to="/" replace />}
            />
            <Route path="/billing" element={<Navigate to="/" replace />} />
          </>
        )}
        <Route
          path="/share/:uuid"
          element={
            <FeatureErrorBoundary featureName="Shared Clip">
              <SharedClip />
            </FeatureErrorBoundary>
          }
        />
      </Route>

      {/* App routes */}
      <Route path="/" element={<WorkspaceRoute />} />
      {/* The Live editor (ADR-0017) — the realtime sketch's own rail surface
          on its own infinite plane, outside the page's anatomy. */}
      <Route
        path="/live-editor"
        element={
          <FeatureErrorBoundary featureName="Live Editor">
            <LiveEditor />
          </FeatureErrorBoundary>
        }
      />
      <Route path="/create" element={<Navigate to="/" replace />} />
      <Route path="/session/:sessionId" element={<WorkspaceRoute />} />
      <Route
        path="/session/:sessionId/studio"
        element={<Navigate to="/session/:sessionId" replace />}
      />
      <Route
        path="/session/:sessionId/create"
        element={<Navigate to="/session/:sessionId" replace />}
      />
      <Route
        path="/session/:sessionId/continuity"
        element={<Navigate to="/session/:sessionId" replace />}
      />
      <Route
        path="/session/new/continuity"
        element={<Navigate to="/" replace />}
      />
      {/* ADR-0010 site-scope D11: /assets parks on "/" while its consumption
          surfaces (Characters/Styles panels, reference images) are removed;
          the AssetsPage component is kept for un-parking if @-assets return. */}
      <Route path="/assets" element={<Navigate to="/" replace />} />
      <Route path="/continuity" element={<Navigate to="/" replace />} />
      <Route
        path="/continuity/:sessionId"
        element={<Navigate to="/session/:sessionId" replace />}
      />
      <Route path="/consistent" element={<Navigate to="/" replace />} />
      <Route path="/prompt/:uuid" element={<PromptRedirect />} />

      {/* Catch-all 404 — wrapped in MarketingShell for nav/footer */}
      <Route element={<MarketingShell />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

function App(): React.ReactElement {
  return (
    <ErrorBoundary
      title="Application Error"
      message="The application encountered an unexpected error. Please refresh the page to continue."
    >
      <ToastProvider>
        <AppShellProvider>
          <Router>
            <RouteTracker />
            <Suspense fallback={<RouteFallback />}>
              <AppRoutes />
            </Suspense>
            {/* Global auth gate: the single sign-in dialog opened by the 401
                handler and the pre-Go check. Overlays whatever page is
                mounted so the user's draft stays visible behind it. */}
            <AuthGateDialog />
          </Router>
        </AppShellProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
