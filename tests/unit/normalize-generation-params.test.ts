import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCapabilitiesMock,
  resolveModelIdMock,
  resolveProviderForModelMock,
  validateCapabilityValuesMock,
  loggerMock,
} = vi.hoisted(() => ({
  getCapabilitiesMock: vi.fn(),
  resolveModelIdMock: vi.fn(),
  resolveProviderForModelMock: vi.fn(),
  validateCapabilityValuesMock: vi.fn(),
  loggerMock: {
    warn: vi.fn(),
  },
}));

vi.mock("@services/capabilities", () => ({
  getCapabilities: getCapabilitiesMock,
  resolveModelId: resolveModelIdMock,
  resolveProviderForModel: resolveProviderForModelMock,
  validateCapabilityValues: validateCapabilityValuesMock,
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: loggerMock,
}));

import { normalizeGenerationParams } from "@routes/optimize/normalizeGenerationParams";

describe("normalizeGenerationParams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveModelIdMock.mockReturnValue("sora-2");
    resolveProviderForModelMock.mockReturnValue("openai");
    getCapabilitiesMock.mockReturnValue({ id: "schema" });
    validateCapabilityValuesMock.mockReturnValue({
      ok: true,
      values: { fps: 24 },
      errors: [],
    });
  });

  it("returns a 400 error when no capability schema exists", () => {
    getCapabilitiesMock.mockReturnValue(null);

    const result = normalizeGenerationParams({
      generationParams: { fps: 24 },
      targetModel: "missing-model",
      operation: "optimize",
      requestId: "req-4",
    });

    expect(result).toEqual({
      normalizedGenerationParams: null,
      error: {
        status: 400,
        error: "Capabilities not found",
        details: "No registry entry for openai/auto",
      },
    });
    expect(validateCapabilityValuesMock).not.toHaveBeenCalled();
  });
});
