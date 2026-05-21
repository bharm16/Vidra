# Synthetic Model Matrix — Design Spec

**Date:** 2026-05-21
**Program:** Cross-cutting tooling for the [Baseline Quality Improvement program](./2026-05-14-baseline-quality-improvement-design.md). Unblocks per-surface model experimentation (e.g., Sub-project B2's "push Qwen scene_summary emission rate" question becomes empirically answerable by comparing Qwen vs Gemini side-by-side).
**Estimate:** ~1.5-2 days for preset registry + matrix orchestrator + report + driver alignment + tests.
**Branch:** off `main`
**Feature flag:** none — new entrypoints; existing `npm run synthetic` behavior unchanged when no variant flag is set.

---

## 0. Why

Sub-project B revealed a model-specific failure mode: Qwen via Groq emits the `scene_summary` field only ~36% of the time despite the prompt instruction, capping the relevance lift at +0.30 against a target of +0.73. Whether a different model (Gemini, OpenAI) would emit more reliably is an empirical question — there is no current way to answer it without manually editing `modelConfig.ts`, rerunning the harness, and comparing PostHog events that all share the same `requestId` pattern, with no way to tell which run used which model.

Half the mechanism already exists. `server/src/config/modelConfig.ts` exposes env-var hooks (`ENHANCE_PROVIDER`, `ENHANCE_MODEL`, `OPTIMIZE_PROVIDER`, `OPTIMIZE_MODEL`, etc.) that let an operation be routed to a different provider per process. What's missing:

1. **Discoverability** — the env-var system isn't documented; the user discovered it only by reading source.
2. **Tagging** — when a swap happens, the resulting telemetry events don't record which model produced them. PostHog dashboards can't distinguish runs.
3. **Matrix orchestration** — no way to run N variants in one command. Currently it's `edit env → run → edit env → run → manually correlate`.
4. **Comparison report** — no per-variant comparison view.
5. **Span-labeling telemetry-annotation drift** — `span_labeling` is already in `modelConfig.ts` and IS swappable via `SPAN_PROVIDER` / `SPAN_MODEL`, so routing works. But `span-labeling.driver.ts` hardcodes constants (`PROVIDER = "gemini"`, `MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash"`) that it passes into the telemetry annotation — so the emitted event's `provider`/`model` fields are stale and don't reflect what `aiService` actually routed to. The driver fix is alignment, not new env-var hooks.

Sub-project E unifies these into a coherent workflow. Beyond unblocking Sub-project B2, it enables future questions: "Does optimize tail-truncation differ between OpenAI variants? Does span-labeling do better with Gemini Pro vs Flash? Which model is cheapest for parity scores?"

---

## 1. Locked architectural decisions

| Decision                     | Choice                                                                                                   | Reason                                                                                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Variant definition           | **Typed preset registry in `scripts/synthetic/variants.ts`**                                             | Type-safe; testable; reusable across runs; matches the codebase convention of TS-as-config. Power users can extend by adding a preset.                                                                                               |
| Isolation                    | **Subprocess per variant**                                                                               | Matches the discipline lesson from Sub-projects A/B — every measurement-system bug we hit was state leakage. Subprocesses give hard env-var + adapter-state boundaries. 2-3 sec spawn overhead is noise next to 30-60 sec LLM calls. |
| Execution order              | **Sequential per variant** (one subprocess at a time)                                                    | Predictable PostHog ingestion ordering; avoids the rate-limit bug class. Parallel matrix is YAGNI for v1.                                                                                                                            |
| Surface scope per matrix run | **One surface at a time** (`--only suggestions`, etc.)                                                   | Matches existing `run-harness.ts` semantics. Multiple surfaces means multiple matrix invocations. Cross-surface matrix is YAGNI.                                                                                                     |
| Event tag field name         | **`modelVariant`** (camelCase, matches `sceneSummary` from Sub-project B)                                | Convention consistency with the existing telemetry payload shape.                                                                                                                                                                    |
| Backward compatibility       | **`npm run synthetic` without `--variant-tag` produces null `modelVariant`**                             | Plain harness runs continue to work unchanged. Tag is opt-in.                                                                                                                                                                        |
| Report data source           | **Existing PostHog `quality.scored` events, joined to surface events by `scoredEventId`**                | No new event types. Reuses Sub-project A's calibration anchor.                                                                                                                                                                       |
| Report output                | **Markdown table to stdout + URL to a saved PostHog dashboard**                                          | CLI table answers the question immediately; dashboard URL provides drill-down for follow-up.                                                                                                                                         |
| Judge swap                   | **Out of scope** — defer to a future Sub-project                                                         | Judge swap is its own design surface (different code path, different calibration implications).                                                                                                                                      |
| Span-labeling alignment      | **Replace driver's hardcoded `PROVIDER`/`MODEL` constants with reads from `SPAN_PROVIDER`/`SPAN_MODEL`** | These env vars already exist (`modelConfig.ts:391-392`) and routing already honors them. Driver's telemetry annotation must read the same env vars so emitted events reflect the actual routed model.                                |
| Cost / quota guards          | **Out of scope** — user manages their own quota                                                          | Each variant burns ~$0.20-0.40 (synthetic + judge); matrix multiplies that linearly. No hard guard.                                                                                                                                  |

---

## 2. The contract

### 2.1 Variant preset shape

```typescript
export type Surface = "suggestions" | "optimize" | "span-labeling";

export interface VariantPreset {
  /** Short identifier — used in CLI flags AND as the modelVariant tag. */
  name: string;
  /** Which surface this preset configures. */
  surface: Surface;
  /** Env vars to set in the subprocess running under this preset. */
  env: Record<string, string>;
  /** Human-readable. Printed by `--list-variants`. */
  description: string;
}

export const VARIANTS: VariantPreset[] = [
  // suggestions
  {
    name: "qwen",
    surface: "suggestions",
    env: { ENHANCE_PROVIDER: "qwen", ENHANCE_MODEL: "qwen/qwen3-32b" },
    description: "Qwen 3 32B via Groq (current prod default)",
  },
  {
    name: "gemini",
    surface: "suggestions",
    env: { ENHANCE_PROVIDER: "gemini", ENHANCE_MODEL: "gemini-2.5-flash" },
    description: "Gemini 2.5 Flash for suggestions",
  },
  {
    name: "openai-mini",
    surface: "suggestions",
    env: {
      ENHANCE_PROVIDER: "openai",
      ENHANCE_MODEL: "gpt-4o-mini-2024-07-18",
    },
    description: "GPT-4o-mini for suggestions",
  },

  // optimize
  {
    name: "openai",
    surface: "optimize",
    env: { OPTIMIZE_PROVIDER: "openai", OPTIMIZE_MODEL: "gpt-4o-2024-08-06" },
    description: "GPT-4o for optimize (current prod default)",
  },
  {
    name: "openai-mini",
    surface: "optimize",
    env: {
      OPTIMIZE_PROVIDER: "openai",
      OPTIMIZE_MODEL: "gpt-4o-mini-2024-07-18",
    },
    description: "GPT-4o-mini for optimize (cheaper)",
  },
  {
    name: "qwen",
    surface: "optimize",
    env: { OPTIMIZE_PROVIDER: "qwen", OPTIMIZE_MODEL: "qwen/qwen3-32b" },
    description: "Qwen 3 32B for optimize",
  },

  // span-labeling
  {
    name: "gemini",
    surface: "span-labeling",
    env: {
      SPAN_PROVIDER: "gemini",
      SPAN_MODEL: "gemini-2.5-flash",
    },
    description: "Gemini 2.5 Flash (current prod default)",
  },
  {
    name: "gemini-pro",
    surface: "span-labeling",
    env: {
      SPAN_PROVIDER: "gemini",
      SPAN_MODEL: "gemini-2.5-pro",
    },
    description: "Gemini 2.5 Pro (slower, possibly higher quality)",
  },
];
```

Authoring rules (validated at startup):

- `name` is unique within each surface.
- Every `env` key must be one of a known whitelist: `ENHANCE_PROVIDER`, `ENHANCE_MODEL`, `OPTIMIZE_PROVIDER`, `OPTIMIZE_MODEL`, `SPAN_PROVIDER`, `SPAN_MODEL`, plus per-provider model env vars (`OPENAI_MODEL`, `QWEN_MODEL`, `GEMINI_MODEL`, `GROQ_MODEL`).
- `surface` is one of the three legal values.

### 2.2 CLI surface

```bash
# List all available presets, grouped by surface
npm run synthetic:matrix -- --list-variants

# Run two variants on suggestions (sequential subprocesses)
npm run synthetic:matrix -- --only suggestions --variants qwen,gemini

# Run all three variants
npm run synthetic:matrix -- --only suggestions --variants qwen,gemini,openai-mini

# Single-variant swap (no matrix) — uses run-harness.ts directly
npm run synthetic -- --only suggestions --variant-tag qwen

# After matrix completes, run the judge normally
npm run judge:run -- --surface suggestions

# Compare results
npm run synthetic:report-matrix -- --only suggestions --since 30m
```

The matrix orchestrator validates `--variants` against the preset registry filtered by `--only`. Unknown preset names → fail fast with a helpful message listing available presets.

### 2.3 Event tagging

Three telemetry surfaces gain an optional `modelVariant?: string | null` field:

- `suggestions.completed` — propagated from `SuggestionsTraceCompleteSummary.modelVariant`
- `optimize.completed` — propagated from `OptimizeTraceCompleteSummary.modelVariant`
- `label-spans.completed` — propagated from `SpanLabelingTraceCompleteSummary.modelVariant`

The driver receives `variantTag: string | null` as an optional input and passes it through to `trace.complete({ modelVariant: variantTag })`. When `--variant-tag` is not set, `variantTag` is null, the field is null on emission, and PostHog dashboards using existing filters see no change.

`run-harness.ts` adds a CLI flag `--variant-tag <name>` and forwards the value to whichever driver(s) it dispatches under `--only`. The matrix orchestrator sets this flag automatically when spawning child runs.

### 2.4 Data flow

1. User runs `npm run synthetic:matrix -- --only suggestions --variants qwen,gemini`.
2. Orchestrator parses CLI, validates variant names against the preset registry filtered by `surface=suggestions`. Fails fast on unknowns.
3. For each preset in order:
   - Compute child env: `{ ...process.env, ...preset.env }`.
   - Spawn `npm run synthetic -- --only suggestions --variant-tag <preset.name>` as a subprocess with the merged env.
   - Stream child stdout/stderr to parent's stdout/stderr (prefixed with `[${preset.name}]`).
   - Wait for exit. Record exit code.
4. After all variants finish, print orchestrator summary: per-variant exit status and event count (extracted from the child's `=== Summary ===` line).
5. User runs `npm run judge:run -- --surface suggestions` separately. Judge scores all matrix-emitted events (and any others in its lookback window); `quality.scored` events carry no `modelVariant` themselves.
6. User runs `npm run synthetic:report-matrix -- --only suggestions --since 30m`. Report queries PostHog:
   - First subquery: `SELECT toString(uuid), properties.modelVariant FROM events WHERE event = 'suggestions.completed' AND properties.modelVariant IS NOT NULL AND timestamp > now() - INTERVAL <since>`.
   - Join to `quality.scored` events whose `scoredEventId` is in that uuid set.
   - Group by `modelVariant`; compute per-dimension averages.
7. Report prints a markdown table to stdout and a PostHog dashboard URL pre-filtered to the variant set + time window.

### 2.5 Comparison report format

```markdown
## Sub-project E matrix run — suggestions surface (last 30 min)

| Variant     | n   | relevance | diversity | categoryFidelity | plausibility | qualityRange | total |
| ----------- | --- | --------- | --------- | ---------------- | ------------ | ------------ | ----- |
| qwen        | 47  | 3.87      | 4.06      | 4.51             | 4.70         | 3.83         | 20.98 |
| gemini      | 47  | 4.21      | 3.95      | 4.62             | 4.55         | 3.91         | 21.24 |
| openai-mini | 47  | 4.45      | 4.11      | 4.79             | 4.83         | 4.02         | 22.20 |

Winner (by total): openai-mini (+1.22 vs qwen, +0.96 vs gemini).
Per-dimension winners: relevance=openai-mini, diversity=openai-mini,
categoryFidelity=openai-mini, plausibility=openai-mini, qualityRange=openai-mini.

Dashboard: https://us.posthog.com/project/417445/dashboard/...?date_from=-30m&breakdown=properties.modelVariant
```

The report is purely descriptive — no recommendations engine. The user reads the numbers and decides.

---

## 3. What this is NOT

- **Not a judge swap.** Future Sub-project; keeps the calibration anchor stable.
- **Not auto-creating PostHog dashboards.** The dashboard URL points to a one-time manually-created dashboard with `modelVariant` as a breakdown dimension. Auto-creation can land later.
- **Not cross-surface matrix.** `--only` still takes one surface. Multiple surfaces = multiple invocations.
- **Not routing span-labeling through full `modelConfig.ts`.** Just adds two env-var hooks (`SPAN_PROVIDER`, `SPAN_MODEL`) to the driver. Full alignment is a separate refactor.
- **Not parallel subprocess execution.** Sequential by design (PostHog ingestion ordering + rate-limit safety).
- **Not cost guards.** User manages their own quota.
- **Not a continuous matrix.** No cron, no scheduled runs.
- **Not opinionated about which model "wins."** The report prints numbers; the user decides.

---

## 4. Risks and mitigations

| Risk                                                                                                                                       | Mitigation                                                                                                                                  | Residual   |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Subprocess inherits parent env vars that shadow preset overrides                                                                           | Preset `env` keys go LAST in the spread (`{...process.env, ...preset.env}`), so they always win                                             | Low        |
| Adding new env-var hooks to span-labeling driver could break the existing harness when those env vars are accidentally set by another tool | Default values fall back to current behavior (`gemini` + `gemini-2.5-flash`); only an explicit override changes routing                     | Low        |
| `modelVariant` on the OpenAI strict schema might fail validation                                                                           | The field is on TELEMETRY events, not on LLM JSON output — no schema interaction                                                            | None       |
| Cost runs away on a matrix of N=10 variants                                                                                                | Documented in the README; orchestrator prints estimated cost based on variant count × ~$0.30 per surface run before starting                | Low        |
| Report query times out on PostHog when joining tables                                                                                      | Use the same subquery pattern from Sub-project B verification (filter source events first, then quality.scored by `scoredEventId IN (...)`) | Low        |
| Spawn overhead dominates for small variant counts (1-2)                                                                                    | Acceptable; sub-second human-perception cost; not optimizing                                                                                | Acceptable |
| One variant erroring aborts the whole matrix                                                                                               | Orchestrator catches per-variant errors, logs, continues; final summary marks failed variants                                               | Low        |

---

## 5. Sequencing

1. Add `modelVariant` field to telemetry types and services (all three surfaces). Add `--variant-tag` flag to `run-harness.ts`. Update all three drivers to thread the value through.
2. Create `scripts/synthetic/variants.ts` preset registry + startup validation. Unit tests cover the validation invariants.
3. Create `scripts/synthetic/run-matrix.ts` orchestrator. Unit tests cover variant filtering + arg construction.
4. Align `span-labeling.driver.ts` with new env-var hooks (`SPAN_PROVIDER`, `SPAN_MODEL`).
5. Create `scripts/synthetic/report-matrix.ts`. Unit test the HogQL construction.
6. Add `synthetic:matrix` and `synthetic:report-matrix` to `package.json`.
7. Update `scripts/synthetic/README.md` (or create) with full documentation: env-var system, presets, matrix workflow, report format.
8. End-to-end verification: run matrix with 2 variants for suggestions, run judge, run report. Sanity-check the comparison table.
9. Update Measurement Program reordering log with the sub-project entry.

---

## 6. What this spec does not specify

- The detailed implementation plan. Next artifact via writing-plans.
- The exact list of presets at v1 (the spec gives a representative seed; final list authored during execution and reviewed inline).
- The exact PostHog dashboard URL (manually created once; URL added to README during execution).
- Sub-project B2 (Qwen emission rate push). That brainstorm reopens once this lands, with comparison data in hand.
- Future judge swap.
