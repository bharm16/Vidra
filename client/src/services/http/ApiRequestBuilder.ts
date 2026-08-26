import type { HttpClientConfig } from "./HttpClientConfig";

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
  fetchOptions?: RequestInit;
  /**
   * Skip the automatic timeout signal. Streaming responses (NDJSON) stay open
   * far longer than the default request timeout, which would otherwise abort
   * them mid-flight. A caller-supplied `signal` still applies (for cancellation).
   */
  stream?: boolean;
}

interface BuiltRequest {
  url: string;
  init: RequestInit;
}

export class ApiRequestBuilder {
  constructor(private readonly config: HttpClientConfig) {}

  build(endpoint: string, options: RequestOptions = {}): BuiltRequest {
    const method = options.method || "GET";
    const url = this.config.buildUrl(endpoint);
    const headers = this.config.mergeHeaders(options.headers);
    const signal =
      options.signal ??
      (options.stream ? undefined : this.config.createSignal(options.timeout));
    const body = this.serializeBody(method, options.body);

    // FormData must carry its own multipart Content-Type (with the boundary the
    // browser generates); the default application/json header would clobber it.
    if (body instanceof FormData) {
      delete headers["Content-Type"];
    }

    const init: RequestInit = {
      method,
      headers,
      // Omitted entirely for streaming (no timeout, no caller signal), so the
      // stream is never aborted by an idle timeout.
      ...(signal ? { signal } : {}),
      ...options.fetchOptions,
    };
    if (body !== undefined) {
      init.body = body;
    }

    return { url, init };
  }

  private serializeBody(method: string, body: unknown): BodyInit | undefined {
    if (!body || method === "GET" || method === "HEAD") {
      return undefined;
    }

    if (
      body instanceof FormData ||
      typeof body === "string" ||
      body instanceof Blob
    ) {
      return body;
    }

    return JSON.stringify(body);
  }
}
