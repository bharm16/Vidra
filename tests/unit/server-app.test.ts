import { beforeEach, describe, expect, it, vi } from "vitest";

// Trimmed 2026-08-27 to the behaviors only this suite covers: loud boot
// failure, the worker-role depth-warmup skip, and the raw-body-before-json
// webhook ordering (a documented Stripe invariant the bootstrap integration
// test does not pin). The old collaborator-list case ("createApp called
// these mocks with these args") punished refactors without guarding
// behavior — the bootstrap integration test boots the real thing.
const {
  useMock,
  expressMock,
  configureMiddlewareMock,
  configureRoutesMock,
  createWebhookRoutesMock,
  initializeDepthWarmerMock,
  getRuntimeFlagsMock,
} = vi.hoisted(() => {
  const useMock = vi.fn();
  const appInstance = {
    use: useMock,
    set: vi.fn(),
  };

  return {
    useMock,
    expressMock: vi.fn(() => appInstance),
    configureMiddlewareMock: vi.fn(),
    configureRoutesMock: vi.fn(),
    createWebhookRoutesMock: vi.fn(() => ({ id: "webhook" })),
    initializeDepthWarmerMock: vi.fn(),
    getRuntimeFlagsMock: vi.fn(() => ({ processRole: "api" })),
  };
});

vi.mock("express", () => ({
  default: expressMock,
}));

vi.mock("@server/config/middleware.config.ts", () => ({
  configureMiddleware: configureMiddlewareMock,
}));

vi.mock("@server/config/routes.config.ts", () => ({
  configureRoutes: configureRoutesMock,
}));

vi.mock("@server/routes/payment.routes.ts", () => ({
  createWebhookRoutes: createWebhookRoutesMock,
}));

vi.mock("@services/convergence/depth", () => ({
  initializeDepthWarmer: initializeDepthWarmerMock,
}));

vi.mock("@server/config/feature-flags.ts", () => ({
  getRuntimeFlags: getRuntimeFlagsMock,
}));

import { createApp } from "@server/app";

function buildContainer(): { resolve: ReturnType<typeof vi.fn> } {
  return {
    resolve: vi.fn((token: string) => ({ token })),
  };
}

describe("createApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRuntimeFlagsMock.mockReturnValue({ processRole: "api" });
  });

  describe("dependency resolution", () => {
    it("propagates errors when the container fails to resolve a token", () => {
      const container = {
        resolve: vi.fn(() => {
          throw new Error("resolve failed");
        }),
      };

      expect(() => createApp(container as never)).toThrow("resolve failed");
    });
  });

  describe("edge cases", () => {
    it("registers webhook routes before middleware", () => {
      const container = buildContainer();

      createApp(container as never);

      expect(useMock).toHaveBeenCalledWith("/api/payment", { id: "webhook" });
      const useCallOrder = useMock.mock.invocationCallOrder[0];
      const middlewareCallOrder =
        configureMiddlewareMock.mock.invocationCallOrder[0];
      expect(useCallOrder).toBeDefined();
      expect(middlewareCallOrder).toBeDefined();
      expect(useCallOrder ?? 0).toBeLessThan(middlewareCallOrder ?? 0);
    });

    it("skips depth warmup when role is worker", () => {
      getRuntimeFlagsMock.mockReturnValue({ processRole: "worker" });
      const container = buildContainer();

      createApp(container as never);

      expect(initializeDepthWarmerMock).not.toHaveBeenCalled();
    });
  });

});
