import { beforeEach, describe, expect, it, vi } from "vitest";

// Bootstrap/route behavior is covered by the real integration suite. This test pins loud DI failures.
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
});
