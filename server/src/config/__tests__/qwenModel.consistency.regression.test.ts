/**
 * Regression: the Qwen model id must be one id, everywhere.
 *
 * Groq retired qwen/qwen3-32b (404: "model does not exist or you do not
 * have access") while SIX separate places hardcoded it: the env-schema
 * default, three modelConfig entry defaults, the llmCosts rate key,
 * GroqQwenAdapter's constructor default, core.services' ServiceConfig
 * fallback, and ExecutionPlan's provider settings. The boot health check
 * then disabled the whole Qwen adapter every startup, silently failing
 * the enhancement path over to its fallback provider.
 *
 * DEFAULT_QWEN_MODEL is now the single source. These tests pin the places
 * that cannot import it (layering keeps clients/ from importing config/)
 * and the ones that key by literal string, so the next model swap is one
 * constant — not an archaeology dig.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_QWEN_MODEL, ModelConfig } from "../modelConfig.ts";
import { calculateLLMCost } from "../llmCosts.ts";
import { GroqQwenAdapter } from "@clients/adapters/GroqQwenAdapter.ts";

describe("Qwen model id consistency (regression)", () => {
  it("every qwen-routed operation resolves to DEFAULT_QWEN_MODEL", () => {
    for (const [operation, entry] of Object.entries(ModelConfig)) {
      if (entry.client === "qwen") {
        expect
          .soft(entry.model, `operation ${operation}`)
          .toBe(DEFAULT_QWEN_MODEL);
      }
      if (entry.fallbackTo === "qwen" && entry.fallbackConfig) {
        expect
          .soft(entry.fallbackConfig.model, `fallback of ${operation}`)
          .toBe(DEFAULT_QWEN_MODEL);
      }
    }
  });

  it("llmCosts has an explicit (non-fallback) rate for DEFAULT_QWEN_MODEL", () => {
    // Groq pricing as of 2026-07: $0.60/M input, $3.00/M output. If pricing
    // changes, update llmCosts.ts and this pin together.
    expect(calculateLLMCost(DEFAULT_QWEN_MODEL, 1_000_000, 0)).toBeCloseTo(
      0.6,
      10,
    );
    expect(calculateLLMCost(DEFAULT_QWEN_MODEL, 0, 1_000_000)).toBeCloseTo(
      3.0,
      10,
    );
  });

  it("the retired model id survives nowhere in server source as a literal", async () => {
    const serverSrc = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const offenders: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === "fixtures") {
            continue;
          }
          await walk(full);
        } else if (/\.(ts|tsx|json)$/.test(entry.name)) {
          const text = await readFile(full, "utf8");
          // Quoted occurrences only — prose in comments may cite the
          // retired id as history; code literals may not. The needle is
          // assembled so this file itself never contains the quoted form.
          const needle = ['"', "qwen/", "qwen3-32b", '"'].join("");
          if (text.includes(needle)) {
            offenders.push(full);
          }
        }
      }
    };
    await walk(serverSrc);
    expect(offenders).toEqual([]);
  });

  it("GroqQwenAdapter's constructor default matches DEFAULT_QWEN_MODEL", () => {
    const adapter = new GroqQwenAdapter({ apiKey: "test-key" });
    // The adapter cannot import config/ (layering), so its literal default
    // is pinned here instead.
    expect((adapter as unknown as { defaultModel: string }).defaultModel).toBe(
      DEFAULT_QWEN_MODEL,
    );
  });
});
