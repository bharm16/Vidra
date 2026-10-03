import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCapabilitiesRegistryMock } = vi.hoisted(() => ({
  getCapabilitiesRegistryMock: vi.fn(),
}));

vi.mock("@services/capabilities", () => ({
  getCapabilitiesRegistry: getCapabilitiesRegistryMock,
}));

describe("preview availability helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("getCapabilityModelIds excludes generic provider, dedupes ids, and caches results", async () => {
    getCapabilitiesRegistryMock.mockReturnValue({
      generic: {
        "generic-model": {},
      },
      replicate: {
        "wan-2.2": {},
        "veo-4": {},
      },
      openai: {
        "veo-4": {},
        "sora-2": {},
        "luma-ray3": {},
        "kling-26": {},
      },
    });

    const { getCapabilityModelIds } = await import("../availability");
    const first = getCapabilityModelIds();
    const second = getCapabilityModelIds();

    expect(new Set(first)).toEqual(new Set(["wan-2.2", "veo-4"]));
    expect(first).toBe(second);
    expect(getCapabilitiesRegistryMock).toHaveBeenCalledTimes(1);
  });

  it("emptyAvailability returns the expected shape", async () => {
    const { emptyAvailability } = await import("../availability");

    expect(emptyAvailability()).toEqual({
      providers: {
        replicate: false,
        openai: false,
        luma: false,
        kling: false,
        gemini: false,
      },
      models: [],
      availableModels: [],
      availableCapabilityModels: [],
    });
  });
});
