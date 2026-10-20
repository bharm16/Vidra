import express, { type Router } from "express";
import { createRouteTimeout } from "@middleware/routeTimeout";
import { logger } from "@infrastructure/Logger";

/**
 * Create health check routes
 * @returns {Router} Express router
 */
export function createHealthRoutes(): Router {
  const router = express.Router();
  const healthTimeout = createRouteTimeout(5_000);

  // GET /health - the process is up and serving requests
  router.get("/health", healthTimeout, (req, res) => {
    const requestId = req.id;
    logger.debug("Health check request", {
      operation: "health",
      requestId,
    });

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  return router;
}
