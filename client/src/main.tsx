import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { createAppRouter } from "./router";
import { initSentry } from "./config/sentry";
import { initWebVitals } from "./config/webVitals";
import { waitForAuthReady } from "./services/http/firebaseAuth";
import "@promptstudio/system/index.css";
import "./index.css";

// Initialize Sentry before rendering (requires VITE_SENTRY_DSN env var)
initSentry();

// Collect Core Web Vitals (LCP, CLS, INP, FCP, TTFB) and report to Sentry
initWebVitals();

// Pre-warm Firebase auth state so the first API call doesn't block 0–3 s
waitForAuthReady();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const router = createAppRouter();
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App router={router} />
  </React.StrictMode>,
);
