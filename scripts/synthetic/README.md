# Synthetic Harness

Generates `source: "synthetic"` telemetry events for the three judgeable surfaces (suggestions, optimize, span-labeling) without booting the HTTP server. Each driver invokes the real production service code in-process; events flow into PostHog with the same shape real user traffic produces. See `docs/superpowers/specs/2026-05-10-source-discriminator-and-harness-design.md` for the original design.

Sub-project #1 of the [Measurement Program](../../docs/superpowers/programs/measurement.md). Pre-launch the harness is the **only** way to produce operational telemetry — there are no real users yet.

## Quick start

```bash
# Run all three surfaces
npm run synthetic

# Just one surface
npm run synthetic -- --only suggestions

# Score the events afterward
npm run judge:run -- --surface suggestions
```

`POSTHOG_API_KEY` must be set in `.env` (loaded automatically). When unset, the harness runs in no-op mode — useful for dry-runs in CI and local-only smoke tests.

### Event count expectations

20 fixture prompts × 3 surfaces ≈ **165 events per full run**. Per-surface breakdown:

| Surface       | Surface event           | LLM calls per prompt      |
| ------------- | ----------------------- | ------------------------- |
| `optimize`    | `optimize.completed`    | 4                         |
| `suggestions` | `suggestions.completed` | 1                         |
| `span-labels` | `label-spans.completed` | 1 (skipped on cache hits) |

If a run lands materially below this, check that `POSTHOG_API_KEY` is set and that no surface short-circuited on a cache hit you didn't expect.

## Per-surface model swap

Each surface routes its primary LLM call through `server/src/config/modelConfig.ts`, which already honors env vars per operation:

| Surface       | Provider env var    | Model env var    | Default                        |
| ------------- | ------------------- | ---------------- | ------------------------------ |
| suggestions   | `ENHANCE_PROVIDER`  | `ENHANCE_MODEL`  | `qwen` / `qwen/qwen3-32b`      |
| optimize      | `OPTIMIZE_PROVIDER` | `OPTIMIZE_MODEL` | `openai` / `gpt-4o-2024-08-06` |
| span-labeling | `SPAN_PROVIDER`     | `SPAN_MODEL`     | `gemini` / `gemini-2.5-flash`  |

Override per run, e.g. to test Gemini on suggestions:

```bash
ENHANCE_PROVIDER=gemini ENHANCE_MODEL=gemini-2.5-flash npm run synthetic -- --only suggestions
```

The `--variant-tag <name>` flag stamps every emitted event with `modelVariant = "<name>"`, so PostHog dashboards can group by which model produced them. Without the flag, `modelVariant` emits as null and existing dashboard filters see no change.

## Matrix mode

Compare multiple models in one workflow:

```bash
# List available presets
npm run synthetic:matrix -- --list-variants

# Run two variants against suggestions (sequential subprocesses)
npm run synthetic:matrix -- --only suggestions --variants qwen,gemini

# Score the events
npm run judge:run -- --surface suggestions

# Print the comparison table
npm run synthetic:report-matrix -- --only suggestions --since 30m
```

Cost note: each variant burns ~$0.30 in synthetic + judge calls. A 5-variant matrix is ~$1.50.

Presets live in `scripts/synthetic/variants.ts`. Add new presets by appending to the `VARIANTS` array; the registry validates env-var names against a whitelist at startup.

## Fixtures

`fixtures/prompts.json` contains 20 hand-picked prompts covering the span taxonomy (subject, camera, lighting, motion, style, action, setting). Refresh by editing the file directly when the taxonomy changes meaningfully — they're not generated. The suggestions fixture's `highlights[]` arrays (authored by Sub-project A's Layer 5 fix) are validated against `shared/taxonomy.ts` at startup via `utils/fixture-validation.ts`.

## CI

`.github/workflows/synthetic-harness.yml` runs on `workflow_dispatch`; the `schedule:` cron is committed but commented out. Uncomment to enable nightly baseline runs. The workflow only needs `POSTHOG_API_KEY` as a repo secret — no other configuration.

## Architecture

- `run-harness.ts` — single-surface entry point. Reads `--only` + `--variant-tag` flags. Sequential per-surface driver invocations.
- `drivers/*.driver.ts` — per-surface drivers. Each invokes the production service code in-process via `aiService`; emits telemetry events directly through the same PostHogClient the server uses.
- `utils/aiService.ts` — mirrors the production DI registration. Reads provider env vars to construct adapter instances.
- `utils/fixture-validation.ts` — validates the suggestions fixture's `highlights[]` array against `shared/taxonomy.ts` at startup.
- `variants.ts` — typed preset registry for matrix runs.
- `run-matrix.ts` — matrix orchestrator. Subprocess per variant, sequential, doesn't abort on per-variant failure.
- `report-matrix.ts` — post-matrix comparison report. HogQL query against PostHog grouped by `modelVariant`.

### Why direct emission (not HTTP)

The earlier HTTP version of this harness fired anonymous requests at production endpoints. That hit two problems:

1. The endpoints require Firebase auth — anonymous requests get `401` and zero events emit.
2. Going through HTTP exercises code paths (auth, CORS, rate limiting) that don't help validate the **telemetry pipeline + dashboards**, which is what we actually want.

Direct emission constructs the telemetry services in-process and emits events through the same code path real requests use. The events that land in PostHog are structurally identical to production events — minus the HTTP layer the harness doesn't care about.

## Related docs

- Measurement Program (parent): `docs/superpowers/programs/measurement.md`
- Spec: `docs/superpowers/specs/2026-05-21-synthetic-model-matrix-design.md`
- Plan: `docs/superpowers/plans/2026-05-21-synthetic-model-matrix.md`
- Source discriminator design: `docs/superpowers/specs/2026-05-10-source-discriminator-and-harness-design.md`
- Quality judge: `scripts/quality-judge/` (run-judge.ts source)
