import { createServer, type Server } from "node:http";

import type express from "express";

/**
 * Create a supertest target bound to 127.0.0.1 explicitly.
 *
 * supertest's default per-request `app.listen(0)` binds the [::] dual-stack
 * wildcard, and macOS will hand that bind an ephemeral port that an unrelated
 * process already holds on 127.0.0.1 — a specific IPv4 bind coexists with a
 * v6 wildcard bind and wins 127.0.0.1 connects. When that happens the foreign
 * process answers the request, observed as intermittent 404s from local
 * tooling daemons in the high-request middleware tests. An IPv4-specific bind
 * makes the collision impossible: the kernel refuses to give two 127.0.0.1
 * listeners the same port.
 *
 * Pass the returned (already listening) server to `request(...)`; supertest
 * then reuses it instead of binding a fresh wildcard server per request.
 * Register `closeLoopbackServers` in an `afterEach` to release the port.
 */
const openServers: Server[] = [];

export const listenOnLoopback = async (
  app: express.Express,
): Promise<Server> => {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  openServers.push(server);
  return server;
};

export const closeLoopbackServers = async (): Promise<void> => {
  await Promise.all(
    openServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
};
