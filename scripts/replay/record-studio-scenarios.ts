#!/usr/bin/env tsx
/**
 * Record the Studio M3 conversation-policy fixtures.
 *
 * Boots the DI container with REPLAY_MODE=record (aiService becomes the
 * RecordReplayAiService seam) and drives StudioPolicyEngine.decideTurn
 * directly over the shared scenario pack — no HTTP, no Firestore writes,
 * no Replicate spend; the only live calls are studio_turn (gpt-4o-mini).
 *
 * Every scenario's decision is checked against its behavior invariants
 * before anything is flushed: a recording where the model fumbled a
 * behavior never becomes a fixture.
 *
 * Usage (from the repo root):
 *
 *   REPLAY_MODE=record NODE_ENV=test \
 *   npx tsx --tsconfig server/tsconfig.json scripts/replay/record-studio-scenarios.ts
 */

import "dotenv/config";
import {
  STUDIO_TURN_SCENARIOS,
  STUDIO_TURN_SCENARIO,
  STUDIO_TURN_SURFACE,
} from "./studioTurnScenarios.ts";

function assertEnv(name: string, expected?: string): void {
  const actual = process.env[name];
  if (!actual || (expected && actual !== expected)) {
    console.error(
      `FATAL: ${name} must be set${expected ? ` to "${expected}"` : ""} (got "${actual ?? ""}"). ` +
        `See the usage block at the top of this script.`,
    );
    process.exit(2);
  }
}

assertEnv("REPLAY_MODE", "record");
assertEnv("NODE_ENV", "test");
assertEnv("OPENAI_API_KEY");

const { configureServices, initializeServices } = await import(
  "../../server/src/config/services.config.ts"
);
const { StudioPolicyEngine } = await import(
  "../../server/src/services/studio/StudioPolicyEngine.ts"
);

const container = await configureServices();
await initializeServices(container);

const store = container.resolve("replayCassetteStore") as
  | import("../../server/src/replay/CassetteStore.ts").CassetteStore
  | null;
if (!store) {
  console.error("FATAL: replayCassetteStore is null — REPLAY_MODE not active?");
  process.exit(2);
}

const aiService = container.resolve(
  "aiService",
) as import("../../server/src/services/studio/StudioPolicyEngine.ts").StudioAIService;

const engine = new StudioPolicyEngine({ ai: aiService });

store.beginScenario(STUDIO_TURN_SURFACE, STUDIO_TURN_SCENARIO);

let failures = 0;
for (const scenario of STUDIO_TURN_SCENARIOS) {
  console.log(`\n→ ${scenario.name} (${scenario.behaviors})`);
  const startedAt = Date.now();
  try {
    // Streaming hooks: records via the stream seam (the path production
    // uses) and prints the realtime deltas for eyeball proof.
    let streamedThinking = "";
    const decision = await engine.decideTurn(scenario.context, {
      onThinkingStart: () => {
        streamedThinking = "";
      },
      onThinkingDelta: (delta) => {
        streamedThinking += delta;
        process.stdout.write(delta);
      },
    });
    if (streamedThinking) process.stdout.write("\n");
    const violations = scenario.verify(decision);
    if (violations.length > 0) {
      failures += 1;
      console.error(`✗ ${scenario.name} violated its behavior invariants:`);
      for (const violation of violations) console.error(`    - ${violation}`);
      continue;
    }
    console.log(
      `✓ ${scenario.name} → ${decision.action} in ${Date.now() - startedAt}ms`,
    );
    console.log(`  ${JSON.stringify(decision).slice(0, 400)}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${scenario.name} failed:`, error);
  }
}

if (failures > 0) {
  console.error(`\n${failures} scenario(s) failed — NOT flushing fixtures.`);
  process.exit(1);
}

const written = store.flush();
console.log("\nCassettes written:");
for (const path of written) {
  console.log(`  ${path}`);
}
process.exit(0);
