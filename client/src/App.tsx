import React, { lazy, Suspense, useEffect } from "react";
import {
  RouterProvider,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { RequireAuth } from "@components/navigation/RequireAuth";
import {
  ErrorBoundary,
  FeatureErrorBoundary,
} from "./components/ErrorBoundary/";
import { ToastProvider } from "./components/Toast";
import { AuthGateDialog } from "@features/auth-gate";
import { trackPageView } from "./services/analytics";
import { SystemRoutePage } from "./features/public-site/SystemPage";
import { SiteShell } from "./features/public-site/SiteShell";

const LandingPage = lazy(() => import("./features/public-site/PublicPages").then(module => ({ default: module.LandingPage })));
const ProductPage = lazy(() => import("./features/public-site/PublicPages").then(module => ({ default: module.ProductPage })));
const PricingPage = lazy(() => import("./features/public-site/PublicPages").then(module => ({ default: module.PricingPage })));

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

const SharedClip = lazy(() => import("./features/share/SharedClip"));
const WorkflowSharePage = lazy(() => import("./features/workflow-sharing/WorkflowSharePage").then(module => ({ default: module.WorkflowSharePage })));
const LiveEditor = lazy(() => import("./features/realtime-sketch/LiveEditor"));
const StudioPage = lazy(() => import("./features/studio/StudioPage"));
const StudioIndexPage = lazy(() => import("./features/studio/StudioIndexPage"));
const ProjectWorkspace = lazy(() => import("./features/project-workspace/ProjectWorkspace"));
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((module) => ({
    default: module.NotFoundPage,
  })),
);

function RouteFallback(): React.ReactElement { return <SystemRoutePage state="loading" />; }

function RouteContent(): React.ReactElement {
  return <ErrorBoundary fallback={({ resetError }) => <SystemRoutePage state={navigator.onLine ? "load-error" : "offline"} onRetry={resetError} />}><Suspense fallback={<RouteFallback />}><AppRoutes /></Suspense></ErrorBoundary>;
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
        <Route path="/app" element={<Suspense fallback={<RouteFallback />}><ProjectWorkspace /></Suspense>} />
        <Route path="/app/projects" element={<Suspense fallback={<RouteFallback />}><ProjectWorkspace /></Suspense>} />
        <Route path="/app/project/:projectId" element={<Suspense fallback={<RouteFallback />}><ProjectWorkspace /></Suspense>} />

        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/product/:product" element={<SiteShell><ProductPage /></SiteShell>} />
        <Route path="/products/:product" element={<SiteShell><ProductPage /></SiteShell>} />
        <Route path="/pricing" element={<SiteShell><PricingPage /></SiteShell>} />
        <Route path="/products" element={<Navigate to="/" replace />} />
        <Route path="/docs/*" element={<DocsPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/email-verification" element={<EmailVerificationPage />} />
        <Route path="/reset-password" element={<PasswordResetPage />} />
        <Route path="/login" element={<Navigate to="/signin" replace />} />
        <Route path="/register" element={<Navigate to="/signup" replace />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms-of-service" element={<TermsOfServicePage />} />
        <Route path="/contact" element={<ContactSupportPage />} />
        <Route path="/support" element={<Navigate to="/contact" replace />} />

        <Route
          path="/share/:uuid"
          element={
            <FeatureErrorBoundary featureName="Shared Clip">
              <SharedClip />
            </FeatureErrorBoundary>
          }
        />

      <Route path="/share/media/:id" element={<WorkflowSharePage />} />
      <Route path="/legacy/share/:uuid" element={<SharedClip />} />
      {/* App routes */}
      <Route path="/" element={<SiteShell><LandingPage /></SiteShell>} />
      {/* The Live editor (ADR-0017) — the realtime sketch's own rail surface
          on its own infinite plane, outside the page's anatomy. */}
      <Route
        path="/live-editor"
        element={
          <RequireAuth>
            <FeatureErrorBoundary featureName="Live Editor">
              <LiveEditor />
            </FeatureErrorBoundary>
          </RequireAuth>
        }
      />
      {/* The studio (ADR-0019) — conversational image generation and editing
          on its own rail surface and plane. The rail destination is the
          project index; a workspace is always addressed by its project, so
          reload, Back and a pasted link all return the same thread.
          "/studio/new" is a literal segment and outranks ":projectId". */}
      <Route
        path="/studio"
        element={
          <RequireAuth>
            <FeatureErrorBoundary featureName="Studio">
              <StudioIndexPage />
            </FeatureErrorBoundary>
          </RequireAuth>
        }
      />
      <Route
        path="/studio/new"
        element={
          <RequireAuth>
            <FeatureErrorBoundary featureName="Studio">
              <StudioPage />
            </FeatureErrorBoundary>
          </RequireAuth>
        }
      />
      <Route
        path="/studio/:projectId"
        element={
          <RequireAuth>
            <FeatureErrorBoundary featureName="Studio">
              <StudioPage />
            </FeatureErrorBoundary>
          </RequireAuth>
        }
      />
      {/* Rail surfaces — every app page carries the left rail itself, so
          these live outside MarketingShell's topnav chrome. */}
      <Route path="/history" element={<Navigate to="/app" replace />} />
      <Route
        path="/account"
        element={
          <RequireAuth>
            <AccountPage />
          </RequireAuth>
        }
      />
      <Route path="/create" element={<Navigate to="/app?intent=make-image" replace />} />
      {/* The legacy session workspace is retired; its saved links open /app. */}
      <Route path="/session/*" element={<Navigate to="/app" replace />} />
      <Route path="/prompt/:uuid" element={<Navigate to="/app" replace />} />


        <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function AppNavigation(): React.ReactElement {
  return <><RouteTracker /><RouteContent /><AuthGateDialog /></>;
}

function App({ router }: { router: React.ComponentProps<typeof RouterProvider>["router"] }): React.ReactElement {
  return (
    <ErrorBoundary
      title="Application Error"
      message="The application encountered an unexpected error. Please refresh the page to continue."
    >
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
