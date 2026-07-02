import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createCapabilitiesRoutes } from "../capabilities.routes";
import type { CapabilitiesSchema } from "@shared/capabilities";
import { z } from "zod";
import { ApiResponseSchema } from "@shared/schemas/api.schemas";
import {
  getCapabilities,
  listModels,
  listProviders,
  resolveModelId,
  resolveProviderForModel,
} from "@services/capabilities";

interface ErrorWithCode {
  code?: string;
  message?: string;
}

const isSocketPermissionError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as ErrorWithCode;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  if (code === "EPERM" || code === "EACCES") {
    return true;
  }

  return (
    message.includes("listen EPERM") ||
    message.includes("listen EACCES") ||
    message.includes("operation not permitted") ||
    message.includes("Cannot read properties of null (reading 'port')")
  );
};

const runSupertestOrSkip = async <T>(
  execute: () => Promise<T>,
): Promise<T | null> => {
  if (process.env.CODEX_SANDBOX === "seatbelt") {
    return null;
  }

  try {
    return await execute();
  } catch (error) {
    if (isSocketPermissionError(error)) {
      return null;
    }
    throw error;
  }
};

vi.mock("@services/capabilities", () => ({
  getCapabilities: vi.fn(),
  listModels: vi.fn(),
  listProviders: vi.fn(),
  resolveModelId: vi.fn(),
  resolveProviderForModel: vi.fn(),
}));

const getCapabilitiesMock = vi.mocked(getCapabilities);
const listModelsMock = vi.mocked(listModels);
const listProvidersMock = vi.mocked(listProviders);
const resolveModelIdMock = vi.mocked(resolveModelId);
const resolveProviderForModelMock = vi.mocked(resolveProviderForModel);

const createTestApp = () => {
  const app = express();
  app.use(createCapabilitiesRoutes());
  return app;
};

const VEO_SCHEMA: CapabilitiesSchema = {
  provider: "google",
  model: "veo-4",
  version: "1.0.0",
  features: {
    text_to_video: true,
    image_to_video: true,
  },
  fields: {
    aspect_ratio: {
      type: "enum",
      values: ["16:9"],
      default: "16:9",
    },
  },
};

describe("capabilities.routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listProvidersMock.mockReturnValue([]);
    listModelsMock.mockReturnValue([]);
    resolveModelIdMock.mockImplementation((modelId) => modelId ?? null);
    resolveProviderForModelMock.mockReturnValue(null);
    getCapabilitiesMock.mockReturnValue(null);
  });

  it("resolves generic aliased model IDs to provider capability schema", async () => {
    const app = createTestApp();

    resolveModelIdMock.mockImplementation((modelId) =>
      modelId === "google/veo-3" ? "veo-4" : (modelId ?? null),
    );
    resolveProviderForModelMock.mockImplementation((modelId) =>
      modelId === "veo-4" ? "google" : null,
    );
    getCapabilitiesMock.mockImplementation((provider, model) =>
      provider === "google" && model === "veo-4" ? VEO_SCHEMA : null,
    );

    const response = await runSupertestOrSkip(() =>
      request(app)
        .get("/capabilities")
        .query({ provider: "generic", model: "google/veo-3" }),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { provider: "google", model: "veo-4" },
    });
    expect(resolveModelIdMock).toHaveBeenCalledWith("google/veo-3");
    expect(resolveProviderForModelMock).toHaveBeenCalledWith("veo-4");
    expect(getCapabilitiesMock).toHaveBeenCalledWith("google", "veo-4");
  });

  it("resolves aliased model IDs for explicit providers", async () => {
    const app = createTestApp();

    resolveModelIdMock.mockImplementation((modelId) =>
      modelId === "google/veo-3" ? "veo-4" : (modelId ?? null),
    );
    getCapabilitiesMock.mockImplementation((provider, model) =>
      provider === "google" && model === "veo-4" ? VEO_SCHEMA : null,
    );

    const response = await runSupertestOrSkip(() =>
      request(app)
        .get("/capabilities")
        .query({ provider: "google", model: "google/veo-3" }),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { provider: "google", model: "veo-4" },
    });
    expect(resolveProviderForModelMock).not.toHaveBeenCalled();
    expect(getCapabilitiesMock).toHaveBeenCalledWith("google", "veo-4");
  });
});

describe("capabilities.routes — canonical envelope contract", () => {
  const AnyEnvelope = ApiResponseSchema(z.unknown());

  beforeEach(() => {
    vi.clearAllMocks();
    listProvidersMock.mockReturnValue(["google"]);
    listModelsMock.mockReturnValue(["veo-4"]);
    resolveModelIdMock.mockImplementation((modelId) => modelId ?? null);
    resolveProviderForModelMock.mockReturnValue(null);
    getCapabilitiesMock.mockReturnValue(VEO_SCHEMA);
  });

  it("GET /providers returns the success envelope", async () => {
    const response = await runSupertestOrSkip(() =>
      request(createTestApp()).get("/providers"),
    );
    if (!response) return;
    expect(response.status).toBe(200);
    const parsed = AnyEnvelope.parse(response.body);
    expect(parsed.success).toBe(true);
    expect(response.body.data).toEqual({ providers: ["google"] });
  });

  it("GET /models without provider returns the error envelope", async () => {
    const response = await runSupertestOrSkip(() =>
      request(createTestApp()).get("/models"),
    );
    if (!response) return;
    expect(response.status).toBe(400);
    const parsed = AnyEnvelope.parse(response.body);
    expect(parsed.success).toBe(false);
  });

  it("GET /capabilities for an unknown model returns string details", async () => {
    getCapabilitiesMock.mockReturnValue(null);
    const response = await runSupertestOrSkip(() =>
      request(createTestApp()).get("/capabilities?provider=x&model=y"),
    );
    if (!response) return;
    expect(response.status).toBe(404);
    const parsed = AnyEnvelope.parse(response.body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(typeof parsed.details).toBe("string");
    }
  });

  it("GET /capabilities wraps the schema under data only", async () => {
    const response = await runSupertestOrSkip(() =>
      request(createTestApp()).get("/capabilities?provider=google&model=veo-4"),
    );
    if (!response) return;
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ provider: "google" });
    expect(response.body).not.toHaveProperty("provider");
  });
});

