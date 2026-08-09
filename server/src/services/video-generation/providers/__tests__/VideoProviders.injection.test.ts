import { describe, it, expect } from "vitest";
import type Replicate from "replicate";
import type OpenAI from "openai";
import type { LumaAI } from "lumaai";
import { ReplicateVideoProvider } from "../ReplicateVideoProvider";
import { SoraVideoProvider } from "../SoraVideoProvider";
import { LumaVideoProvider } from "../LumaVideoProvider";
import { KlingVideoProvider } from "../KlingVideoProvider";
import { VeoVideoProvider } from "../VeoVideoProvider";
import {
  VIDEO_PROVIDER_CREDENTIALS,
  VIDEO_PROVIDER_IDS,
  type VideoProvider,
} from "../types";
import { DEFAULT_KLING_BASE_URL } from "../klingProvider";
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
  new SoraVideoProvider({ openai: {} as OpenAI }),
  new LumaVideoProvider({ luma: {} as LumaAI }),
  new KlingVideoProvider({ apiKey: "kling-key" }),
  new VeoVideoProvider({ apiKey: "gemini-key" }),
];

const unconfigured = (): VideoProvider[] => [
  new ReplicateVideoProvider(),
  new SoraVideoProvider(),
  new LumaVideoProvider(),
  new KlingVideoProvider(),
  new VeoVideoProvider(),
];

describe("video providers — injection contract", () => {
  it("covers every declared provider id, exactly once", () => {
    expect(
      configured()
        .map((provider) => provider.id)
        .sort(),
    ).toEqual([...VIDEO_PROVIDER_IDS].sort());
  });

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

  it("declares the required key the credentials table names", () => {
    for (const provider of configured()) {
      expect(provider.requiredKey).toBe(
        VIDEO_PROVIDER_CREDENTIALS[provider.id].requiredKey,
      );
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

describe("raw-HTTP providers normalize their base URL", () => {
  it("defaults when none is configured", () => {
    // Behavior formerly owned by createVideoProviderSdks; asserted here now
    // that each provider normalizes its own.
    expect(
      new KlingVideoProvider({ apiKey: "k" }) as unknown as {
        baseUrl: string;
      },
    ).toMatchObject({ baseUrl: DEFAULT_KLING_BASE_URL });
    expect(
      new VeoVideoProvider({ apiKey: "k" }) as unknown as { baseUrl: string },
    ).toMatchObject({ baseUrl: DEFAULT_VEO_BASE_URL });
  });

  it("trims trailing slashes off a configured base URL", () => {
    expect(
      new KlingVideoProvider({
        apiKey: "k",
        baseUrl: "https://kling.example.com//",
      }) as unknown as { baseUrl: string },
    ).toMatchObject({ baseUrl: "https://kling.example.com" });
    expect(
      new VeoVideoProvider({
        apiKey: "k",
        baseUrl: "https://gemini.example.com/v1//",
      }) as unknown as { baseUrl: string },
    ).toMatchObject({ baseUrl: "https://gemini.example.com/v1" });
  });
});
