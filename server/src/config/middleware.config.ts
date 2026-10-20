/**
 * Middleware Configuration
 *
 * Centralizes all Express middleware configuration.
 * This module defines the middleware stack in a clear, ordered manner.
 *
 * Middleware Order:
 * 1. Request ID (for tracing)
 * 2. Security (Helmet, CORS)
 * 3. Compression
 * 4. Rate limiting (costly routes)
 * 5. Body parsing
 * 6. Logging
 * 7. Metrics
 */

import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";

import { requestIdMiddleware } from "@middleware/requestId";
import { respond } from "@middleware/respond";
import { logger } from "@infrastructure/Logger";
import type { ILogger } from "@interfaces/ILogger";

/**
 * CORS configuration
 * Manages allowed origins based on environment
 */
const DEFAULT_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
] as const;

const parseConfiguredOrigins = (
  ...values: Array<string | undefined>
): string[] => {
  const deduped = new Set<string>();

  for (const value of values) {
    if (!value) continue;
    for (const origin of value.split(",")) {
      const normalized = origin.trim();
      if (!normalized) continue;
      deduped.add(normalized);
    }
  }

  return Array.from(deduped);
};

const resolveAllowedOrigins = (): string[] => {
  if (process.env.NODE_ENV === "production") {
    return parseConfiguredOrigins(
      process.env.ALLOWED_ORIGINS,
      process.env.FRONTEND_URL,
    );
  }

  return parseConfiguredOrigins(
    ...DEFAULT_DEV_ORIGINS,
    process.env.FRONTEND_URL,
    process.env.ALLOWED_ORIGINS,
  );
};

/**
 * Compression configuration
 */
const COMPRESSION_CONFIG: compression.CompressionOptions = {
  filter: (req: express.Request, res: express.Response): boolean => {
    if (req.headers["x-no-compression"]) return false;
    const accept = String(req.headers.accept ?? "");
    const url = String(req.originalUrl ?? req.url ?? "");
    const isStreamingEndpoint =
      accept.includes("text/event-stream") ||
      url.includes("/label-spans/stream");

    if (isStreamingEndpoint) return false;
    return compression.filter(req, res);
  },
  level: 6,
};

/**
 * Apply request ID middleware
 * Must be first to ensure all responses include X-Request-Id
 */
export function applyRequestIdMiddleware(app: Application): void {
  app.use(requestIdMiddleware);
}

/**
 * Apply security middleware (Helmet defaults)
 */
export function applySecurityMiddleware(app: Application): void {
  // The client runs on another origin (Firebase Hosting) and embeds media this
  // API serves — clip content, the storage proxy — in <img> and <video>, which
  // helmet's default `same-origin` resource policy would block.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
}

/**
 * Apply compression middleware
 */
export function applyCompressionMiddleware(app: Application): void {
  app.use(compression(COMPRESSION_CONFIG));
}

/**
 * Routes that spend provider money and have no daily spend cap of their own.
 * Studio, sketch frames and creation requests are bounded by
 * STUDIO_DAILY_SPEND_CAP_CENTS / SKETCH_DAILY_SPEND_CAP_CENTS instead.
 */
const COSTLY_ROUTES = [
  "/api/llm",
  "/api/optimize",
  "/api/optimize-compile",
  "/api/enhancement",
  "/api/preview/video/generate",
];

/** Requests per IP per minute, shared across every costly route. */
export const COSTLY_ROUTE_LIMIT = 120;

/**
 * Apply the costly-route rate limiter (in-memory, per instance).
 * Disabled in test environments
 */
export function applyRateLimitingMiddleware(app: Application): void {
  const isTestEnv =
    process.env.NODE_ENV === "test" ||
    !!process.env.VITEST_WORKER_ID ||
    !!process.env.VITEST;

  if (isTestEnv) {
    logger.info("Rate limiting disabled in test environment");
    return;
  }

  app.use(
    COSTLY_ROUTES,
    rateLimit({
      windowMs: 60 * 1000,
      limit: COSTLY_ROUTE_LIMIT,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res, _next, options) => {
        const retryAfter = res.getHeader("Retry-After");
        respond.fail(res, req, options.statusCode, {
          error: "Too many requests",
          code: "RATE_LIMITED",
          ...(retryAfter
            ? { details: `Retry after ${String(retryAfter)}s` }
            : {}),
        });
      },
    }),
  );
}

/**
 * Apply CORS middleware
 */
export function applyCorsMiddleware(app: Application): void {
  app.use(
    cors({
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ): void => {
        // Allow requests with no origin in development (testing tools)
        if (!origin && process.env.NODE_ENV !== "production") {
          return callback(null, true);
        }

        // Require origin header in production
        if (!origin && process.env.NODE_ENV === "production") {
          logger.warn("CORS blocked request with no origin in production");
          return callback(new Error("Origin header required"));
        }

        // Get allowed origins based on environment
        const allowedOrigins = resolveAllowedOrigins();

        // Validate CORS configuration in production
        if (
          process.env.NODE_ENV === "production" &&
          allowedOrigins.length === 0
        ) {
          logger.error(
            "ALLOWED_ORIGINS not configured for production",
            undefined,
            {
              ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
              FRONTEND_URL: process.env.FRONTEND_URL,
            },
          );
          return callback(
            new Error(
              "CORS configuration error: No allowed origins configured for production",
            ),
          );
        }

        // Check if origin is allowed
        if (origin && (allowedOrigins as readonly string[]).includes(origin)) {
          callback(null, true);
        } else {
          logger.warn("CORS blocked request from unauthorized origin", {
            origin,
            allowedOrigins,
          });
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-API-Key",
        "X-Firebase-Token",
      ],
      exposedHeaders: ["X-Request-Id"],
      maxAge: 86400, // 24 hours
      preflightContinue: false,
      optionsSuccessStatus: 204,
    }),
  );
}

/**
 * Apply body parser middleware
 */
export function applyBodyParserMiddleware(app: Application): void {
  const generalJson = express.json({ limit: "2mb" });
  app.use((req, res, next): void => {
    if (req.method === "POST" && /^\/api\/projects\/project_[A-Za-z0-9_-]+\/sketch\/captures\/?$/.test(req.path)) { next(); return; }
    generalJson(req, res, next);
  });
  app.use(express.urlencoded({ limit: "2mb", extended: true }));
  app.use(express.raw({ limit: "2mb" }));
  app.use(express.text({ limit: "2mb" }));
}

export interface MiddlewareServices {
  logger: ILogger;
}

/**
 * Apply request logging middleware
 * Requires services to be passed in
 */
export function applyLoggingMiddleware(
  app: Application,
  services: MiddlewareServices,
): void {
  app.use(
    (
      services.logger as unknown as {
        requestLogger: () => express.RequestHandler;
      }
    ).requestLogger(),
  );
}

/**
 * Configure all middleware in the correct order
 * This is the main function to call from app setup
 */
export function configureMiddleware(
  app: Application,
  services: MiddlewareServices,
): void {
  // 1. Request ID (must be first)
  applyRequestIdMiddleware(app);

  // 2. Security
  applySecurityMiddleware(app);

  // 3. Compression
  applyCompressionMiddleware(app);

  // 4. Rate limiting (costly routes only)
  applyRateLimitingMiddleware(app);

  // 5. CORS
  applyCorsMiddleware(app);

  // 6. Body parsers
  applyBodyParserMiddleware(app);

  // 7. Logging
  applyLoggingMiddleware(app, services);

  logger.info("All middleware configured successfully");
}
