import { describe, expect, it } from "vitest";
import {
  isPlaceholderCredentialValue,
  requiredCredentials,
  runCredentialPreflight,
} from "../preflight";

/**
 * The credential preflight (issue #140): "Missing credentials … produce an
 * explicit non-verification result … the smoke reports which are absent."
 */

const OPENAI_ENV = {
  FAL_KEY: "fal-key",
  OPENAI_API_KEY: "openai-key",
  REPLICATE_API_TOKEN: "replicate-token",
};

describe("credential preflight", () => {
  it("with every credential present, nothing is missing", () => {
    const result = runCredentialPreflight({
      studioTurnClient: "openai",
      env: OPENAI_ENV,
    });
    expect(result.missing).toEqual([]);
    // The requirement list documents which call needs which secret.
    expect(result.required).toEqual([
      {
        credential: "FAL_KEY",
        alternatives: ["FAL_KEY", "FAL_API_KEY"],
        legs: ["sketch-frame"],
      },
      {
        credential: "OPENAI_API_KEY",
        alternatives: ["OPENAI_API_KEY"],
        legs: ["studio-turn"],
      },
      {
        credential: "REPLICATE_API_TOKEN",
        alternatives: ["REPLICATE_API_TOKEN"],
        legs: ["studio-edit-image", "first-frame"],
      },
    ]);
  });

  it("reports EVERY absent credential, with the legs it blocks", () => {
    const result = runCredentialPreflight({
      studioTurnClient: "openai",
      env: { OPENAI_API_KEY: "openai-key" },
    });
    expect(result.missing).toEqual([
      { credential: "FAL_KEY", legs: ["sketch-frame"] },
      {
        credential: "REPLICATE_API_TOKEN",
        legs: ["studio-edit-image", "first-frame"],
      },
    ]);
  });

  it("the relay's FAL_API_KEY alias satisfies the fal requirement", () => {
    const result = runCredentialPreflight({
      studioTurnClient: "openai",
      env: { ...OPENAI_ENV, FAL_KEY: undefined, FAL_API_KEY: "alias-key" },
    });
    expect(result.missing).toEqual([]);
  });

  it("a placeholder-shaped value counts as absent — the nightly must not spend against a templated secret", () => {
    for (const bad of ["${FAL_KEY}", "$FAL_KEY", "undefined", "null", "  ", ""]) {
      const result = runCredentialPreflight({
        studioTurnClient: "openai",
        env: { ...OPENAI_ENV, FAL_KEY: bad },
      });
      expect(
        result.missing.some((entry) => entry.credential === "FAL_KEY"),
        `expected "${bad}" to count as absent`,
      ).toBe(true);
    }
  });

  it("follows the studio turn's configured CLIENT, not a hardcoded provider", () => {
    // gemini: GEMINI_API_KEY or GOOGLE_API_KEY satisfies the studio leg.
    const gemini = runCredentialPreflight({
      studioTurnClient: "gemini",
      env: {
        FAL_KEY: "fal-key",
        GEMINI_API_KEY: "g",
        REPLICATE_API_TOKEN: "r",
      },
    });
    expect(gemini.missing).toEqual([]);

    // The same env without Gemini keys is missing the studio leg's key —
    // OPENAI_API_KEY does not cover a gemini-routed studio turn.
    const geminiMissing = runCredentialPreflight({
      studioTurnClient: "gemini",
      env: { ...OPENAI_ENV },
    });
    expect(geminiMissing.missing).toEqual([
      { credential: "GEMINI_API_KEY", legs: ["studio-turn"] },
    ]);

    // qwen/groq route to GROQ_API_KEY.
    const qwen = runCredentialPreflight({
      studioTurnClient: "qwen",
      env: {
        FAL_KEY: "fal-key",
        GROQ_API_KEY: "g",
        REPLICATE_API_TOKEN: "r",
      },
    });
    expect(qwen.missing).toEqual([]);
  });

  it("requiredCredentials is exported so the PR can document the secret list", () => {
    const requirements = requiredCredentials({
      studioTurnClient: "openai",
      env: {},
    });
    expect(requirements.map((entry) => entry.credential)).toEqual([
      "FAL_KEY",
      "OPENAI_API_KEY",
      "REPLICATE_API_TOKEN",
    ]);
  });
});

describe("placeholder detection", () => {
  it("mirrors the relay resolver's placeholder rules", () => {
    expect(isPlaceholderCredentialValue(undefined)).toBe(true);
    expect(isPlaceholderCredentialValue("real-key")).toBe(false);
    expect(isPlaceholderCredentialValue("${{ secrets.FAL_KEY }}")).toBe(true);
    expect(isPlaceholderCredentialValue("$GITHUB_TOKEN")).toBe(true);
    expect(isPlaceholderCredentialValue("null")).toBe(true);
  });
});
