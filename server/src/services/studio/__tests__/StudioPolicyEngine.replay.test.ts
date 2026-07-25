import { describe, it, expect, beforeAll } from "vitest";
import {
  STUDIO_TURN_SCENARIOS,
  STUDIO_TURN_SCENARIO,
  STUDIO_TURN_SURFACE,
} from "@scripts/replay/studioTurnScenarios";
import { CassetteStore } from "@server/replay/CassetteStore";
import { RecordReplayAiService } from "@server/replay/RecordReplayAiService";
import { StudioPolicyEngine } from "../StudioPolicyEngine";

/**
 * Replays the recorded gpt-4o-mini studio_turn fixtures (behaviors 1, 2,
 * 3, 9) with ZERO network: every client in the seam is null, so any code
 * path that tried a live provider would throw. Because the scenarios are
 * shared with the record script, the prompts are byte-identical and every
 * request key must hit the cassette — a miss means the prompt-assembly
 * code drifted from what was recorded (re-record with
 * scripts/replay/record-studio-scenarios.ts).
 */
describe("StudioPolicyEngine (recorded fixtures)", () => {
  let engine: StudioPolicyEngine;

  beforeAll(() => {
    const store = new CassetteStore();
    const loaded = store.loadAll();
    expect(loaded.files).toBeGreaterThan(0);

    const ai = new RecordReplayAiService({
      clients: { openai: null, groq: null, qwen: null, gemini: null },
      mode: "replay",
      store,
    });
    engine = new StudioPolicyEngine({ ai });
  });

  it.each(STUDIO_TURN_SCENARIOS.map((scenario) => [scenario.name, scenario]))(
    "%s satisfies its behavior invariants offline",
    async (_name, scenario) => {
      const decision = await engine.decideTurn(scenario.context);
      expect(scenario.verify(decision)).toEqual([]);
    },
  );

  it("records under the studio-turn surface and m3-behaviors scenario", () => {
    // Constants are part of the record/replay contract; renaming them
    // orphans the committed fixture files.
    expect(STUDIO_TURN_SURFACE).toBe("studio-turn");
    expect(STUDIO_TURN_SCENARIO).toBe("m3-behaviors");
  });
});
