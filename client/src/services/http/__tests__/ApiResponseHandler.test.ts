import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../ApiError";
import { ApiResponseHandler } from "../ApiResponseHandler";

function createHandler() {
  const errorFactory = {
    create: vi.fn(
      ({
        message,
        status,
        response,
        code,
      }: {
        message: string;
        status?: number;
        response?: unknown;
        code?: string;
      }) => new ApiError(message, status, response, code),
    ),
    createTimeout: vi.fn(() => new ApiError("Request timeout")),
    createNetwork: vi.fn(
      (error: unknown) =>
        new ApiError(
          error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
            ? error.message
            : "Network error",
        ),
    ),
  };

  return {
    handler: new ApiResponseHandler(errorFactory),
    errorFactory,
  };
}

describe("ApiResponseHandler", () => {
  it("uses error payload.error when non-OK response includes it", async () => {
    const { handler, errorFactory } = createHandler();
    const response = new Response(
      JSON.stringify({ error: "bad request payload" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      },
    );

    await expect(handler.handle(response)).rejects.toMatchObject({
      message: "bad request payload",
      status: 400,
    });
    expect(errorFactory.create).toHaveBeenCalledWith({
      message: "bad request payload",
      status: 400,
      response: { error: "bad request payload" },
      code: undefined,
    });
  });

  it("falls back to HTTP status text when non-OK body is empty", async () => {
    const { handler, errorFactory } = createHandler();
    const response = new Response(null, { status: 503 });

    await expect(handler.handle(response)).rejects.toMatchObject({
      message: "HTTP 503",
      status: 503,
    });
    expect(errorFactory.create).toHaveBeenCalledWith({
      message: "HTTP 503",
      status: 503,
      response: null,
      code: undefined,
    });
  });

  it("returns null for 204 response", async () => {
    const { handler } = createHandler();
    const response = new Response(null, { status: 204 });

    await expect(handler.handle(response)).resolves.toBeNull();
  });

  it("returns parsed JSON for successful response", async () => {
    const { handler } = createHandler();
    const response = new Response(JSON.stringify({ ok: true, value: 42 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(handler.handle(response)).resolves.toEqual({
      ok: true,
      value: 42,
    });
  });

  it("throws parse error from safeParseJson when body is required", async () => {
    const { handler, errorFactory } = createHandler();
    const response = new Response("not valid JSON", {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(
      handler.safeParseJson(response, { allowEmpty: false }),
    ).rejects.toMatchObject({
      message: "Failed to parse JSON response",
      status: 200,
    });
    expect(errorFactory.create).toHaveBeenCalledWith({
      message: "Failed to parse JSON response",
      status: 200,
    });
  });

  it("mapError returns ApiError instances unchanged", () => {
    const { handler } = createHandler();
    const original = new ApiError("already mapped", 401);

    expect(handler.mapError(original)).toBe(original);
  });

  it("mapError maps abort and timeout names to timeout error", () => {
    const { handler, errorFactory } = createHandler();

    const abortMapped = handler.mapError({ name: "AbortError" });
    const timeoutMapped = handler.mapError({ name: "TimeoutError" });

    expect(abortMapped).toMatchObject({ message: "Request timeout" });
    expect(timeoutMapped).toMatchObject({ message: "Request timeout" });
    expect(errorFactory.createTimeout).toHaveBeenCalledTimes(2);
  });

  it("mapError maps unknown failures to network error", () => {
    const { handler, errorFactory } = createHandler();

    const mapped = handler.mapError(new Error("socket hang up"));

    expect(mapped).toMatchObject({ message: "socket hang up" });
    expect(errorFactory.createNetwork).toHaveBeenCalledWith(expect.any(Error));
  });
});
