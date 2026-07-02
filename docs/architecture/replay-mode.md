# Replay Mode — contract-validated record/replay for the authoring loop

Status: **in progress** — seams, contracts, flag, and drift gate are live; the
golden-path scenario pack and the replay integration suite land next.

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

```bash
REPLAY_MODE=replay NODE_ENV=test <boot the app / run the replay suite>
```

Follow-up for the main checkout (worktrees must not run servers or e2e):

```bash
# e2e against a replay-mode server — run from the MAIN checkout only
REPLAY_MODE=replay npm run server:e2e &
npm run test:e2e
```
