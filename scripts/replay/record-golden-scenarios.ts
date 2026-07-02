#!/usr/bin/env tsx
/**
 * Record the golden-path scenario pack for replay mode.
 *
 * Boots the real app with REPLAY_MODE=record and drives the four LLM surfaces
 * through their actual HTTP routes (so the recorded aiService requests are
 * byte-identical to what the replay integration suite will produce), then
 * exercises first-frame preview at the provider seam (its route needs
 * Firestore credits + GCS, which record/replay does not cover).
 *
 * Usage (from the repo root — required env is asserted below):
 *
 *   REPLAY_MODE=record NODE_ENV=test \
 *   SPAN_PROVIDER=qwen SPAN_MODEL=qwen/qwen3-32b \
 *   API_KEY=replay-golden-key \
 *   npx tsx --tsconfig server/tsconfig.json scripts/replay/record-golden-scenarios.ts
 *
 * SPAN_PROVIDER=qwen keeps recording off Gemini (GCP). Fixtures land in
 * server/src/replay/fixtures/<surface>/golden-path.json.
 */

import 'dotenv/config';
import type { AddressInfo } from 'node:net';
import {
  GOLDEN_SCENARIO,
  HTTP_SCENARIOS,
  PREVIEW_SCENARIO,
} from './goldenScenarios.ts';

function assertEnv(name: string, expected?: string): void {
  const actual = process.env[name];
  if (!actual || (expected && actual !== expected)) {
    console.error(
      `FATAL: ${name} must be set${expected ? ` to "${expected}"` : ''} (got "${actual ?? ''}"). ` +
        `See the usage block at the top of this script.`
    );
    process.exit(2);
  }
}

assertEnv('REPLAY_MODE', 'record');
assertEnv('NODE_ENV', 'test');
assertEnv('API_KEY');
if (process.env.SPAN_PROVIDER === 'gemini' || !process.env.SPAN_PROVIDER) {
  console.error(
    'FATAL: SPAN_PROVIDER must name a non-Gemini provider (use qwen) — GCP is off-limits for recording.'
  );
  process.exit(2);
}

const { configureServices, initializeServices } = await import(
  '../../server/src/config/services.config.ts'
);
const { createApp } = await import('../../server/src/app.ts');

const container = await configureServices();
await initializeServices(container);

const store = container.resolve('replayCassetteStore') as
  | import('../../server/src/replay/CassetteStore.ts').CassetteStore
  | null;
if (!store) {
  console.error('FATAL: replayCassetteStore is null — REPLAY_MODE not active?');
  process.exit(2);
}

const app = createApp(container);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolveListen) =>
  server.once('listening', () => resolveListen())
);
const { port } = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${port}`;
console.log(`Recording against ${baseUrl}`);

let failures = 0;

for (const scenario of HTTP_SCENARIOS) {
  store.beginScenario(scenario.surface, GOLDEN_SCENARIO);
  console.log(`\n→ ${scenario.surface}: POST ${scenario.path}`);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${scenario.path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.API_KEY as string,
      },
      body: JSON.stringify(scenario.body),
      signal: AbortSignal.timeout(180_000),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      failures += 1;
      console.error(
        `✗ ${scenario.surface} returned ${response.status}: ${bodyText.slice(0, 500)}`
      );
      continue;
    }
    console.log(
      `✓ ${scenario.surface} ok in ${Date.now() - startedAt}ms (${bodyText.length} bytes)`
    );
  } catch (error) {
    failures += 1;
    console.error(`✗ ${scenario.surface} failed:`, error);
  }
}

// First-frame preview at the provider seam (RecordReplayImagePreviewProvider
// in record mode — real Replicate call, no GCS/Firestore involved).
store.beginScenario(PREVIEW_SCENARIO.surface, GOLDEN_SCENARIO);
console.log(`\n→ ${PREVIEW_SCENARIO.surface}: provider.generatePreview`);
try {
  const provider = container.resolve('replicateFluxSchnellProvider') as {
    generatePreview: (request: unknown) => Promise<{ imageUrl: string }>;
  } | null;
  if (!provider) {
    throw new Error('replicateFluxSchnellProvider is null (missing token?)');
  }
  const result = await provider.generatePreview(PREVIEW_SCENARIO.request);
  console.log(`✓ first-frame-preview ok: ${result.imageUrl.slice(0, 80)}...`);
} catch (error) {
  failures += 1;
  console.error('✗ first-frame-preview failed:', error);
}

if (failures > 0) {
  console.error(`\n${failures} surface(s) failed — NOT flushing fixtures.`);
  server.close();
  process.exit(1);
}

const written = store.flush();
console.log('\nCassettes written:');
for (const path of written) {
  console.log(`  ${path}`);
}
server.close();
process.exit(0);
