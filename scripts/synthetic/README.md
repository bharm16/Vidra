# Synthetic Harness

Generates `source: "synthetic"` telemetry events for the three judgeable surfaces (suggestions, optimize, span-labeling) without booting the HTTP server. Each driver invokes the real production service code in-process; events flow into PostHog with the same shape real user traffic produces. See `docs/superpowers/specs/2026-05-10-source-discriminator-and-harness-design.md` for the original design.

## Quick start

```bash
# Run all three surfaces
npm run synthetic

# Just one surface
npm run synthetic -- --only suggestions

# Score the events afterward
npm run judge:run -- --surface suggestions
```

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

## Architecture

- `run-harness.ts` — single-surface entry point. Reads `--only` + `--variant-tag` flags. Sequential per-surface driver invocations.
- `drivers/*.driver.ts` — per-surface drivers. Each invokes the production service code in-process via `aiService`; emits telemetry events directly through the same PostHogClient the server uses.
- `utils/aiService.ts` — mirrors the production DI registration. Reads provider env vars to construct adapter instances.
- `utils/fixture-validation.ts` — validates the suggestions fixture's `highlights[]` array against `shared/taxonomy.ts` at startup.
- `variants.ts` — typed preset registry for matrix runs.
- `run-matrix.ts` — matrix orchestrator. Subprocess per variant, sequential, doesn't abort on per-variant failure.
- `report-matrix.ts` — post-matrix comparison report. HogQL query against PostHog grouped by `modelVariant`.

## Related docs

- Spec: `docs/superpowers/specs/2026-05-21-synthetic-model-matrix-design.md`
- Plan: `docs/superpowers/plans/2026-05-21-synthetic-model-matrix.md`
- Quality judge: `scripts/quality-judge/` (run-judge.ts source)
