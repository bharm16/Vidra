/**
 * OpenAPI 3.0.3 Specification Builder
 *
 * Builds the Vidra API specification programmatically from Zod schemas.
 * Uses Zod v4's native `z.toJSONSchema()` with `target: 'openapi-3.0'` to
 * convert validation schemas into OpenAPI-compatible JSON Schema objects.
 *
 * ## How to extend
 *
 * 1. Import the Zod schema for your request/response.
 * 2. Convert with `zodToOpenApi(MySchema)`.
 * 3. Add the path definition to `buildPaths()`.
 * 4. Run `npm run openapi:generate` to regenerate `docs/openapi.json`.
 *
 * ## Design decisions
 *
 * - **No runtime dependency**: spec is generated at build time, not served by
 *   the application. A lightweight dev-only route exposes it during development.
 * - **Zod as source of truth**: request schemas come directly from
 *   `server/src/config/schemas/` and response schemas from `shared/schemas/`.
 * - **Incremental adoption**: only documented endpoints appear in the spec.
 *   Undocumented routes still work — they just aren't in the spec yet.
 */

import { z } from "zod";

import {
  promptSchema,
  compileSchema,
} from "../config/schemas/promptSchemas.ts";
import {
  ApiErrorCodeSchema,
  ApiErrorResponseSchema,
} from "#shared/schemas/api.schemas";
import { API_ERROR_CODES } from "#shared/types/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

/**
 * Convert a Zod schema to an OpenAPI 3.0-compatible JSON Schema object.
 * Strips the `$schema` draft identifier since OpenAPI embeds schemas inline.
 */
function zodToOpenApi(schema: z.ZodType): JsonSchema {
  const raw = z.toJSONSchema(schema, { target: "openapi-3.0" }) as JsonSchema;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...rest } = raw;
  return rest;
}

// ---------------------------------------------------------------------------
// Component Schemas
// ---------------------------------------------------------------------------

function buildComponentSchemas(): Record<string, JsonSchema> {
  return {
    // -- Shared error contract --
    ApiErrorCode: {
      type: "string",
      enum: [...API_ERROR_CODES],
      description:
        "Machine-readable error code. Adding a code is safe; removing one is a breaking change.",
    },

    ApiErrorResponse: zodToOpenApi(ApiErrorResponseSchema),

    ApiSuccessResponse: {
      type: "object",
      required: ["success", "data"],
      properties: {
        success: { type: "boolean", enum: [true] },
        data: { description: "Endpoint-specific payload." },
        requestId: {
          type: "string",
          description: "Correlation ID from X-Request-Id header.",
        },
      },
    },

    // -- Health --
    HealthResponse: {
      type: "object",
      required: ["status", "timestamp"],
      properties: {
        status: { type: "string", enum: ["healthy"] },
        timestamp: { type: "string", format: "date-time" },
        uptime: { type: "number", description: "Server uptime in seconds." },
      },
    },

    LivenessResponse: {
      type: "object",
      required: ["status", "timestamp"],
      properties: {
        status: { type: "string", enum: ["alive"] },
        timestamp: { type: "string", format: "date-time" },
      },
    },

    ReadinessResponse: {
      type: "object",
      required: ["status", "timestamp", "dependencies"],
      properties: {
        status: { type: "string", enum: ["ready", "unhealthy"] },
        timestamp: { type: "string", format: "date-time" },
        dependencies: {
          type: "object",
          description:
            "Dependency health checks (firebase, gcs, cache, redis, LLM providers).",
          additionalProperties: {
            type: "object",
            required: ["required", "healthy"],
            properties: {
              required: { type: "boolean" },
              healthy: { type: "boolean" },
              lastChecked: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              error: { type: "string" },
            },
          },
        },
        workers: {
          type: "object",
          description:
            "Background worker statuses (informational, does not gate readiness).",
          additionalProperties: {
            type: "object",
            properties: {
              running: { type: "boolean" },
              lastRunAt: {
                type: "string",
                format: "date-time",
                nullable: true,
              },
              consecutiveFailures: { type: "integer" },
            },
          },
        },
      },
    },

    // -- Request schemas (from Zod) --
    PromptOptimizeRequest: zodToOpenApi(promptSchema),
    PromptCompileRequest: zodToOpenApi(compileSchema),

    // -- Rate limit --
    RateLimitResponse: {
      type: "object",
      required: ["error", "code"],
      properties: {
        error: { type: "string", example: "Too many requests from this IP" },
        code: { type: "string", enum: ["RATE_LIMITED"] },
        details: { type: "string", example: "Retry after 60s" },
        requestId: { type: "string" },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Security Schemes
// ---------------------------------------------------------------------------

function buildSecuritySchemes(): Record<string, unknown> {
  return {
    ApiKeyAuth: {
      type: "apiKey",
      in: "header",
      name: "X-API-Key",
      description: "API key required for all /api/* endpoints.",
    },
    FirebaseAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description:
        "Firebase ID token for credit-gated endpoints (preview, payment). " +
        "Passed via Authorization header or X-Firebase-Token.",
    },
  };
}

// ---------------------------------------------------------------------------
// Rate Limit Headers (reusable across paths)
// ---------------------------------------------------------------------------

const RATE_LIMIT_HEADERS: Record<string, unknown> = {
  "RateLimit-Limit": {
    description: "Maximum requests allowed in the current window.",
    schema: { type: "integer" },
  },
  "RateLimit-Remaining": {
    description: "Requests remaining in the current window.",
    schema: { type: "integer" },
  },
  "RateLimit-Reset": {
    description: "Seconds until the rate limit window resets.",
    schema: { type: "integer" },
  },
  "X-Request-Id": {
    description: "Unique request correlation ID.",
    schema: { type: "string", format: "uuid" },
  },
};

// ---------------------------------------------------------------------------
// Path Definitions
// ---------------------------------------------------------------------------

function buildPaths(): Record<string, unknown> {
  return {
    // ── Health ────────────────────────────────────────────────────────────
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Basic health check",
        description:
          "Returns healthy if the server process is running. No dependency checks.",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "Server is running.",
            headers: RATE_LIMIT_HEADERS,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },

    "/health/live": {
      get: {
        tags: ["Health"],
        summary: "Liveness probe",
        description:
          "Kubernetes/Cloud Run liveness probe. Always returns 200 if the process is alive.",
        operationId: "getLiveness",
        responses: {
          "200": {
            description: "Process is alive.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LivenessResponse" },
              },
            },
          },
        },
      },
    },

    "/health/ready": {
      get: {
        tags: ["Health"],
        summary: "Readiness probe",
        description:
          "Checks all dependencies (cache, Firestore, LLM providers). " +
          "Returns 503 if any critical dependency is unhealthy.",
        operationId: "getReadiness",
        responses: {
          "200": {
            description: "All dependencies healthy.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReadinessResponse" },
              },
            },
          },
          "503": {
            description: "One or more dependencies unhealthy.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReadinessResponse" },
              },
            },
          },
        },
      },
    },

    "/api/optimize-compile": {
      post: {
        tags: ["Prompt Optimization"],
        summary: "Compile a prompt for a specific model",
        description:
          "Single-stage prompt compilation targeting a specific model. " +
          "No streaming — returns the compiled prompt synchronously.",
        operationId: "compilePrompt",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PromptCompileRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Compiled prompt.",
            headers: RATE_LIMIT_HEADERS,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiSuccessResponse",
                },
              },
            },
          },
          "400": {
            description: "Invalid request body.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiErrorResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid API key.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiErrorResponse" },
              },
            },
          },
        },
      },
    },

    // ── Capabilities ─────────────────────────────────────────────────────
    "/api/capabilities": {
      get: {
        tags: ["Capabilities"],
        summary: "Get model capabilities schema",
        description:
          "Returns parameter constraints (aspect ratios, durations, resolution) " +
          "for a given provider and model combination.",
        operationId: "getCapabilities",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: "provider",
            in: "query",
            schema: { type: "string", default: "generic" },
            description:
              "Video generation provider (e.g. sora, veo, kling, luma, runway).",
          },
          {
            name: "model",
            in: "query",
            schema: { type: "string", default: "auto" },
            description: 'Specific model ID, or "auto" for provider default.',
          },
        ],
        responses: {
          "200": {
            description:
              "Capabilities schema for the requested provider/model.",
            headers: {
              ...RATE_LIMIT_HEADERS,
              "Cache-Control": {
                description: "Capabilities are cached for 1 hour.",
                schema: { type: "string", example: "public, max-age=3600" },
              },
            },
            content: { "application/json": { schema: { type: "object" } } },
          },
          "404": {
            description: "No capabilities found for the given provider/model.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiErrorResponse" },
              },
            },
          },
        },
      },
    },

    // ── Payment ──────────────────────────────────────────────────────────
    "/api/payment/status": {
      get: {
        tags: ["Payment"],
        summary: "Get billing status",
        description:
          "Returns the current plan tier, subscription status, and starter grant info.",
        operationId: "getBillingStatus",
        security: [{ ApiKeyAuth: [] }, { FirebaseAuth: [] }],
        responses: {
          "200": {
            description: "Billing status.",
            headers: RATE_LIMIT_HEADERS,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    planTier: {
                      type: "string",
                      enum: ["free", "explorer", "pro"],
                    },
                    isSubscribed: { type: "boolean" },
                    starterGrantCredits: { type: "number", nullable: true },
                    starterGrantGrantedAtMs: { type: "number", nullable: true },
                  },
                },
              },
            },
          },
          "401": {
            description: "Authentication required.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiErrorResponse" },
              },
            },
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Document Builder
// ---------------------------------------------------------------------------

export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
    contact?: { name: string; url: string };
    license?: { name: string; url: string };
  };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, unknown>;
  components: {
    schemas: Record<string, JsonSchema>;
    securitySchemes: Record<string, unknown>;
  };
}

/**
 * Build the complete OpenAPI 3.0.3 specification document.
 *
 * This is the single entry point for spec generation. The returned object
 * can be serialized to JSON or YAML.
 */
export function buildOpenApiSpec(): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "Vidra API",
      version: "1.0.0",
      description:
        "Interactive editing canvas for AI video prompts with semantic span labeling, " +
        "click-to-enhance suggestions, and fast previews.\n\n" +
        "## Authentication\n\n" +
        "Most endpoints require an `X-API-Key` header. Credit-gated endpoints " +
        "(preview, payment) additionally require a Firebase ID token via the " +
        "`Authorization: Bearer <token>` header.\n\n" +
        "## Rate Limiting\n\n" +
        "All endpoints return standard rate limit headers: `RateLimit-Limit`, " +
        "`RateLimit-Remaining`, `RateLimit-Reset`. Exceeding the limit returns " +
        'HTTP 429 with an `ApiErrorResponse` body containing `code: "RATE_LIMITED"`.\n\n' +
        "## Error Format\n\n" +
        "All errors follow the `ApiErrorResponse` schema with a machine-readable " +
        "`code` field from the `ApiErrorCode` enum.",
    },
    servers: [
      { url: "http://localhost:3001", description: "Local development" },
    ],
    tags: [
      {
        name: "Health",
        description: "Health checks, readiness/liveness probes, and metrics.",
      },
      {
        name: "Prompt Optimization",
        description: "Two-stage prompt optimization and compilation.",
      },
      {
        name: "Capabilities",
        description: "Model and provider capability discovery.",
      },
      {
        name: "Payment",
        description: "Billing status, invoices, checkout, and Stripe portal.",
      },
    ],
    paths: buildPaths(),
    components: {
      schemas: buildComponentSchemas(),
      securitySchemes: buildSecuritySchemes(),
    },
  };
}
