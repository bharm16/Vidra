/**
 * Middleware Configuration
 *
 * Centralizes all Express middleware configuration.
 * This module defines the middleware stack in a clear, ordered manner.
 *
 * Middleware Order:
 * 1. Request ID (for tracing)
 * 2. Security (Helmet, CORS, headers)
 * 3. Compression
 * 4. Rate limiting
 * 5. Body parsing
 * 6. Logging
 * 7. Metrics
 */

import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit, {
  type RateLimitRequestHandler,
  type Store,
} from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type Redis from "ioredis";
import compression from "compression";

import { requestIdMiddleware } from "@middleware/requestId";
import { telemetrySourceMiddleware } from "@middleware/telemetrySource";
import {
  createFailClosedLlmRateLimit,
  setRedisRateLimitHealth,
} from "@middleware/rateLimitHealth";
import { logger } from "@infrastructure/Logger";
import type { ILogger } from "@interfaces/ILogger";

interface RateLimitConfig {
  general: {
    windowMs: number;
    dev: number;
    prod: number;
  };
  api: {
    windowMs: number;
    dev: number;
    prod: number;
  };
  llm: {
    windowMs: number;
    dev: number;
    prod: number;
  };
  health: {
    windowMs: number;
    max: number;
  };
  videoValidate: {
    burst: { windowMs: number; max: number };
    minute: { windowMs: number; max: number };
  };
  videoSuggestions: {
    burst: { windowMs: number; max: number };
    minute: { windowMs: number; max: number };
  };
}

/**
 * Rate limiting configuration
 * Extracted for clarity and maintainability
 */
const RATE_LIMIT_CONFIG: RateLimitConfig = {
  // General rate limits
  general: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    dev: 500,
    prod: 100,
  },
  // API endpoint rate limits
  api: {
    windowMs: 60 * 1000, // 1 minute
    dev: 300,
    prod: 60,
  },
  // LLM endpoint rate limits (higher for span labeling)
  llm: {
    windowMs: 60 * 1000,
    dev: 400,
    prod: 100,
  },
  // Health check rate limits
  health: {
    windowMs: 60 * 1000,
    max: 60,
  },
  // Route-specific burst limits
  videoValidate: {
    burst: { windowMs: 2 * 1000, max: 3 },
    minute: { windowMs: 60 * 1000, max: 30 },
  },
  videoSuggestions: {
    burst: { windowMs: 3 * 1000, max: 2 },
    minute: { windowMs: 60 * 1000, max: 20 },
  },
};

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
 * Security headers configuration
 */
const SECURITY_CONFIG = {
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "https://api.openai.com",
          "https://*.firebaseapp.com",
          "https://*.googleapis.com",
          "https://*.google.com",
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },
    permittedCrossDomainPolicies: {
      permittedPolicies: "none",
    },
  },
  additionalHeaders: {
    "X-Permitted-Cross-Domain-Policies": "none",
    "Cross-Origin-Resource-Policy": "cross-origin",
  },
  productionHeaders: {
    // `credentialless` allows cross-origin resources (like signed GCS URLs for
    // preview media) that don't carry credentials to load without requiring
    // Cross-Origin-Resource-Policy headers. The stricter `require-corp` was
    // blocking preview images because GCS doesn't set CORP headers on signed URLs.
    "Cross-Origin-Embedder-Policy": "credentialless",
    "Cross-Origin-Opener-Policy": "same-origin",
  },
} as const;

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
  app.use(telemetrySourceMiddleware);
}

/**
 * Apply security middleware (Helmet + custom headers)
 */
export function applySecurityMiddleware(app: Application): void {
  // Helmet with CSP and other security headers
  app.use(helmet(SECURITY_CONFIG.helmet));

  // Additional security headers
  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ): void => {
      // Set additional headers
      Object.entries(SECURITY_CONFIG.additionalHeaders).forEach(
        ([key, value]) => {
          res.setHeader(key, value);
        },
      );

      // Production-only headers
      if (process.env.NODE_ENV === "production") {
        Object.entries(SECURITY_CONFIG.productionHeaders).forEach(
          ([key, value]) => {
            res.setHeader(key, value);
          },
        );
      }

      next();
    },
  );
}

/**
 * Apply compression middleware
 */
export function applyCompressionMiddleware(app: Application): void {
  app.use(compression(COMPRESSION_CONFIG));
}

/**
 * Divisor applied to rate limits when Redis is unavailable.
 * In-memory stores are per-process, so the effective limit in a multi-instance
 * deployment is (configured limit * instance count). Dividing by this factor
 * makes in-memory fallback conservative.
 */
export const FALLBACK_LIMIT_DIVISOR = 4;

/**
 * Subscribe the rate-limit health flag to a Redis client's connection
 * lifecycle: `ready` flips it healthy; `error`/`end`/`close` flip it
 * unhealthy. Shared by the distributed-store and fallback paths, which
 * previously wired these four listeners inline and identically.
 */
const subscribeRedisRateLimitHealthEvents = (client: Redis): void => {
  client.on("ready", () => setRedisRateLimitHealth(true));
  client.on("error", () => setRedisRateLimitHealth(false));
  client.on("end", () => setRedisRateLimitHealth(false));
  client.on("close", () => setRedisRateLimitHealth(false));
};

/**
 * Apply rate limiting middleware
 * Disabled in test environments
 */
export function applyRateLimitingMiddleware(
  app: Application,
  redisClient?: Redis | null,
): void {
  const isTestEnv =
    process.env.NODE_ENV === "test" ||
    !!process.env.VITEST_WORKER_ID ||
    !!process.env.VITEST;

  if (isTestEnv) {
    logger.info("Rate limiting disabled in test environment");
    return;
  }

  // Only use Redis for rate limiting when the connection is actually ready.
  // With lazyConnect, the client may exist but not yet be connected — sending
  // commands in that state (with enableOfflineQueue: false) causes unhandled
  // promise rejections from the RedisStore constructor.
  const redisReady = redisClient && redisClient.status === "ready";

  const storeFactory = redisReady
    ? (prefix: string): Store =>
        new RedisStore({
          sendCommand: (...args: string[]) => {
            const [cmd = "", ...rest] = args;
            return redisClient.call(cmd, ...rest) as never;
          },
          prefix: `rl:${prefix}:`,
        })
    : undefined;

  const usingFallback = !storeFactory;

  if (storeFactory) {
    logger.info("Rate limiting using Redis store (distributed)");
    // Seed the health flag — Redis is ready now. Subscribe to client events
    // to flip the flag on connection loss / recovery. LLM routes fail closed
    // when unhealthy; non-LLM routes are allowed to degrade to in-memory.
    setRedisRateLimitHealth(true);
    if (redisClient) {
      subscribeRedisRateLimitHealthEvents(redisClient);
    }
  } else {
    logger.warn(
      "Rate limiting using in-memory store (single-instance) — limits reduced",
      {
        divisor: FALLBACK_LIMIT_DIVISOR,
      },
    );
    // In production we fail closed on LLM routes when Redis was configured
    // but is down. When Redis was NEVER configured (no client at all),
    // honor the legacy in-memory fallback so dev and single-instance
    // deployments keep working — but only outside production.
    if (redisClient || process.env.NODE_ENV === "production") {
      setRedisRateLimitHealth(false);
      // Subscribe to recovery events so the health flag flips back if the
      // client reconnects later.
      if (redisClient) {
        subscribeRedisRateLimitHealthEvents(redisClient);
      }
    }
  }

  const isDevEnv = process.env.NODE_ENV !== "production" && !isTestEnv;

  const applyFallback = (limit: number): number =>
    usingFallback
      ? Math.max(1, Math.floor(limit / FALLBACK_LIMIT_DIVISOR))
      : limit;

  const generalMax = applyFallback(
    isDevEnv ? RATE_LIMIT_CONFIG.general.dev : RATE_LIMIT_CONFIG.general.prod,
  );
  const apiMax = applyFallback(
    isDevEnv ? RATE_LIMIT_CONFIG.api.dev : RATE_LIMIT_CONFIG.api.prod,
  );
  const llmMax = applyFallback(
    isDevEnv ? RATE_LIMIT_CONFIG.llm.dev : RATE_LIMIT_CONFIG.llm.prod,
  );

  // Two handlers exist because the limiters run in different contexts:
  //
  // - `mountedLimiterJSONHandler` is used by limiters mounted at a specific
  //   path prefix (`app.use("/api/", limiter)`, `/api/llm/`, burst limiters).
  //   Express's route mount guarantees the request matches that prefix, so
  //   the handler returns the ApiErrorResponse JSON shape unconditionally.
  //
  // - `globalLimiterHandler` is used by the application-wide general limiter
  //   that runs on every request. It dispatches: /api/ requests that slip
  //   through (because the dedicated limiter's `skip()` was evaluated after
  //   the general one already ran) get the JSON shape so the client can parse
  //   it; everything else (static pages, etc.) gets plain text.
  //
  // The two handlers are not duplication — they encode the mounted-vs-global
  // distinction. Do not collapse them into a single path-checking handler:
  // for mounted limiters, the path check would be provably-always-true.
  const mountedLimiterJSONHandler = (
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
    options: { statusCode: number; message: string },
  ): void => {
    const retryAfter = res.getHeader("Retry-After");
    res.status(options.statusCode).json({
      error: options.message,
      code: "RATE_LIMITED",
      details: retryAfter ? `Retry after ${String(retryAfter)}s` : undefined,
      requestId: (req as express.Request & { id?: string }).id,
    });
  };

  const globalLimiterHandler = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
    options: { statusCode: number; message: string },
  ): void => {
    const requestPath = req.originalUrl || req.path;
    if (requestPath.startsWith("/api/")) {
      mountedLimiterJSONHandler(req, res, next, options);
      return;
    }

    res.status(options.statusCode).send(options.message);
  };

  // Routes with dedicated limiters (/api/, /health) are skipped from
  // the general limiter to prevent double-counting. Previously only asset-view
  // routes were skipped, causing the 15-minute general budget (100 req in prod,
  // 25 without Redis) to be exhausted by normal API traffic, which then blocked
  // all routes including static assets and unrelated pages.
  const isGeneralSkipped = (req: express.Request): boolean => {
    const p = req.path;
    return p.startsWith("/api/") || p.startsWith("/health");
  };

  // General limiter (all routes)
  const generalLimiter = rateLimit({
    windowMs: RATE_LIMIT_CONFIG.general.windowMs,
    max: generalMax,
    message: "Too many requests from this IP",
    standardHeaders: true,
    legacyHeaders: false,
    handler: globalLimiterHandler,
    skip: isGeneralSkipped,
    ...(storeFactory ? { store: storeFactory("general") } : {}),
  });
  app.use(generalLimiter);

  // API-specific limiter
  // Asset view endpoints and session hydration endpoints are read-only and get
  // hammered during page loads. They have their own dedicated limiter below.
  const isAssetViewRoute = (req: express.Request): boolean => {
    const p = req.path;
    return (
      p === "/preview/image/view" ||
      p === "/preview/image/view-batch" ||
      p === "/preview/video/view" ||
      p === "/storage/view-url"
    );
  };

  // Session hydration fires multiple parallel reads (session, versions, payment
  // status) during page load and enhance flows. These read-only, idempotent
  // endpoints are exempt from the main API limiter to prevent 429s during
  // normal workspace transitions.
  const isSessionHydrationRoute = (req: express.Request): boolean => {
    if (req.method !== "GET") return false;
    const p = req.path;
    return (
      p === "/payment/status" ||
      /^\/v2\/sessions\/[^/]+$/.test(p) ||
      /^\/v2\/sessions\/[^/]+\/versions$/.test(p)
    );
  };

  app.use(
    "/api/",
    rateLimit({
      windowMs: RATE_LIMIT_CONFIG.api.windowMs,
      max: apiMax,
      message: "Global rate limit exceeded",
      standardHeaders: true,
      legacyHeaders: false,
      handler: mountedLimiterJSONHandler,
      skip: (req: express.Request) =>
        isAssetViewRoute(req) || isSessionHydrationRoute(req),
      ...(storeFactory ? { store: storeFactory("api") } : {}),
    }),
  );

  // Dedicated limiter for asset view endpoints (read-only, idempotent).
  // Much higher limit since pages with many generations fire dozens of these.
  const assetViewMax = applyFallback(isDevEnv ? 1000 : 300);
  app.use(
    "/api/",
    rateLimit({
      windowMs: 60 * 1000,
      max: assetViewMax,
      message: "Asset view rate limit exceeded",
      standardHeaders: true,
      legacyHeaders: false,
      handler: mountedLimiterJSONHandler,
      skip: (req: express.Request) => !isAssetViewRoute(req),
      ...(storeFactory ? { store: storeFactory("asset-view") } : {}),
    }),
  );

  // LLM endpoints: fail-closed when Redis store is unhealthy.
  // Unlike general/api/asset-view routes (safe to degrade to per-instance
  // in-memory limits under the 4x divisor), LLM routes are expensive enough
  // that unlimited traffic is a cost/abuse risk — so we return 503 instead
  // of silently allowing N × (limit/4) per-instance through an autoscaler.
  app.use("/api/llm/", createFailClosedLlmRateLimit());

  // LLM endpoints limiter (higher limits for span labeling)
  app.use(
    "/api/llm/",
    rateLimit({
      windowMs: RATE_LIMIT_CONFIG.llm.windowMs,
      max: llmMax,
      message: "Too many LLM requests",
      standardHeaders: true,
      legacyHeaders: false,
      handler: mountedLimiterJSONHandler,
      ...(storeFactory ? { store: storeFactory("llm") } : {}),
    }),
  );

  // Route-specific burst limiters
  let burstLimiterIndex = 0;
  const makeBurstLimiter = (
    windowMs: number,
    max: number,
    message: string,
  ): RateLimitRequestHandler =>
    rateLimit({
      windowMs,
      max,
      message,
      standardHeaders: true,
      legacyHeaders: false,
      handler: mountedLimiterJSONHandler,
      ...(storeFactory
        ? { store: storeFactory(`burst${burstLimiterIndex++}`) }
        : {}),
    });

  // Video validation endpoint burst limits
  app.use(
    "/api/video/validate",
    makeBurstLimiter(
      RATE_LIMIT_CONFIG.videoValidate.burst.windowMs,
      RATE_LIMIT_CONFIG.videoValidate.burst.max,
      "Too many compatibility checks in a short time",
    ),
    makeBurstLimiter(
      RATE_LIMIT_CONFIG.videoValidate.minute.windowMs,
      RATE_LIMIT_CONFIG.videoValidate.minute.max,
      "Too many compatibility checks per minute",
    ),
  );

  // Video suggestions endpoint burst limits
  app.use(
    "/api/video/suggestions",
    makeBurstLimiter(
      RATE_LIMIT_CONFIG.videoSuggestions.burst.windowMs,
      RATE_LIMIT_CONFIG.videoSuggestions.burst.max,
      "Too many suggestion requests in a short time",
    ),
    makeBurstLimiter(
      RATE_LIMIT_CONFIG.videoSuggestions.minute.windowMs,
      RATE_LIMIT_CONFIG.videoSuggestions.minute.max,
      "Too many suggestion requests per minute",
    ),
  );

  // Health check limiter
  app.use(
    ["/health", "/health/ready", "/health/live"],
    rateLimit({
      windowMs: RATE_LIMIT_CONFIG.health.windowMs,
      max: RATE_LIMIT_CONFIG.health.max,
      message: "Too many health check requests, please slow down",
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  logger.info("Rate limiting enabled", {
    environment: isDevEnv ? "development" : "production",
    generalMax,
    apiMax,
    llmMax,
  });
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
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-API-Key",
        "X-Firebase-Token",
        "X-Telemetry-Source",
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
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));
  app.use(express.raw({ limit: "2mb" }));
  app.use(express.text({ limit: "2mb" }));
}

export interface MiddlewareServices {
  logger: ILogger;
  redisClient?: Redis | null;
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

  // 4. Rate limiting (uses Redis store when available for distributed enforcement)
  applyRateLimitingMiddleware(app, services.redisClient);

  // 5. CORS
  applyCorsMiddleware(app);

  // 6. Body parsers
  applyBodyParserMiddleware(app);

  // 7. Logging
  applyLoggingMiddleware(app, services);

  logger.info("All middleware configured successfully");
}
