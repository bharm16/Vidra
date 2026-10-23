import { afterEach, describe, expect, it, vi } from "vitest";

// Each text operation's model is chosen in config/modelConfig.ts. The old
// per-operation overrides skipped review, CI and the span golden-set eval.
const RETIRED_OVERRIDES = [
  "OPTIMIZE", "IMPROVE_WORDING", "ENHANCE", "SPAN", "VIDEO_PROMPT_IR",
  "VIDEO_PROMPT_REWRITE", "STUDIO_TURN", "JUDGE", "JUDGE_GENERAL",
].flatMap((operation) => [`${operation}_PROVIDER`, `${operation}_MODEL`]);

async function loadModelConfig(): Promise<Record<string, { client: string; model: string }>> {
  vi.resetModules();
  return (await import("@config/modelConfig")).ModelConfig as unknown as Record<string, { client: string; model: string }>;
}

describe("text operation models are chosen in code", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("ignores the retired environment overrides", async () => {
    const chosen = await loadModelConfig();
    for (const name of RETIRED_OVERRIDES) vi.stubEnv(name, name.endsWith("_PROVIDER") ? "groq" : "env-model");

    const withOverrides = await loadModelConfig();

    expect(withOverrides).toEqual(chosen);
    expect(withOverrides.improve_wording).toMatchObject({ client: "anthropic", model: "claude-haiku-5-5" });
  });
});
