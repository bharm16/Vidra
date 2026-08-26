import type { z } from "zod";
import { apiClient } from "./ApiClient";
import {
  ApiSuccessResponseSchema,
  ApiErrorResponseSchema,
} from "@shared/schemas/api.schemas";

export interface ApiRequestInit {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Make an authenticated Vidra API call and return the unwrapped `data`.
 *
 * Routes through {@link apiClient.rawRequest}, so the call inherits the shared
 * cross-cutting behaviour every apiClient request gets — Firebase auth headers,
 * the telemetry-source header, and the 401 → open-sign-in-and-retry transport —
 * then validates the body against the shared success envelope and returns
 * `data`. This replaces the per-module "build auth headers + fetch + unwrap
 * `{ success, data }`" plumbing that several api/ modules had each re-derived.
 *
 * Endpoints are passed WITHOUT the `/api` prefix: the client baseURL is `/api`,
 * so pass `/enhancement/observe-image`, not `/api/enhancement/observe-image`.
 *
 * @throws Error carrying the server's `error` message on a non-OK response.
 */
export async function apiRequest<T extends z.ZodTypeAny>(
  endpoint: string,
  dataSchema: T,
  init: ApiRequestInit = {},
): Promise<z.infer<T>> {
  const response = await apiClient.rawRequest(endpoint, {
    method: init.method ?? "GET",
    body: init.body,
    ...(init.signal ? { signal: init.signal } : {}),
  });

  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    const parsed = ApiErrorResponseSchema.safeParse(payload);
    throw new Error(
      parsed.success
        ? parsed.data.error
        : `Request failed (${response.status})`,
    );
  }

  // Validated against dataSchema above; the generic wrapper loses the precise
  // `data` type through `.passthrough()`, so re-assert it at this boundary.
  return ApiSuccessResponseSchema(dataSchema).parse(payload).data as z.infer<T>;
}
