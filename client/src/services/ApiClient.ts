/**
 * ApiClient - Centralized HTTP Client
 *
 * Refactored to follow SOLID principles by decomposing responsibilities
 * into dedicated collaborators and depending on abstractions for transport
 * and error handling.
 */

import { API_CONFIG } from "../config/api.config";
import { HttpClientConfig } from "./http/HttpClientConfig";
import { ApiRequestBuilder } from "./http/ApiRequestBuilder";
import { InterceptorManager } from "./http/InterceptorManager";
import { FetchHttpTransport } from "./http/FetchHttpTransport";
import type { HttpTransport } from "./http/AuthRetryTransport";
import { ApiError } from "./http/ApiError";
import { ApiErrorFactory } from "./http/ApiErrorFactory";
import { ApiResponseHandler } from "./http/ApiResponseHandler";
import { setupApiAuth } from "./http/AuthInterceptors";
import { setupTelemetrySource } from "./http/TelemetrySourceInterceptor";
import { AuthRetryTransport } from "./http/AuthRetryTransport";
import { buildFirebaseAuthHeaders } from "./http/firebaseAuth";
import { auth } from "@/config/firebase";
import { authGateController } from "@/features/auth-gate/authGateController";

interface BuiltRequest {
  url: string;
  init: RequestInit;
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
  fetchOptions?: RequestInit;
}

interface ApiClientOptions {
  config?: HttpClientConfig;
  transport?: HttpTransport;
  requestBuilder?: ApiRequestBuilder;
  responseHandler?: ApiResponseHandler;
  requestInterceptors?: InterceptorManager<BuiltRequest>;
  responseInterceptors?: InterceptorManager<Response>;
}

export class ApiClient {
  private readonly config: HttpClientConfig;
  private readonly transport: HttpTransport;
  private readonly requestBuilder: ApiRequestBuilder;
  private readonly responseHandler: ApiResponseHandler;
  private readonly requestInterceptors: InterceptorManager<BuiltRequest>;
  private readonly responseInterceptors: InterceptorManager<Response>;

  constructor({
    config = HttpClientConfig.fromApiConfig(API_CONFIG),
    transport = new FetchHttpTransport(),
    requestBuilder = new ApiRequestBuilder(config),
    responseHandler = new ApiResponseHandler(new ApiErrorFactory()),
    requestInterceptors = new InterceptorManager<BuiltRequest>(),
    responseInterceptors = new InterceptorManager<Response>(),
  }: ApiClientOptions = {}) {
    this.config = config;
    this.transport = transport;
    this.requestBuilder = requestBuilder;
    this.responseHandler = responseHandler;
    this.requestInterceptors = requestInterceptors;
    this.responseInterceptors = responseInterceptors;
  }

  addRequestInterceptor(
    interceptor: (
      payload: BuiltRequest,
    ) => BuiltRequest | Promise<BuiltRequest> | undefined,
  ): void {
    this.requestInterceptors.use(interceptor);
  }

  addResponseInterceptor(
    interceptor: (
      payload: Response,
    ) => Response | Promise<Response> | undefined,
  ): void {
    this.responseInterceptors.use(interceptor);
  }

  /**
   * Send a request and return the parsed JSON response.
   *
   * Runs the full interceptor chain and delegates response parsing to the
   * {@link ApiResponseHandler}.  Use {@link rawRequest} instead when you
   * need the raw `Response` (e.g. for streaming or custom Zod validation).
   */
  async request(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<unknown> {
    const builtRequest = this.requestBuilder.build(endpoint, options);
    const interceptedRequest = await this.requestInterceptors.run(builtRequest);
    const { url, init } = interceptedRequest;

    try {
      const response = await this.transport.send(url, init);
      const processedResponse = await this.responseInterceptors.run(response);
      return await this.responseHandler.handle(processedResponse);
    } catch (error) {
      throw this.responseHandler.mapError(error);
    }
  }

  /**
   * Send a request and return the raw `Response` object.
   *
   * Runs request interceptors (auth headers), retry transport, and response
   * interceptors — but does **not** parse the body or throw on non-OK status.
   * Use this for streaming responses, custom Zod validation, or any case
   * where the caller needs full control over response processing.
   */
  async rawRequest(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<Response> {
    const builtRequest = this.requestBuilder.build(endpoint, options);
    const interceptedRequest = await this.requestInterceptors.run(builtRequest);
    const { url, init } = interceptedRequest;

    try {
      const response = await this.transport.send(url, init);
      return await this.responseInterceptors.run(response);
    } catch (error) {
      throw this.responseHandler.mapError(error);
    }
  }

  async get(endpoint: string, options: RequestOptions = {}): Promise<unknown> {
    return this.request(endpoint, { ...options, method: "GET" });
  }

  async post(
    endpoint: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<unknown> {
    return this.request(endpoint, { ...options, method: "POST", body });
  }

  async put(
    endpoint: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<unknown> {
    return this.request(endpoint, { ...options, method: "PUT", body });
  }

  async delete(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<unknown> {
    return this.request(endpoint, { ...options, method: "DELETE" });
  }

  async patch(
    endpoint: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<unknown> {
    return this.request(endpoint, { ...options, method: "PATCH", body });
  }
}

export { ApiError } from "./http/ApiError";

// Global 401 handler (M4): wrap the default transport so any 401 for a
// logged-out user opens the auth dialog and retries once after sign-in. The
// wrapped transport re-runs the request with freshly-minted Firebase headers.
const authRetryTransport = new AuthRetryTransport({
  transport: new FetchHttpTransport(),
  authGate: authGateController,
  isAuthenticated: () => auth.currentUser !== null,
  buildAuthHeaders: buildFirebaseAuthHeaders,
});

export const apiClient = new ApiClient({ transport: authRetryTransport });

setupApiAuth(apiClient);
setupTelemetrySource(apiClient);

// Enable logging in development
if ((import.meta as { env?: { MODE?: string } }).env?.MODE === "development") {
  import("./http/LoggingInterceptors").then(({ setupApiLogging }) => {
    setupApiLogging(apiClient);
  });
}
