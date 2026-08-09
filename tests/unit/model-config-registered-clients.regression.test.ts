import { describe, it, expect } from "vitest";
import { ModelConfig } from "@config/modelConfig";
import {
  REGISTERED_LLM_CLIENTS,
  isRegisteredLlmClient,
} from "@config/llmClients";

/**
 * Bug 2026-08-08: `llm_judge_general` shipped with `client: "anthropic"` and
 * `model: "claude-sonnet-4"`. No Anthropic adapter exists, the DI layer never
 * registers that client, and there is no API key for it. It did not crash —
 * `ExecutionPlan` remaps an unavailable primary to an available provider — so
 * the declared judge model simply never ran, silently, on the LLM-as-judge
 * surface behind /api/suggestions. `llm_judge_video` named it as a fallback
 * too, which left that operation with no viable second provider at all.
 *
 * `scripts/validate-shared-catalogs.ts` gained the same check, but that runs
 * under `verify:drift` — which is NOT one of the four commit-protocol gates.
 * This test puts the invariant in `test:unit`, where a bad edit is caught
 * before the commit rather than before the deploy.
 */
describe("ModelConfig routing targets are registered clients", () => {
  it("names a registered client for every operation", () => {
    const offenders = Object.entries(ModelConfig)
      .filter(([, entry]) => !isRegisteredLlmClient(entry.client))
      .map(([operation, entry]) => `${operation} -> ${entry.client}`);

    expect(
      offenders,
      `registered: ${REGISTERED_LLM_CLIENTS.join(", ")}`,
    ).toEqual([]);
  });

  it("names a registered client for every declared fallback", () => {
    const offenders = Object.entries(ModelConfig)
      .map(([operation, entry]) => ({
        operation,
        fallbackTo: (entry as { fallbackTo?: string }).fallbackTo,
      }))
      .filter(
        ({ fallbackTo }) => fallbackTo && !isRegisteredLlmClient(fallbackTo),
      )
      .map(({ operation, fallbackTo }) => `${operation} -> ${fallbackTo}`);

    expect(
      offenders,
      `registered: ${REGISTERED_LLM_CLIENTS.join(", ")}`,
    ).toEqual([]);
  });

  it("never declares a fallback identical to its primary", () => {
    for (const [operation, entry] of Object.entries(ModelConfig)) {
      const fallbackTo = (entry as { fallbackTo?: string }).fallbackTo;
      if (fallbackTo) {
        expect(fallbackTo, operation).not.toBe(entry.client);
      }
    }
  });
});
