import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createFirestoreWriteGateMiddleware } from "@middleware/firestoreWriteGate";
import { runSupertestRequest } from "./test-helpers/supertestRequest";

describe("firestoreWriteGate middleware", () => {
  it("blocks mutating requests with 503 when circuit is open", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/api",
      createFirestoreWriteGateMiddleware({
        isWriteAllowed: () => false,
        getRetryAfterSeconds: () => 12,
      } as never),
    );
    app.post("/api/test", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await runSupertestRequest(() =>
      request(app).post("/api/test").send({ hello: "world" }),
    );

    expect(response.status).toBe(503);
    expect(response.headers["retry-after"]).toBe("12");
    expect(response.body.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("allows non-mutating requests even when circuit is open", async () => {
    const app = express();
    app.use(
      "/api",
      createFirestoreWriteGateMiddleware({
        isWriteAllowed: () => false,
        getRetryAfterSeconds: () => 12,
      } as never),
    );
    app.get("/api/test", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await runSupertestRequest(() =>
      request(app).get("/api/test"),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
