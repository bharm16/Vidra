import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { createAppRouter } from "./router";
import { waitForAuthReady } from "./services/http/firebaseAuth";
import "@promptstudio/system/index.css";
import "./index.css";

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
