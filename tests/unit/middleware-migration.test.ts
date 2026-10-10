import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: vi.fn(() => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    })),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("uuid", () => ({
  v4: () => "uuid-fixed",
}));

import { logger } from "@infrastructure/Logger";
import { getRequestContext } from "@infrastructure/requestContext";
import { requestIdMiddleware } from "@middleware/requestId";
import { asyncHandler } from "@middleware/asyncHandler";
import { errorHandler } from "@middleware/errorHandler";
import { runSupertestRequest } from "./test-helpers/supertestRequest";

const mockedLogger = vi.mocked(logger);

describe("requestIdMiddleware", () => {
  it("uses provided request id and exposes it via context", async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get("/test", (req, res) => {
      res.json({
        id: req.id,
        context: getRequestContext(),
      });
    });

    const response = await runSupertestRequest(() =>
      request(app).get("/test").set("x-request-id", "incoming-id"),
    );

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("incoming-id");
    expect(response.body.id).toBe("incoming-id");
    expect(response.body.context).toEqual({ requestId: "incoming-id" });
  });

  it("generates a request id when none is provided", async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get("/test", (req, res) => {
      res.json({ id: req.id });
    });

    const response = await runSupertestRequest(() => request(app).get("/test"));

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("uuid-fixed");
    expect(response.body.id).toBe("uuid-fixed");
  });
});

describe("asyncHandler", () => {
  it("forwards async errors to next middleware", async () => {
    const app = express();
    app.get(
      "/boom",
      asyncHandler(async () => {
        throw new Error("boom");
      }),
    );

    app.use(
      (
        err: Error,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res.status(500).json({ error: err.message });
      },
    );

    const response = await runSupertestRequest(() => request(app).get("/boom"));

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("boom");
  });
});

describe("errorHandler", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.clearAllMocks();
  });

  it("responds with redacted error payload and logs safely", async () => {
    const app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);

    app.post("/fail", (req, _res, next) => {
      const err = Object.assign(new Error("failure"), {
        statusCode: 418,
        details: { reason: "teapot" },
      });
      next(err);
    });

    app.use(errorHandler);

    const response = await runSupertestRequest(() =>
      request(app)
        .post("/fail")
        .send({ email: "user@example.com", message: "hello" }),
    );

    expect(response.status).toBe(418);
    expect(response.body.error).toBe("failure");
    expect(response.body.requestId).toBe("uuid-fixed");
    const parsedDetails =
      typeof response.body.details === "string"
        ? JSON.parse(response.body.details)
        : response.body.details;
    expect(parsedDetails).toEqual({ reason: "teapot" });
    expect(response.body.stack).toBeUndefined();

    expect(mockedLogger.error).toHaveBeenCalled();
    const matchingCall = mockedLogger.error.mock.calls.find(
      (call) =>
        call.length >= 3 &&
        typeof call[2] === "object" &&
        call[2] !== null &&
        "bodyPreview" in (call[2] as Record<string, unknown>),
    );
    expect(matchingCall).toBeDefined();
    const meta = matchingCall?.[2] as { bodyPreview?: string };
    expect(typeof meta.bodyPreview).toBe("string");
    expect(meta.bodyPreview as string).toContain("[REDACTED]");
  });
});
