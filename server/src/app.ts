/**
 * Express Application Factory
 *
 * Creates and configures the Express application with:
 * - Middleware stack
 * - Route registration
 * - Error handling
 *
 * This module is stateless and testable - it takes the DI container and
 * returns a configured Express app.
 */

import express, { type Application } from "express";
import type { DIContainer } from "@infrastructure/DIContainer";
import { configureMiddleware } from "./config/middleware.config.ts";
import { configureRoutes } from "./config/routes.config.ts";

/**
 * Create and configure the Express application
 */
export function createApp(container: DIContainer): Application {
  const app = express();

  // Trust proxy for correct client IPs behind Cloud Run/ALB/Ingress
  app.set("trust proxy", 1);

  // Configure middleware stack
  // Order matters: security, compression, rate limiting, CORS, parsing, logging
  configureMiddleware(app, {
    logger: container.resolve("logger"),
    redisClient: container.resolve("redisClient"),
  });

  // Register all routes and error handlers
  configureRoutes(app, container);

  return app;
}
