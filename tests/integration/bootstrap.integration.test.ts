import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureServices, initializeServices } from "@config/services.config";
import type { DIContainer } from "@infrastructure/DIContainer";
import { createApp } from "@server/app";
import { startServer } from "@server/server";

describe("Server Bootstrap (integration)", () => {
  let server: Server | null = null;
  let container: DIContainer | null = null;
  let baseUrl = "";
  let previousPort: string | undefined;

  beforeAll(async () => {
    previousPort = process.env.PORT;
    process.env.PORT = "0";

    container = await configureServices();
    await initializeServices(container);

    const app = createApp(container);
    server = await startServer(app, container);

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error(
        `Expected TCP server address, received: ${String(address)}`,
      );
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });

    if (previousPort === undefined) {
      delete process.env.PORT;
      return;
    }
    process.env.PORT = previousPort;
  });

  it("starts and serves GET /health", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(typeof body.timestamp).toBe("string");
  });

  it("serves GET /health/live through full middleware and route registration", async () => {
    const response = await fetch(`${baseUrl}/health/live`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("alive");
  });

  it("returns the canonical 404 envelope for unknown paths", async () => {
    const response = await fetch(`${baseUrl}/route-that-does-not-exist`);
    const body = await response.json();

    expect(response.status).toBe(404);
    // The canonical envelope (6640ab845: one response envelope, emitted by
    // one module) has no `path` field — the unmatched path travels in
    // `details` (routes.config.ts 404 handler).
    expect(body.success).toBe(false);
    expect(body.error).toBe("Not found");
    expect(body.code).toBe("INVALID_REQUEST");
    expect(body.details).toBe("/route-that-does-not-exist");
  });
});
