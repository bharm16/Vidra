import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createLumaVideoClient,
  createReplicateVideoClient,
  createSoraVideoClient,
  normalizeBaseUrl,
  resolveKlingCredential,
  resolveVeoCredential,
} from "@clients/videoProviderClients";
import { DEFAULT_KLING_BASE_URL } from "@services/video-generation/providers/klingProvider";
import { DEFAULT_VEO_BASE_URL } from "@services/video-generation/providers/veoProvider";

const openAIInstances: Array<{ apiKey: string }> = [];
const replicateInstances: Array<{ auth: string }> = [];
const lumaInstances: Array<{ authToken: string }> = [];

vi.mock("openai", () => ({
  default: class MockOpenAI {
    apiKey: string;
    constructor(opts: { apiKey: string }) {
      this.apiKey = opts.apiKey;
      openAIInstances.push({ apiKey: opts.apiKey });
    }
  },
}));

vi.mock("replicate", () => ({
  default: class MockReplicate {
    auth: string;
    constructor(opts: { auth: string }) {
      this.auth = opts.auth;
      replicateInstances.push({ auth: opts.auth });
    }
  },
}));

vi.mock("lumaai", () => ({
  LumaAI: class MockLumaAI {
    authToken: string;
    constructor(opts: { authToken: string }) {
      this.authToken = opts.authToken;
      lumaInstances.push({ authToken: opts.authToken });
    }
  },
}));

const makeLog = () => ({ warn: vi.fn() });

beforeEach(() => {
  openAIInstances.length = 0;
  replicateInstances.length = 0;
  lumaInstances.length = 0;
});

describe("video provider client factories", () => {
  it("constructs each SDK from its own credential", () => {
    const log = makeLog();

    expect(createReplicateVideoClient("replicate-token", log)).not.toBeNull();
    expect(createSoraVideoClient("openai-key", log)).not.toBeNull();
    expect(createLumaVideoClient("luma-key", log)).not.toBeNull();

    expect(replicateInstances).toEqual([{ auth: "replicate-token" }]);
    expect(openAIInstances).toEqual([{ apiKey: "openai-key" }]);
    expect(lumaInstances).toEqual([{ authToken: "luma-key" }]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("passes raw credentials through for the SDK-less providers", () => {
    const log = makeLog();

    expect(resolveKlingCredential("kling-key", log)).toBe("kling-key");
    expect(resolveVeoCredential("gemini-key", log)).toBe("gemini-key");
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("emits a separate warn line for every missing key", () => {
    const log = makeLog();

    expect(createReplicateVideoClient(undefined, log)).toBeNull();
    expect(createSoraVideoClient(undefined, log)).toBeNull();
    expect(createLumaVideoClient(undefined, log)).toBeNull();
    expect(resolveKlingCredential(undefined, log)).toBeNull();
    expect(resolveVeoCredential(undefined, log)).toBeNull();

    expect(log.warn).toHaveBeenCalledTimes(5);
    expect(log.warn).toHaveBeenCalledWith(
      "REPLICATE_API_TOKEN not provided, Replicate-based video generation will be disabled",
    );
    expect(log.warn).toHaveBeenCalledWith(
      "OPENAI_API_KEY not provided, Sora video generation will be disabled",
    );
    expect(log.warn).toHaveBeenCalledWith(
      "LUMA_API_KEY or LUMAAI_API_KEY not provided, Luma video generation will be disabled",
    );
    expect(log.warn).toHaveBeenCalledWith(
      "KLING_API_KEY not provided, Kling video generation will be disabled",
    );
    expect(log.warn).toHaveBeenCalledWith(
      "GEMINI_API_KEY not provided, Veo video generation will be disabled",
    );
  });

  it("constructs no SDK when the credential is missing", () => {
    const log = makeLog();
    createReplicateVideoClient(undefined, log);
    createSoraVideoClient(undefined, log);
    createLumaVideoClient(undefined, log);

    expect(replicateInstances).toEqual([]);
    expect(openAIInstances).toEqual([]);
    expect(lumaInstances).toEqual([]);
  });
});

describe("normalizeBaseUrl", () => {
  it("falls back to the provider default when nothing is configured", () => {
    expect(normalizeBaseUrl(undefined, DEFAULT_KLING_BASE_URL)).toBe(
      DEFAULT_KLING_BASE_URL,
    );
    expect(normalizeBaseUrl("", DEFAULT_VEO_BASE_URL)).toBe(
      DEFAULT_VEO_BASE_URL,
    );
  });

  it("trims trailing slashes off configured base URLs", () => {
    // An un-trimmed operator value produces double-slash request paths
    // against a live provider.
    expect(
      normalizeBaseUrl("https://kling.example.com//", DEFAULT_KLING_BASE_URL),
    ).toBe("https://kling.example.com");
    expect(
      normalizeBaseUrl("https://gemini.example.com/v1//", DEFAULT_VEO_BASE_URL),
    ).toBe("https://gemini.example.com/v1");
  });
});
