import { describe, it, expect, vi } from "vitest";
import {
  createReplicateVideoClient,
  resolveVeoCredential,
  normalizeBaseUrl,
} from "@clients/videoProviderClients";
vi.mock("replicate", () => ({
  default: class {
    constructor(readonly options: { auth: string }) {}
  },
}));
describe("current video provider clients", () => {
  it("constructs Replicate with its injected credential", () => {
    const log = { warn: vi.fn() };
    expect(createReplicateVideoClient("replicate-token", log)).toMatchObject({
      options: { auth: "replicate-token" },
    });
    expect(log.warn).not.toHaveBeenCalled();
  });
  it("passes Veo's credential through", () => {
    expect(resolveVeoCredential("gemini-key", { warn: vi.fn() })).toBe(
      "gemini-key",
    );
  });
  it("reports both missing provider credentials", () => {
    const log = { warn: vi.fn() };
    expect(createReplicateVideoClient(undefined, log)).toBeNull();
    expect(resolveVeoCredential(undefined, log)).toBeNull();
    expect(log.warn).toHaveBeenCalledTimes(2);
  });
  it("normalizes raw HTTP base URLs", () => {
    expect(normalizeBaseUrl("https://veo.example.com///", "fallback")).toBe(
      "https://veo.example.com",
    );
    expect(normalizeBaseUrl(undefined, "https://default.example.com/")).toBe(
      "https://default.example.com",
    );
  });
});
