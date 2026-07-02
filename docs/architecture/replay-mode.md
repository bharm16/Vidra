# Replay Mode — contract-validated record/replay for the authoring loop

Status: **live** — seams, contracts, flag, drift gate, the golden-path
scenario pack, and the replay integration suite
(`tests/integration/replay-mode.integration.test.ts`) all ship. The suite
runs the full authoring loop offline with zero network.

## What it is

`REPLAY_MODE` (Debug flag, `off | record | replay`) puts a record/replay seam
at the two places the authoring loop leaves the process:

| Seam                           | Class                                                   | Covers                                                                                                                  |
| ------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| aiService boundary             | `server/src/replay/RecordReplayAiService.ts`            | label-spans, suggestions, optimize, motion ideas, and any nested LLM call (`video_prompt_rewrite`, `image_observation`) |
| Image preview provider adapter | `server/src/replay/RecordReplayImagePreviewProvider.ts` | first-frame preview (Replicate Flux Schnell)                                                                            |

- **record** — calls pass through to the live providers; each request/response
  pair is captured into a cassette fixture, contract-validated at capture time.
- **replay** — recorded responses are served with **zero network**. A request
  that doesn't match a recording throws `ReplayCassetteMissError`; a fixture
  that no longer satisfies the live contract throws
  `ReplayContractViolationError`. Nothing degrades silently.

Wiring lives in `server/src/config/services/replay.services.ts` (cassette
store), `llm.services.ts` (aiService seam), and
`image-generation.services.ts` (preview seam). When `REPLAY_MODE=off` both
seams resolve to the untouched live classes.

## Fixtures

`server/src/replay/fixtures/<surface>/<scenario>.json`, one cassette per
surface + scenario, `formatVersion` stamped. Entries are keyed by a sha256 of
the stable-stringified semantic request (operation + prompts — not model or
temperature, which vary by env). See
`shared/schemas/replay.schemas.ts` for the envelope and per-surface payload
contracts.

## Contract validation and drift

Fixtures are validated against the shared Zod contracts at **record and
replay time**, always resolving contract names against the live registry —
never a schema copy stored in the fixture. Consequence: changing a contract
without re-recording fails loudly. The drift gate is
`tests/unit/replay/contract-drift.test.ts`, which also validates every
committed fixture against the live contracts on each unit-test run.

To re-record after an intentional contract change: run the record script
(landing with the scenario pack) with `REPLAY_MODE=record`.

## GCP-dependent calls (stubbed / bypassed in replay)

The five golden-path surfaces touch GCP in ways the seams do not cover; the
replay integration suite handles them as follows:

- **Firebase auth** (`apiAuthMiddleware` on every `/api/*` route): bypassed by
  the API-key auth path (`x-api-key` + `API_KEY`/`ALLOWED_API_KEYS` env) — no
  token verification, no GCP.
- **Span-labeling provider**: `span_labeling` defaults to Gemini (GCP).
  Recording uses the active non-Gemini provider via `SPAN_PROVIDER=qwen`
  (Groq-hosted), which the config already supports.
- **First-frame preview persistence** (GCS via `imageAssetStore`/
  `storageService`), **credits** (Firestore `userCreditService`), and
  **idempotency** (Firestore `requestIdempotencyService`): documented as the
  remaining GCP-dependent calls on the preview route; the replay suite's
  approach to each is finalized with the suite itself (next increment).
- **Telemetry** (`llmCallTelemetryService`, Firestore-backed): only injected
  in record mode; replay mode runs without it.

## Running

Replay suite (offline, no credentials needed — this is the per-change gate):

```bash
PORT=0 npx vitest run tests/integration/replay-mode.integration.test.ts \
  --config config/test/vitest.integration.config.js
```

Re-record the golden scenario pack (live provider calls; needs OpenAI/Groq/
Replicate keys in `.env`; never uses Gemini/GCP):

```bash
REPLAY_MODE=record NODE_ENV=test \
SPAN_PROVIDER=qwen SPAN_MODEL=qwen/qwen3-32b \
API_KEY=replay-golden-key ALLOWED_API_KEYS=replay-golden-key \
npx tsx --tsconfig server/tsconfig.json scripts/replay/record-golden-scenarios.ts
```

Canonical inputs live in `scripts/replay/goldenScenarios.ts` — the recorder
and the suite must send byte-identical bodies, so change inputs there only.
Gotcha: `ModelConfig` snapshots env at module load — recording sets
`SPAN_PROVIDER=qwen` before boot, and the suite mirrors it via dynamic
imports after env setup. A prompt-template or provider-default change makes
replay miss loudly; re-record to resolve.

Follow-up for the main checkout (worktrees must not run servers or e2e):

```bash
# e2e against a replay-mode server — run from the MAIN checkout only
REPLAY_MODE=replay npm run server:e2e &
npm run test:e2e
```
