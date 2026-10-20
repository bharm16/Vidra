/**
 * Health Route Registration
 *
 * Registers the health endpoint and OpenAPI dev routes.
 * No auth required.
 */

import type { Application } from "express";
import { logger } from "@infrastructure/Logger";
import { createHealthRoutes } from "@routes/health.routes";
import { createOpenApiDevRoute } from "../../openapi/devRoute.ts";

export function registerHealthRoutes(app: Application): void {
  app.use("/", createHealthRoutes());

  // OpenAPI spec (dev only — returns null in production, not mounted)
  const openApiRoute = createOpenApiDevRoute();
  if (openApiRoute) {
    app.use("/api-docs", openApiRoute);
  }

  logger.debug("Health routes registered");
}
