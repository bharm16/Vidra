/**
 * API Logging Interceptors
 *
 * Automatically logs all API requests/responses for debugging.
 * Add these interceptors to the ApiClient instance.
 */

import { logger } from "../LoggingService";

interface BuiltRequest {
  url: string;
  init: RequestInit;
}

interface RequestMetadata {
  startTime: number;
  traceId: string;
}

// Store request metadata for response correlation
const requestMetadata = new Map<string, RequestMetadata>();

/**
 * Request interceptor - logs outgoing requests
 */
export function createRequestLoggingInterceptor(): (
  request: BuiltRequest,
) => BuiltRequest {
  return (request: BuiltRequest): BuiltRequest => {
    const traceId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const url = new URL(request.url, window.location.origin);
    const endpoint = url.pathname;

    // Store metadata for response correlation
    requestMetadata.set(request.url, {
      startTime: performance.now(),
      traceId,
    });

    // Parse body if present
    let body: unknown;
    if (request.init.body) {
      try {
        body =
          typeof request.init.body === "string"
            ? JSON.parse(request.init.body)
            : request.init.body;
      } catch {
        body = request.init.body;
      }
    }

    logger.debug("API request", {
      operation: "apiRequest",
      requestId: traceId,
      method: request.init.method || "GET",
      endpoint,
      url: request.url,
      direction: "outbound",
      headers: request.init.headers,
      body: body ? summarizePayload(body) : undefined,
    });

    return request;
  };
}

/**
 * Response interceptor - logs incoming responses
 */
export function createResponseLoggingInterceptor(): (
  response: Response,
) => Promise<Response> {
  return async (response: Response): Promise<Response> => {
    const url = response.url;
    const metadata = requestMetadata.get(url);
    requestMetadata.delete(url);

    const duration = metadata
      ? Math.round(performance.now() - metadata.startTime)
      : undefined;
    const endpoint = new URL(url).pathname;

    // Clone response to read body without consuming it
    const clonedResponse = response.clone();

    try {
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const body = await clonedResponse.json();

        if (response.ok) {
          logger.debug("API response", {
            operation: "apiResponse",
            requestId: metadata?.traceId,
            status: response.status,
            endpoint,
            duration,
            ok: true,
            response: summarizePayload(body),
          });
        } else {
          logger.warn("API response error", {
            operation: "apiResponse",
            requestId: metadata?.traceId,
            status: response.status,
            endpoint,
            duration,
            ok: false,
            error: body,
          });
        }
      } else {
        logger.debug("API response", {
          operation: "apiResponse",
          requestId: metadata?.traceId,
          status: response.status,
          endpoint,
          duration,
          contentType,
        });
      }
    } catch {
      logger.debug("API response", {
        operation: "apiResponse",
        requestId: metadata?.traceId,
        status: response.status,
        endpoint,
        duration,
        note: "Could not parse response body",
      });
    }

    return response;
  };
}

/**
 * Error interceptor for fetch failures
 */
export function createErrorLoggingInterceptor(): (error: Error) => never {
  return (error: Error): never => {
    logger.error("API Request Failed", error, {
      operation: "apiRequest",
      type: error.name,
      message: error.message,
    });
    throw error;
  };
}

/**
 * Summarize large payloads for logging
 */
function summarizePayload(payload: unknown, maxLength = 500): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof payload === "string") {
    return payload.length > maxLength
      ? `${payload.slice(0, maxLength)}... (${payload.length} chars)`
      : payload;
  }

  if (Array.isArray(payload)) {
    return {
      __array: true,
      length: payload.length,
      sample: payload.slice(0, 3).map((item) => summarizePayload(item, 100)),
    };
  }

  if (typeof payload === "object") {
    const summary: Record<string, unknown> = {};
    const keys = Object.keys(payload as object);

    for (const key of keys.slice(0, 10)) {
      summary[key] = summarizePayload(
        (payload as Record<string, unknown>)[key],
        100,
      );
    }

    if (keys.length > 10) {
      summary.__truncated = `${keys.length - 10} more keys`;
    }

    return summary;
  }

  return payload;
}

/**
 * Setup all logging interceptors on ApiClient
 */
export function setupApiLogging(apiClient: {
  addRequestInterceptor: (
    interceptor: (request: BuiltRequest) => BuiltRequest,
  ) => void;
  addResponseInterceptor: (
    interceptor: (response: Response) => Response | Promise<Response>,
  ) => void;
}): void {
  apiClient.addRequestInterceptor(createRequestLoggingInterceptor());
  apiClient.addResponseInterceptor(createResponseLoggingInterceptor());

  logger.info("API logging interceptors initialized", {
    operation: "setupApiLogging",
  });
}
