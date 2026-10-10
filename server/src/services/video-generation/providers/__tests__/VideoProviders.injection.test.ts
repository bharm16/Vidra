import { describe, it, expect } from "vitest";
import type Replicate from "replicate";
import { ReplicateVideoProvider } from "../ReplicateVideoProvider";
import { VeoVideoProvider } from "../VeoVideoProvider";
import { VIDEO_PROVIDER_CREDENTIALS, type VideoProvider } from "../types";
import { DEFAULT_VEO_BASE_URL } from "../veoProvider";
import type { VideoModelId } from "@shared/videoModels";
import type { VideoAssetStore } from "@services/video-generation/storage";

const noopAssetStore = {} as unknown as VideoAssetStore;

const noopLog = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const configured = (): VideoProvider[] => [
  new ReplicateVideoProvider({ replicate: {} as Replicate }),
  new VeoVideoProvider({ apiKey: "gemini-key" }),
];

const unconfigured = (): VideoProvider[] => [
  new ReplicateVideoProvider(),
  new VeoVideoProvider(),
];

describe("video providers — injection contract", () => {
  it("reports available when its own client is injected", () => {
    for (const provider of configured()) {
      expect(provider.isAvailable()).toBe(true);
    }
  });

  it("reports unavailable when its credential is absent", () => {
    for (const provider of unconfigured()) {
      expect(provider.isAvailable()).toBe(false);
    }
  });

  it("throws the credentials table's message when asked to generate unconfigured", async () => {
    // The availability report quotes the same table, so a provider can no
    // longer explain its own failure differently from the API response.
    for (const provider of unconfigured()) {
      await expect(
        provider.generate(
          "a prompt",
          "some-model" as VideoModelId,
          {},
          noopAssetStore,
          noopLog,
        ),
      ).rejects.toThrow(VIDEO_PROVIDER_CREDENTIALS[provider.id].missingMessage);
    }
  });
});
