import { describe, it, expect, beforeAll } from "vitest";
import { STUDIO_TURN_SCENARIOS } from "@scripts/replay/studioTurnScenarios";
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
      // Hooks force the STREAMING path — the same one the record script
      // used, so the stream:true request keys hit the cassette. Replay
      // serves the recording as one chunk; the scanner still extracts the
      // thinking deltas from it.
      const deltas: string[] = [];
      const decision = await engine.decideTurn(scenario.context, {
        onThinkingDelta: (delta) => deltas.push(delta),
      });
      expect(scenario.verify(decision)).toEqual([]);
      if (
        decision.action === "generate" ||
        decision.action === "edit" ||
        decision.action === "transform"
      ) {
        // The streamed characters reassemble the decision's thinking.
        expect(deltas.join("")).toBe(decision.thinking);
      }
    },
  );
});
