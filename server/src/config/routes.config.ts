/**
 * Route Configuration
 *
 * Orchestrates route registration by delegating to domain-scoped modules.
 * Each domain module resolves only the services it needs.
 *
 * Registration order:
 * 1. Health (no auth)
 * 2. Firestore write gate (middleware)
 * 3. Motion / convergence media
 * 4. Core API, LLM, role classify, suggestions (auth required)
 * 5. Preview / generation
 * 6. Payment (auth required)
 * 7. 404 fallthrough
 * 8. Error handlers
 */

import type { Application, Request, Response } from "express";
import type { DIContainer } from "@infrastructure/DIContainer";
import { errorHandler } from "@middleware/errorHandler";
import { respond } from "@middleware/respond";
import { createFirestoreWriteGateMiddleware } from "@middleware/firestoreWriteGate";
import { registerHealthRoutes } from "./routes/health.registration.ts";
import { registerApiRoutes } from "./routes/api.registration.ts";
import { registerPreviewRoutes } from "./routes/preview.registration.ts";

function registerRoutes(app: Application, container: DIContainer): void {
  const firestoreCircuitExecutor = container.resolve(
    "firestoreCircuitExecutor",
  );

  // 1. Health routes (no auth)
  registerHealthRoutes(app, container);

  // 2. Firestore write gate: fail-closed for all mutating /api routes
  app.use("/api", createFirestoreWriteGateMiddleware(firestoreCircuitExecutor));

  // 4. Core API, LLM endpoints, suggestions
  registerApiRoutes(app, container);

  // 5. Preview / generation
  registerPreviewRoutes(app, container);

  // 7. 404 Handler (must be registered AFTER all routes).
  // The unmatched path travels in `details` — the canonical envelope has no
  // `path` field, and no client reads one.
  app.use((req: Request, res: Response): void => {
    respond.fail(res, req, 404, {
      error: "Not found",
      code: "INVALID_REQUEST",
      details: req.path,
    });
  });
}

/**
 * Register error handlers
 * Must be called AFTER all routes are registered
 */
export function registerErrorHandlers(app: Application): void {
  app.use(errorHandler);
}

/**
 * Configure all routes and error handlers
 * This is the main function to call from app setup
 */
export function configureRoutes(
  app: Application,
  container: DIContainer,
): void {
  registerRoutes(app, container);
  registerErrorHandlers(app);
}
