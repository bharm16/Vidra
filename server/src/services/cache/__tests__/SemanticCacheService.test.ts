import { describe, expect, it, vi } from "vitest";
import { SemanticCacheEnhancer } from "../SemanticCacheService";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
    }),
  },
}));

describe("SemanticCacheEnhancer", () => {
  it("generates deterministic semantic keys for equivalent inputs", () => {
    const keyA = SemanticCacheEnhancer.generateSemanticKey("prompt", {
      text: "Please make this cinematic",
      style: "noir",
    });
    const keyB = SemanticCacheEnhancer.generateSemanticKey("prompt", {
      text: "please   make this cinematic",
      style: "noir",
    });

    expect(keyA).toBe(keyB);
    expect(keyA).toMatch(/^prompt:semantic:[a-f0-9]{16}$/);
  });

  it("supports disabling normalization behaviors for key generation", () => {
    const keyA = SemanticCacheEnhancer.generateSemanticKey(
      "prompt",
      { text: "HELLO WORLD" },
      { ignoreCase: false },
    );
    const keyB = SemanticCacheEnhancer.generateSemanticKey(
      "prompt",
      { text: "hello world" },
      { ignoreCase: false },
    );

    expect(keyA).not.toBe(keyB);
  });
});
