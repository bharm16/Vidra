# Synthetic Model Matrix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable model swap + matrix experimentation across the synthetic harness. Variant presets in TypeScript, subprocess matrix orchestrator, comparison report. Each surface event gains a `modelVariant` tag so PostHog dashboards can group by variant. Span-labeling driver aligned with the existing `SPAN_PROVIDER`/`SPAN_MODEL` env-var hooks.

**Architecture:** Three new entrypoints (`variants.ts`, `run-matrix.ts`, `report-matrix.ts`) + telemetry plumbing + driver thread-through. Sequential subprocess execution per variant for state isolation (Node's `spawn` from `node:child_process`). `run-harness.ts` gains `--variant-tag <name>` flag; matrix orchestrator sets it automatically when spawning child runs. Backward compatible — plain `npm run synthetic` continues to work with `modelVariant=null`.

**Tech Stack:** TypeScript (ESM), Vitest, Node's `spawn` for subprocess management, PostHog HogQL via direct fetch (matches Sub-project A's `select-samples.ts` pattern).

**Spec:** [`docs/superpowers/specs/2026-05-21-synthetic-model-matrix-design.md`](../specs/2026-05-21-synthetic-model-matrix-design.md)

---

## File Structure

| Action | Path                                                                | Responsibility                                                                                                                                                     |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Modify | `server/src/services/observability/types.ts`                        | Add `modelVariant?: string \| null` to `SuggestionsTraceCompleteSummary`, `SuggestionsEventProperties`, `OptimizeTraceCompleteSummary`, `OptimizeEventProperties`. |
| Modify | `server/src/services/observability/SuggestionsTelemetryService.ts`  | Pipe `summary.modelVariant ?? null` into properties.                                                                                                               |
| Modify | `server/src/services/observability/OptimizeTelemetryService.ts`     | Pipe `summary.modelVariant ?? null` into properties.                                                                                                               |
| Modify | `server/src/services/observability/SpanLabelingTelemetryService.ts` | Add `modelVariant?: string \| null` to `SpanLabelingCompleteSummary` + internal event properties; pipe through.                                                    |
| Modify | `scripts/synthetic/run-harness.ts`                                  | Add `--variant-tag <name>` CLI flag; thread through `DriverDeps`.                                                                                                  |
| Modify | `scripts/synthetic/drivers/suggestions.driver.ts`                   | Accept `variantTag` in `DriverDeps`; pass to `trace.complete({ modelVariant: variantTag })` in both success + error branches.                                      |
| Modify | `scripts/synthetic/drivers/optimize.driver.ts`                      | Same pattern.                                                                                                                                                      |
| Modify | `scripts/synthetic/drivers/span-labeling.driver.ts`                 | Same pattern + replace hardcoded `PROVIDER="gemini"` / `MODEL = process.env.GEMINI_MODEL ?? ...` with reads from `SPAN_PROVIDER`/`SPAN_MODEL`.                     |
| Create | `scripts/synthetic/variants.ts`                                     | Typed preset registry; exports `VARIANTS`, `getVariant(name, surface)`, `validateAllPresets()`.                                                                    |
| Create | `scripts/synthetic/__tests__/variants.test.ts`                      | TDD unit tests for the registry invariants.                                                                                                                        |
| Create | `scripts/synthetic/run-matrix.ts`                                   | Orchestrator. Reads `--only` + `--variants`, spawns subprocess per variant with merged env, waits, prints summary.                                                 |
| Create | `scripts/synthetic/__tests__/run-matrix.test.ts`                    | TDD unit tests for variant filtering + arg construction (no actual spawn).                                                                                         |
| Create | `scripts/synthetic/report-matrix.ts`                                | Queries PostHog for the most recent matrix run's scored events grouped by `modelVariant`, prints comparison table.                                                 |
| Create | `scripts/synthetic/__tests__/report-matrix.test.ts`                 | TDD unit tests for HogQL query construction.                                                                                                                       |
| Modify | `package.json`                                                      | Add `synthetic:matrix` and `synthetic:report-matrix` scripts.                                                                                                      |
| Create | `scripts/synthetic/README.md`                                       | Document env-var system, presets, matrix workflow, report format.                                                                                                  |
| Modify | `docs/superpowers/programs/measurement.md`                          | Reordering-log entry for Sub-project E completion.                                                                                                                 |

---

## Task 1: Add `modelVariant` to all three telemetry surfaces

**Files:**

- Modify: `server/src/services/observability/types.ts:106-128, 12-60`
- Modify: `server/src/services/observability/SuggestionsTelemetryService.ts`
- Modify: `server/src/services/observability/OptimizeTelemetryService.ts`
- Modify: `server/src/services/observability/SpanLabelingTelemetryService.ts:17-43`

This task lands all three surfaces in one commit because the changes are parallel and the spec's "schema variants in lockstep" lesson applies — drift between surfaces is a known false-signal class.

- [ ] **Step 1: Add `modelVariant` to Suggestions types**

In `server/src/services/observability/types.ts`, find `SuggestionsTraceCompleteSummary` (line 106) and add at the end of the interface, immediately after the `sceneSummary?: string | null;` field:

```typescript
  /**
   * Optional variant tag set by Sub-project E's matrix runs. Null when
   * the synthetic harness runs without `--variant-tag`. Used by PostHog
   * dashboards to group events by which model produced them.
   */
  modelVariant?: string | null;
```

Then find `SuggestionsEventProperties` (line 138) and add the same field at the end of that interface.

- [ ] **Step 2: Add `modelVariant` to Optimize types**

In the same file, find `OptimizeTraceCompleteSummary` (line 12) and add at the end of the interface:

```typescript
  /**
   * Optional variant tag set by Sub-project E's matrix runs. Null when
   * the synthetic harness runs without `--variant-tag`.
   */
  modelVariant?: string | null;
```

Then find `OptimizeEventProperties` (line 38) and add the same field at the end.

- [ ] **Step 3: Add `modelVariant` to SpanLabeling types (inline in the service file)**

In `server/src/services/observability/SpanLabelingTelemetryService.ts`, find `SpanLabelingCompleteSummary` (line 17) and add at the end:

```typescript
  /**
   * Optional variant tag set by Sub-project E's matrix runs. Null when
   * the synthetic harness runs without `--variant-tag`.
   */
  modelVariant?: string | null;
```

Then find the internal `SpanLabelingEventProperties` interface (line 29) and add the same field at the end (no JSDoc needed; it's internal).

- [ ] **Step 4: Pipe `modelVariant` through SuggestionsTelemetryService**

In `server/src/services/observability/SuggestionsTelemetryService.ts`, find the `properties` object construction in `complete()` (around line 61). After the existing `sceneSummary: summary.sceneSummary ?? null,` line, add:

```typescript
      modelVariant: summary.modelVariant ?? null,
```

- [ ] **Step 5: Pipe `modelVariant` through OptimizeTelemetryService**

In `server/src/services/observability/OptimizeTelemetryService.ts`, find the `properties: OptimizeEventProperties = { ... }` construction. Add at the end of the object literal (after `outputPrompt: summary.outputPrompt,` or whatever the last field is):

```typescript
      modelVariant: summary.modelVariant ?? null,
```

- [ ] **Step 6: Pipe `modelVariant` through SpanLabelingTelemetryService**

In `server/src/services/observability/SpanLabelingTelemetryService.ts`, find the `properties: SpanLabelingEventProperties = { ... }` construction in `complete()` (around line 74). Add at the end of the object literal (after `spans: summary.spans,`):

```typescript
      modelVariant: summary.modelVariant ?? null,
```

- [ ] **Step 7: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Run all existing observability tests**

Run: `npx vitest run server/src/services/observability --config config/test/vitest.unit.config.js`
Expected: existing tests still pass. The new field is optional with a `?? null` default, so no existing test should fail.

- [ ] **Step 9: Commit**

```bash
git add server/src/services/observability/types.ts server/src/services/observability/SuggestionsTelemetryService.ts server/src/services/observability/OptimizeTelemetryService.ts server/src/services/observability/SpanLabelingTelemetryService.ts
git commit -m "feat(telemetry): add modelVariant field to all three surface events

Optional modelVariant?: string | null on SuggestionsTraceCompleteSummary,
OptimizeTraceCompleteSummary, SpanLabelingCompleteSummary and their
matching internal *EventProperties types. Sub-project E's synthetic
matrix orchestrator sets the field via the new --variant-tag flag so
PostHog dashboards can group events by which model produced them.

Backward compatible: when the harness runs without --variant-tag,
modelVariant emits as null and existing dashboard filters see no
change. All three surfaces updated in one commit to keep variants
in lockstep (spec § 1 'schema variants in lockstep')."
```

---

## Task 2: Add `--variant-tag` CLI flag to `run-harness.ts`

**Files:**

- Modify: `scripts/synthetic/run-harness.ts:37-75, 109-121`

- [ ] **Step 1: Extend `CliConfig` to carry `variantTag`**

In `scripts/synthetic/run-harness.ts`, replace the `CliConfig` interface (line 39) with:

```typescript
interface CliConfig {
  surfaces: Set<Surface>;
  variantTag: string | null;
}
```

- [ ] **Step 2: Extend `parseArgs` to read `--variant-tag`**

Replace `parseArgs` (lines 43-75) with:

```typescript
function parseArgs(argv: string[]): CliConfig {
  const surfaces = new Set<Surface>();
  let only: string | undefined;
  let variantTag: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") {
      only = argv[++i];
      if (!only) {
        console.error("--only requires a value (e.g., --only optimize)");
        process.exit(2);
      }
    } else if (argv[i] === "--variant-tag") {
      const value = argv[++i];
      if (!value) {
        console.error(
          "--variant-tag requires a value (e.g., --variant-tag qwen)",
        );
        process.exit(2);
      }
      variantTag = value;
    }
  }
  if (only) {
    for (const name of only.split(",")) {
      const trimmed = name.trim();
      if (
        trimmed === "optimize" ||
        trimmed === "suggestions" ||
        trimmed === "span-labels"
      ) {
        surfaces.add(trimmed);
      } else {
        console.error(`Unknown surface: ${trimmed}`);
        process.exit(2);
      }
    }
  } else {
    surfaces.add("optimize");
    surfaces.add("suggestions");
    surfaces.add("span-labels");
  }
  return { surfaces, variantTag };
}
```

- [ ] **Step 3: Thread `variantTag` into each driver call**

Replace the dispatch block (lines 109-121) with:

```typescript
const summaries: DriverSummary[] = [];
if (config.surfaces.has("optimize")) {
  summaries.push(
    await driveOptimize(
      { optimize, aiService, variantTag: config.variantTag },
      prompts,
    ),
  );
}
if (config.surfaces.has("suggestions")) {
  summaries.push(
    await driveSuggestions(
      { suggestions, aiService, variantTag: config.variantTag },
      prompts,
    ),
  );
}
if (config.surfaces.has("span-labels")) {
  summaries.push(
    await driveSpanLabels(
      { spanLabels, aiService, variantTag: config.variantTag },
      prompts,
    ),
  );
}
```

Also update the log line near line 105 to mention the variant when set:

```typescript
const variantSuffix = config.variantTag
  ? ` [variant=${config.variantTag}]`
  : "";
console.log(
  `Running synthetic harness with ${prompts.length} prompts${variantSuffix}. Surfaces: ${[...config.surfaces].join(", ")}`,
);
```

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: TypeScript will FAIL because `DriverDeps` in each driver doesn't yet have `variantTag`. That's expected — Task 3 fixes it. Do NOT commit yet.

If errors are outside the three driver files, investigate before continuing.

---

## Task 3: Thread `variantTag` through all three drivers + align span-labeling env vars

**Files:**

- Modify: `scripts/synthetic/drivers/suggestions.driver.ts`
- Modify: `scripts/synthetic/drivers/optimize.driver.ts`
- Modify: `scripts/synthetic/drivers/span-labeling.driver.ts`

- [ ] **Step 1: Update Suggestions driver**

In `scripts/synthetic/drivers/suggestions.driver.ts`, find the `DriverDeps` interface (around line 24) and add a field:

```typescript
interface DriverDeps {
  suggestions: SuggestionsTelemetryService;
  aiService: AIModelService;
  variantTag: string | null;
}
```

Then in `driveSuggestions` find the success-branch `trace.complete({...})` call. Add at the end of the object literal (after `sceneSummary: execution.debug.sceneSummary ?? null,`):

```typescript
            modelVariant: deps.variantTag,
```

Find the error-branch `trace.complete({...})` call (in the catch block of the same loop body). Add at the end of its object literal (after `suggestions: [],`):

```typescript
            modelVariant: deps.variantTag,
```

- [ ] **Step 2: Update Optimize driver**

In `scripts/synthetic/drivers/optimize.driver.ts`, find the `DriverDeps` interface (around line 22) and add:

```typescript
interface DriverDeps {
  optimize: OptimizeTelemetryService;
  aiService: AIModelService;
  variantTag: string | null;
}
```

Find the success-branch `trace.complete({...})` call. Add at the end of the object literal (after `outputPrompt,`):

```typescript
          modelVariant: deps.variantTag,
```

Find the error-branch `trace.complete({...})` call. Add at the end of its object literal (after `outputPrompt: "",`):

```typescript
          modelVariant: deps.variantTag,
```

- [ ] **Step 3: Update Span-Labeling driver — both `modelVariant` AND env-var alignment**

In `scripts/synthetic/drivers/span-labeling.driver.ts`, replace the `DriverDeps` interface (around line 21) and the top-level constants (lines 26-30) with:

```typescript
interface DriverDeps {
  spanLabels: SpanLabelingTelemetryService;
  aiService: AIModelService;
  variantTag: string | null;
}

const TEMPLATE_VERSION = "v3.0";
// Read the same env vars modelConfig.ts:391-392 routes against, so the
// telemetry annotation reflects the actual model aiService used. Default
// to the same fallback as modelConfig.ts so behavior matches when no
// override is set.
const PROVIDER = process.env.SPAN_PROVIDER ?? "gemini";
const MODEL = process.env.SPAN_MODEL ?? "gemini-2.5-flash";
```

Find the success-branch `trace.complete({...})` call. Add at the end of the object literal (after `spans,`):

```typescript
          modelVariant: deps.variantTag,
```

Find the error-branch `trace.complete({...})` call. Add at the end of its object literal (after `spans: [],`):

```typescript
          modelVariant: deps.variantTag,
```

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0. (Tasks 1 + 2 + 3 together complete the type chain.)

- [ ] **Step 5: Lint**

Run: `npx eslint --config config/lint/eslint.config.js scripts/synthetic/ server/src/services/observability/ --quiet`
Expected: 0 errors.

- [ ] **Step 6: Smoke test — run plain synthetic without variant flag**

Run: `npm run synthetic -- --only suggestions 2>&1 | tail -10`
Expected: harness runs to completion; ends with `=== Summary === suggestions: NN surface events`. Plain runs work the same as before (sceneSummary still captured; modelVariant emits null).

- [ ] **Step 7: Smoke test — run with `--variant-tag`**

Run: `npm run synthetic -- --only suggestions --variant-tag smoke-test 2>&1 | tail -10`
Expected: harness runs to completion with the log line showing `[variant=smoke-test]`.

- [ ] **Step 8: Commit (Tasks 2 + 3 together)**

```bash
git add scripts/synthetic/run-harness.ts scripts/synthetic/drivers/suggestions.driver.ts scripts/synthetic/drivers/optimize.driver.ts scripts/synthetic/drivers/span-labeling.driver.ts
git commit -m "feat(synthetic): --variant-tag flag threads modelVariant onto events

run-harness.ts gains a --variant-tag <name> CLI flag. The value is
plumbed through DriverDeps into every trace.complete() call on all
three surfaces (suggestions, optimize, span-labels), success and
error branches alike.

Span-labeling driver also gets a small fix: the previously-hardcoded
PROVIDER='gemini' and MODEL=GEMINI_MODEL constants now read from
SPAN_PROVIDER and SPAN_MODEL — the same env vars modelConfig.ts
(line 391-392) already uses for routing. This keeps the telemetry
annotation in sync with what aiService actually routed to, so a
matrix run that overrides SPAN_PROVIDER will see correctly-tagged
events.

Plain 'npm run synthetic' continues to work unchanged: variantTag
defaults to null and modelVariant emits as null."
```

---

## Task 4: Create `variants.ts` preset registry (TDD)

**Files:**

- Create: `scripts/synthetic/variants.ts`
- Create: `scripts/synthetic/__tests__/variants.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/synthetic/__tests__/variants.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  VARIANTS,
  getVariant,
  validateAllPresets,
  VALID_ENV_KEYS,
  type Surface,
} from "../variants.js";

describe("variants registry", () => {
  it("validateAllPresets passes on the seed preset list", () => {
    expect(() => validateAllPresets()).not.toThrow();
  });

  it("every preset has a surface in the legal set", () => {
    const surfaces = new Set<Surface>([
      "suggestions",
      "optimize",
      "span-labeling",
    ]);
    for (const preset of VARIANTS) {
      expect(surfaces.has(preset.surface)).toBe(true);
    }
  });

  it("every preset env key is in the whitelist", () => {
    for (const preset of VARIANTS) {
      for (const key of Object.keys(preset.env)) {
        expect(VALID_ENV_KEYS).toContain(key);
      }
    }
  });

  it("no duplicate (name, surface) pairs", () => {
    const seen = new Set<string>();
    for (const preset of VARIANTS) {
      const key = `${preset.surface}:${preset.name}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("getVariant returns the preset for a known (name, surface)", () => {
    const found = getVariant("qwen", "suggestions");
    expect(found).toBeDefined();
    expect(found?.name).toBe("qwen");
    expect(found?.surface).toBe("suggestions");
  });

  it("getVariant returns undefined for an unknown name", () => {
    expect(getVariant("nonexistent", "suggestions")).toBeUndefined();
  });

  it("getVariant returns undefined when surface does not match", () => {
    expect(getVariant("qwen", "span-labeling")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/synthetic/__tests__/variants.test.ts`
Expected: FAIL — module `../variants.js` cannot be resolved.

- [ ] **Step 3: Implement `variants.ts`**

Create `scripts/synthetic/variants.ts`:

```typescript
/**
 * Variant preset registry for the synthetic matrix orchestrator.
 *
 * Each preset names a (surface, model) combination via env-var overrides
 * that modelConfig.ts already honors. The matrix orchestrator (run-matrix.ts)
 * spawns one subprocess per preset with the env merged into process.env;
 * the subprocess's drivers read modelConfig.ts as usual, but get the routed
 * model from the preset.
 *
 * See docs/superpowers/specs/2026-05-21-synthetic-model-matrix-design.md
 * § 2.1 for the design rationale.
 */

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

/**
 * Whitelist of env-var keys a preset may set. Matches the per-operation
 * provider/model env vars exposed by server/src/config/modelConfig.ts plus
 * the per-provider model overrides read by scripts/synthetic/utils/aiService.ts.
 */
export const VALID_ENV_KEYS = [
  "ENHANCE_PROVIDER",
  "ENHANCE_MODEL",
  "OPTIMIZE_PROVIDER",
  "OPTIMIZE_MODEL",
  "SPAN_PROVIDER",
  "SPAN_MODEL",
  "OPENAI_MODEL",
  "QWEN_MODEL",
  "GEMINI_MODEL",
  "GROQ_MODEL",
] as const;

export const VARIANTS: VariantPreset[] = [
  // -- suggestions --
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

  // -- optimize --
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

  // -- span-labeling --
  {
    name: "gemini",
    surface: "span-labeling",
    env: { SPAN_PROVIDER: "gemini", SPAN_MODEL: "gemini-2.5-flash" },
    description: "Gemini 2.5 Flash (current prod default)",
  },
  {
    name: "gemini-pro",
    surface: "span-labeling",
    env: { SPAN_PROVIDER: "gemini", SPAN_MODEL: "gemini-2.5-pro" },
    description: "Gemini 2.5 Pro (slower, possibly higher quality)",
  },
];

const VALID_ENV_KEY_SET = new Set<string>(VALID_ENV_KEYS);
const VALID_SURFACES = new Set<Surface>([
  "suggestions",
  "optimize",
  "span-labeling",
]);

/**
 * Asserts every preset in VARIANTS satisfies the authoring invariants.
 * Throws on the first violation with a message that identifies the
 * offending preset by name + surface.
 */
export function validateAllPresets(): void {
  const seen = new Set<string>();
  for (const preset of VARIANTS) {
    if (!VALID_SURFACES.has(preset.surface)) {
      throw new Error(
        `Variant '${preset.name}' has unknown surface '${preset.surface}'. Must be one of: ${[...VALID_SURFACES].join(", ")}.`,
      );
    }
    const dedupKey = `${preset.surface}:${preset.name}`;
    if (seen.has(dedupKey)) {
      throw new Error(
        `Variant '${preset.name}' is duplicated within surface '${preset.surface}'.`,
      );
    }
    seen.add(dedupKey);
    for (const key of Object.keys(preset.env)) {
      if (!VALID_ENV_KEY_SET.has(key)) {
        throw new Error(
          `Variant '${preset.name}' (surface '${preset.surface}') sets env var '${key}' which is not in the whitelist. Allowed: ${VALID_ENV_KEYS.join(", ")}.`,
        );
      }
    }
  }
}

/**
 * Find a preset by (name, surface). Returns undefined when not found.
 * Used by the matrix orchestrator to resolve --variants entries against
 * the registry filtered by --only.
 */
export function getVariant(
  name: string,
  surface: Surface,
): VariantPreset | undefined {
  return VARIANTS.find((p) => p.name === name && p.surface === surface);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/synthetic/__tests__/variants.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/synthetic/variants.ts scripts/synthetic/__tests__/variants.test.ts
git commit -m "feat(synthetic): variant preset registry for matrix runs

scripts/synthetic/variants.ts exports a typed VARIANTS registry, a
VALID_ENV_KEYS whitelist (matches modelConfig.ts's per-operation env
vars + aiService.ts's per-provider model overrides), and helper
functions getVariant() / validateAllPresets().

Seed presets cover all three surfaces:
  suggestions: qwen, gemini, openai-mini
  optimize:    openai, openai-mini, qwen
  span-labeling: gemini, gemini-pro

Seven TDD tests cover registry invariants: seed list validates,
surface field legal, env keys in whitelist, no duplicate (name,
surface) pairs, getVariant by name+surface or returns undefined."
```

---

## Task 5: Create `run-matrix.ts` orchestrator (TDD)

**Files:**

- Create: `scripts/synthetic/run-matrix.ts`
- Create: `scripts/synthetic/__tests__/run-matrix.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/synthetic/__tests__/run-matrix.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  parseMatrixArgs,
  resolveVariants,
  buildChildEnv,
} from "../run-matrix.js";

describe("parseMatrixArgs", () => {
  it("returns surface + variants when both are present", () => {
    const result = parseMatrixArgs([
      "--only",
      "suggestions",
      "--variants",
      "qwen,gemini",
    ]);
    expect(result).toEqual({
      surface: "suggestions",
      variantNames: ["qwen", "gemini"],
      listOnly: false,
    });
  });

  it("returns listOnly=true when --list-variants is passed", () => {
    const result = parseMatrixArgs(["--list-variants"]);
    expect(result.listOnly).toBe(true);
  });

  it("throws on missing --only", () => {
    expect(() => parseMatrixArgs(["--variants", "qwen"])).toThrow(
      /--only is required/i,
    );
  });

  it("throws on missing --variants", () => {
    expect(() => parseMatrixArgs(["--only", "suggestions"])).toThrow(
      /--variants is required/i,
    );
  });

  it("trims whitespace around variant names", () => {
    const result = parseMatrixArgs([
      "--only",
      "suggestions",
      "--variants",
      " qwen , gemini ",
    ]);
    expect(result.variantNames).toEqual(["qwen", "gemini"]);
  });
});

describe("resolveVariants", () => {
  it("returns presets when all names resolve for the surface", () => {
    const resolved = resolveVariants(["qwen", "gemini"], "suggestions");
    expect(resolved).toHaveLength(2);
    expect(resolved[0]!.name).toBe("qwen");
    expect(resolved[1]!.name).toBe("gemini");
  });

  it("throws when a variant name is unknown for the surface", () => {
    expect(() =>
      resolveVariants(["qwen", "nonexistent"], "suggestions"),
    ).toThrow(/unknown variant.*nonexistent.*surface.*suggestions/i);
  });

  it("throws on empty variant list", () => {
    expect(() => resolveVariants([], "suggestions")).toThrow(
      /no variants specified/i,
    );
  });
});

describe("buildChildEnv", () => {
  it("merges preset env on top of base env", () => {
    const base = { POSTHOG_API_KEY: "secret", FOO: "bar" };
    const presetEnv = {
      ENHANCE_PROVIDER: "qwen",
      ENHANCE_MODEL: "qwen/qwen3-32b",
    };
    const merged = buildChildEnv(base, presetEnv);
    expect(merged.POSTHOG_API_KEY).toBe("secret");
    expect(merged.FOO).toBe("bar");
    expect(merged.ENHANCE_PROVIDER).toBe("qwen");
    expect(merged.ENHANCE_MODEL).toBe("qwen/qwen3-32b");
  });

  it("preset env wins over conflicting base env", () => {
    const base = { ENHANCE_PROVIDER: "gemini" };
    const presetEnv = { ENHANCE_PROVIDER: "qwen" };
    const merged = buildChildEnv(base, presetEnv);
    expect(merged.ENHANCE_PROVIDER).toBe("qwen");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/synthetic/__tests__/run-matrix.test.ts`
Expected: FAIL — module `../run-matrix.js` cannot be resolved.

- [ ] **Step 3: Implement `run-matrix.ts`**

Create `scripts/synthetic/run-matrix.ts`:

```typescript
/**
 * Sub-project E: synthetic matrix orchestrator.
 *
 * Spawns one subprocess per variant (subprocess isolation pattern — see
 * spec § 1 for rationale). Subprocesses run the existing run-harness.ts
 * with env vars merged from the variant preset and a --variant-tag flag
 * matching the preset name. Sequential execution; one variant erroring
 * doesn't abort the matrix.
 *
 * Usage:
 *   npm run synthetic:matrix -- --list-variants
 *   npm run synthetic:matrix -- --only suggestions --variants qwen,gemini
 *
 * See docs/superpowers/specs/2026-05-21-synthetic-model-matrix-design.md
 * § 2.4 for the data flow.
 */

import "dotenv/config";
import { spawn } from "node:child_process";

import {
  VARIANTS,
  getVariant,
  validateAllPresets,
  type Surface,
  type VariantPreset,
} from "./variants.js";

export interface MatrixArgs {
  surface: Surface;
  variantNames: string[];
  listOnly: boolean;
}

const VALID_SURFACES = new Set<Surface>([
  "suggestions",
  "optimize",
  "span-labeling",
]);

export function parseMatrixArgs(argv: string[]): MatrixArgs {
  let surface: Surface | null = null;
  let variantNames: string[] = [];
  let listOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--list-variants") {
      listOnly = true;
    } else if (arg === "--only") {
      const value = argv[++i];
      if (!value) throw new Error("--only requires a value");
      if (!VALID_SURFACES.has(value as Surface)) {
        throw new Error(
          `--only must be one of: ${[...VALID_SURFACES].join(", ")} (got: ${value})`,
        );
      }
      surface = value as Surface;
    } else if (arg === "--variants") {
      const value = argv[++i];
      if (!value) throw new Error("--variants requires a value");
      variantNames = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }

  if (listOnly) {
    return { surface: surface ?? "suggestions", variantNames, listOnly };
  }

  if (!surface) {
    throw new Error("--only is required (e.g., --only suggestions)");
  }
  if (variantNames.length === 0) {
    throw new Error("--variants is required (e.g., --variants qwen,gemini)");
  }

  return { surface, variantNames, listOnly };
}

export function resolveVariants(
  names: string[],
  surface: Surface,
): VariantPreset[] {
  if (names.length === 0) {
    throw new Error("no variants specified");
  }
  const resolved: VariantPreset[] = [];
  for (const name of names) {
    const preset = getVariant(name, surface);
    if (!preset) {
      const available = VARIANTS.filter((v) => v.surface === surface).map(
        (v) => v.name,
      );
      throw new Error(
        `unknown variant '${name}' for surface '${surface}'. Available: ${available.join(", ")}.`,
      );
    }
    resolved.push(preset);
  }
  return resolved;
}

export function buildChildEnv(
  base: NodeJS.ProcessEnv,
  presetEnv: Record<string, string>,
): NodeJS.ProcessEnv {
  return { ...base, ...presetEnv };
}

function listVariants(): void {
  console.log("Available variants:\n");
  const bySurface: Record<Surface, VariantPreset[]> = {
    suggestions: [],
    optimize: [],
    "span-labeling": [],
  };
  for (const v of VARIANTS) {
    bySurface[v.surface].push(v);
  }
  for (const surface of ["suggestions", "optimize", "span-labeling"] as const) {
    console.log(`  ${surface}:`);
    for (const v of bySurface[surface]) {
      console.log(`    ${v.name.padEnd(15)} ${v.description}`);
    }
    console.log("");
  }
}

interface VariantResult {
  preset: VariantPreset;
  exitCode: number;
}

/**
 * The harness uses "span-labels" (dash, plural-ish) as its --only token,
 * but the variant registry uses "span-labeling" (the surface name in
 * telemetry / observability code). Translate at the spawn boundary so
 * the registry stays aligned with the telemetry naming.
 */
function surfaceToHarnessName(surface: Surface): string {
  if (surface === "span-labeling") return "span-labels";
  return surface;
}

async function runVariant(preset: VariantPreset): Promise<VariantResult> {
  const args = [
    "run",
    "synthetic",
    "--",
    "--only",
    surfaceToHarnessName(preset.surface),
    "--variant-tag",
    preset.name,
  ];
  const env = buildChildEnv(process.env, preset.env);
  console.log(
    `\n=== [matrix] running variant: ${preset.name} (${preset.surface}) ===`,
  );
  return new Promise((resolve) => {
    const child = spawn("npm", args, {
      env,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      resolve({ preset, exitCode: code ?? 1 });
    });
  });
}

async function main(): Promise<void> {
  validateAllPresets();
  const args = parseMatrixArgs(process.argv.slice(2));

  if (args.listOnly) {
    listVariants();
    return;
  }

  const presets = resolveVariants(args.variantNames, args.surface);
  const estimatedCost = presets.length * 0.3;
  console.log(
    `[matrix] running ${presets.length} variants for surface=${args.surface} (sequential). Estimated cost: ~$${estimatedCost.toFixed(2)}.`,
  );

  const results: VariantResult[] = [];
  for (const preset of presets) {
    results.push(await runVariant(preset));
  }

  console.log("\n=== [matrix] summary ===");
  for (const r of results) {
    const status = r.exitCode === 0 ? "OK" : `FAILED (exit ${r.exitCode})`;
    console.log(`  ${r.preset.name.padEnd(15)} ${status}`);
  }
  const anyFailed = results.some((r) => r.exitCode !== 0);
  process.exit(anyFailed ? 1 : 0);
}

const invokedAsScript = import.meta.url === `file://${process.argv[1]}`;
if (invokedAsScript) {
  main().catch((err) => {
    console.error("[matrix] fatal:", err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/synthetic/__tests__/run-matrix.test.ts`
Expected: all 10 tests pass.

- [ ] **Step 5: Type check + lint**

Run: `npx tsc --noEmit && npx eslint --config config/lint/eslint.config.js scripts/synthetic/ --quiet`
Expected: exit 0.

- [ ] **Step 6: Smoke test the --list-variants path (no LLM calls)**

Run: `npx tsx scripts/synthetic/run-matrix.ts --list-variants`
Expected: prints "Available variants:" followed by three sections (suggestions, optimize, span-labeling), each listing the seed presets with descriptions.

- [ ] **Step 7: Commit**

```bash
git add scripts/synthetic/run-matrix.ts scripts/synthetic/__tests__/run-matrix.test.ts
git commit -m "feat(synthetic): matrix orchestrator with subprocess isolation per variant

scripts/synthetic/run-matrix.ts spawns one npm-run-synthetic
subprocess per variant, sequentially, with the preset's env vars
merged into the child env. Failed variants don't abort the matrix —
final summary shows per-variant pass/fail.

10 TDD tests cover the pure helpers:
- parseMatrixArgs (--only / --variants / --list-variants parsing,
  required-flag errors, whitespace trimming)
- resolveVariants (lookup against registry, helpful error on unknown
  names listing available variants, empty-list error)
- buildChildEnv (preset env wins over base env on conflicts)

The actual subprocess spawn is integration territory and not
unit-tested. Smoke test via --list-variants exercises the validation
+ CLI parsing paths without burning LLM calls."
```

---

## Task 6: Create `report-matrix.ts` comparison report (TDD)

**Files:**

- Create: `scripts/synthetic/report-matrix.ts`
- Create: `scripts/synthetic/__tests__/report-matrix.test.ts`

- [ ] **Step 1: Write the failing tests for the query construction**

Create `scripts/synthetic/__tests__/report-matrix.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  buildComparisonQuery,
  formatComparisonTable,
  parseSinceArg,
  type SurfaceTelemetry,
} from "../report-matrix.js";

describe("parseSinceArg", () => {
  it("accepts '30m' as 30 minutes", () => {
    expect(parseSinceArg("30m")).toBe("30 MINUTE");
  });

  it("accepts '2h' as 2 hours", () => {
    expect(parseSinceArg("2h")).toBe("2 HOUR");
  });

  it("accepts '1d' as 1 day", () => {
    expect(parseSinceArg("1d")).toBe("1 DAY");
  });

  it("throws on malformed input", () => {
    expect(() => parseSinceArg("abc")).toThrow();
  });

  it("throws when the unit is missing", () => {
    expect(() => parseSinceArg("30")).toThrow();
  });

  it("throws on unknown unit", () => {
    expect(() => parseSinceArg("30y")).toThrow();
  });
});

describe("buildComparisonQuery", () => {
  it("builds a HogQL query that joins quality.scored to suggestions.completed by scoredEventId", () => {
    const sql = buildComparisonQuery("suggestions", "30 MINUTE");
    expect(sql).toContain("quality.scored");
    expect(sql).toContain("suggestions.completed");
    expect(sql).toContain("properties.modelVariant IS NOT NULL");
    expect(sql).toContain("INTERVAL 30 MINUTE");
    expect(sql).toContain("GROUP BY modelVariant");
  });

  it("uses the correct source event name per surface", () => {
    expect(buildComparisonQuery("optimize", "1 HOUR")).toContain(
      "optimize.completed",
    );
    expect(buildComparisonQuery("span-labeling", "1 DAY")).toContain(
      "label-spans.completed",
    );
  });
});

describe("formatComparisonTable", () => {
  it("renders a markdown table with one row per variant", () => {
    const rows: SurfaceTelemetry[] = [
      {
        modelVariant: "qwen",
        n: 47,
        dimensions: {
          relevance: 3.87,
          diversity: 4.06,
          categoryFidelity: 4.51,
          plausibility: 4.7,
          qualityRange: 3.83,
        },
        totalScore: 20.98,
      },
      {
        modelVariant: "gemini",
        n: 47,
        dimensions: {
          relevance: 4.21,
          diversity: 3.95,
          categoryFidelity: 4.62,
          plausibility: 4.55,
          qualityRange: 3.91,
        },
        totalScore: 21.24,
      },
    ];
    const table = formatComparisonTable("suggestions", rows);
    expect(table).toContain("qwen");
    expect(table).toContain("gemini");
    expect(table).toContain("relevance");
    expect(table).toContain("20.98");
    expect(table).toContain("21.24");
    expect(table).toContain("Winner");
  });

  it("handles zero-row case gracefully (no scored events for variants)", () => {
    const table = formatComparisonTable("suggestions", []);
    expect(table).toContain("no scored events");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/synthetic/__tests__/report-matrix.test.ts`
Expected: FAIL — module `../report-matrix.js` cannot be resolved.

- [ ] **Step 3: Implement `report-matrix.ts`**

Create `scripts/synthetic/report-matrix.ts`:

```typescript
/**
 * Sub-project E: matrix comparison report.
 *
 * Queries PostHog for the most recent matrix run's scored events (those
 * whose source event has a non-null modelVariant). Joins quality.scored
 * to the source surface event by scoredEventId, groups by modelVariant,
 * computes per-dimension averages.
 *
 * Usage:
 *   npm run synthetic:report-matrix -- --only suggestions --since 30m
 *
 * Requires POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID in env (same
 * as scripts/quality-judge/calibration/select-samples.ts).
 *
 * See docs/superpowers/specs/2026-05-21-synthetic-model-matrix-design.md
 * § 2.4-2.5 for the data flow and report format.
 */

import "dotenv/config";

import type { Surface } from "./variants.js";

const POSTHOG_HOST = process.env.POSTHOG_HOST ?? "https://us.posthog.com";
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

export interface SurfaceTelemetry {
  modelVariant: string;
  n: number;
  dimensions: Record<string, number>;
  totalScore: number;
}

const SOURCE_EVENT_BY_SURFACE: Record<Surface, string> = {
  suggestions: "suggestions.completed",
  optimize: "optimize.completed",
  "span-labeling": "label-spans.completed",
};

const DIM_KEYS_BY_SURFACE: Record<Surface, readonly string[]> = {
  suggestions: [
    "relevance",
    "diversity",
    "categoryFidelity",
    "plausibility",
    "qualityRange",
  ],
  optimize: [
    "fidelity",
    "detailEnrichment",
    "coherence",
    "constraintCompliance",
    "brevityDiscipline",
  ],
  "span-labeling": [
    "coverage",
    "precision",
    "categoryAccuracy",
    "granularity",
    "boundaryCleanness",
  ],
};

const UNIT_NAME: Record<string, string> = {
  m: "MINUTE",
  h: "HOUR",
  d: "DAY",
};

/**
 * Parse `--since` values like '30m', '2h', '1d' into a HogQL INTERVAL
 * suffix like '30 MINUTE'. Char-by-char parsing (no regex per the
 * project's no-regex rule, and to avoid `.exec()` substring matches
 * that trip security hooks). Throws on malformed input.
 */
export function parseSinceArg(raw: string): string {
  let i = 0;
  while (i < raw.length) {
    const c = raw.charCodeAt(i);
    if (c < 48 || c > 57) break; // not a digit
    i++;
  }
  if (i === 0 || i !== raw.length - 1) {
    throw new Error(
      `Invalid --since value '${raw}'. Use formats like '30m', '2h', '1d'.`,
    );
  }
  const value = raw.slice(0, i);
  const unit = raw[i]!;
  const unitName = UNIT_NAME[unit];
  if (!unitName) {
    throw new Error(`Invalid --since unit '${unit}'. Use 'm', 'h', or 'd'.`);
  }
  return `${value} ${unitName}`;
}

export function buildComparisonQuery(
  surface: Surface,
  interval: string,
): string {
  const sourceEvent = SOURCE_EVENT_BY_SURFACE[surface];
  const dims = DIM_KEYS_BY_SURFACE[surface];
  const dimAggregates = dims
    .map(
      (d) =>
        `avg(toFloat(JSONExtractRaw(q.properties.dimensions, '${d}'))) AS ${d}`,
    )
    .join(",\n         ");

  return `
    SELECT s.properties.modelVariant AS modelVariant,
           count() AS n,
           ${dimAggregates},
           avg(toFloat(q.properties.totalScore)) AS totalScore
    FROM events q
    INNER JOIN events s ON toString(s.uuid) = q.properties.scoredEventId
    WHERE q.event = 'quality.scored'
      AND q.properties.surface = '${surface}'
      AND q.timestamp > now() - INTERVAL ${interval}
      AND s.event = '${sourceEvent}'
      AND s.properties.modelVariant IS NOT NULL
      AND s.timestamp > now() - INTERVAL ${interval}
    GROUP BY modelVariant
    ORDER BY totalScore DESC
  `.trim();
}

export function formatComparisonTable(
  surface: Surface,
  rows: SurfaceTelemetry[],
): string {
  if (rows.length === 0) {
    return `## Sub-project E matrix run — ${surface} surface\n\nno scored events found for any variant in the time window.`;
  }
  const dims = DIM_KEYS_BY_SURFACE[surface];
  const header = ["Variant", "n", ...dims, "total"];
  const sep = header.map((h) => "-".repeat(Math.max(3, h.length)));

  const dataRows = rows.map((r) => [
    r.modelVariant,
    String(r.n),
    ...dims.map((d) => (r.dimensions[d] ?? 0).toFixed(2)),
    r.totalScore.toFixed(2),
  ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...dataRows.map((row) => (row[i] ?? "").length)),
  );

  const fmtRow = (cells: string[]): string =>
    "| " + cells.map((c, i) => c.padEnd(widths[i]!)).join(" | ") + " |";

  const lines: string[] = [];
  lines.push(`## Sub-project E matrix run — ${surface} surface`);
  lines.push("");
  lines.push(fmtRow(header));
  lines.push(fmtRow(sep));
  for (const row of dataRows) {
    lines.push(fmtRow(row));
  }
  lines.push("");

  const winner = rows[0]!;
  const second = rows[1];
  const lead = second
    ? winner.totalScore - second.totalScore
    : winner.totalScore;
  lines.push(
    `Winner (by total): ${winner.modelVariant} — ${winner.totalScore.toFixed(2)}` +
      (second ? ` (+${lead.toFixed(2)} vs ${second.modelVariant})` : ""),
  );

  return lines.join("\n");
}

interface CliArgs {
  surface: Surface;
  since: string;
}

function parseCli(argv: string[]): CliArgs {
  let surface: Surface | null = null;
  let since = "30m";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") {
      const v = argv[++i];
      if (v !== "suggestions" && v !== "optimize" && v !== "span-labeling") {
        throw new Error(
          `--only must be one of: suggestions, optimize, span-labeling (got: ${v})`,
        );
      }
      surface = v;
    } else if (argv[i] === "--since") {
      const v = argv[++i];
      if (!v) throw new Error("--since requires a value");
      since = v;
    }
  }
  if (!surface) throw new Error("--only is required");
  return { surface, since };
}

interface HogQLResponse {
  results: Array<Array<unknown>>;
  columns: string[];
}

async function runHogQL(query: string): Promise<HogQLResponse> {
  if (!POSTHOG_PROJECT_ID || !POSTHOG_PERSONAL_API_KEY) {
    throw new Error(
      "POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY required for matrix report.",
    );
  }
  const url = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) {
    throw new Error(`HogQL ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as HogQLResponse;
}

function rowsFromHogQL(
  surface: Surface,
  response: HogQLResponse,
): SurfaceTelemetry[] {
  const dims = DIM_KEYS_BY_SURFACE[surface];
  return response.results.map((row) => {
    const modelVariant = String(row[0]);
    const n = Number(row[1]);
    const dimensions: Record<string, number> = {};
    for (let i = 0; i < dims.length; i++) {
      dimensions[dims[i]!] = Number(row[2 + i]);
    }
    const totalScore = Number(row[2 + dims.length]);
    return { modelVariant, n, dimensions, totalScore };
  });
}

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2));
  const interval = parseSinceArg(args.since);
  const query = buildComparisonQuery(args.surface, interval);
  const response = await runHogQL(query);
  const rows = rowsFromHogQL(args.surface, response);
  console.log(formatComparisonTable(args.surface, rows));
}

const invokedAsScript = import.meta.url === `file://${process.argv[1]}`;
if (invokedAsScript) {
  main().catch((err) => {
    console.error("[report-matrix] fatal:", err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/synthetic/__tests__/report-matrix.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 5: Type check + lint**

Run: `npx tsc --noEmit && npx eslint --config config/lint/eslint.config.js scripts/synthetic/ --quiet`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/synthetic/report-matrix.ts scripts/synthetic/__tests__/report-matrix.test.ts
git commit -m "feat(synthetic): matrix comparison report

scripts/synthetic/report-matrix.ts queries PostHog for the most recent
matrix run's scored events. Joins quality.scored to the source surface
event by scoredEventId, groups by modelVariant, computes per-dimension
averages. Prints a markdown comparison table to stdout with the
highest-total variant marked as winner.

CLI: 'npm run synthetic:report-matrix -- --only suggestions --since 30m'

9 TDD tests cover the pure helpers:
- parseSinceArg ('30m', '2h', '1d' parsed; malformed input throws;
  unknown unit throws). Char-by-char parsing per project no-regex rule.
- buildComparisonQuery (correct HogQL shape, surface-specific source
  event names, modelVariant filter present)
- formatComparisonTable (markdown rendering, zero-row case handled
  gracefully, winner annotation)"
```

---

## Task 7: Add npm scripts + create README

**Files:**

- Modify: `package.json`
- Create: `scripts/synthetic/README.md`

- [ ] **Step 1: Add npm scripts**

In `package.json`, find the `"scripts"` section. Add two new entries near the existing `"synthetic"` entry:

```jsonc
    "synthetic": "tsx scripts/synthetic/run-harness.ts",
    "synthetic:matrix": "tsx scripts/synthetic/run-matrix.ts",
    "synthetic:report-matrix": "tsx scripts/synthetic/report-matrix.ts",
```

- [ ] **Step 2: Create the README**

Create `scripts/synthetic/README.md`:

````markdown
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
````

- [ ] **Step 3: Verify package.json is still valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" && echo OK`
Expected: `OK`.

- [ ] **Step 4: Verify the npm scripts work**

Run: `npm run synthetic:matrix -- --list-variants 2>&1 | head -20`
Expected: prints "Available variants:" with the seed presets per surface.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/synthetic/README.md
git commit -m "docs(synthetic): add matrix npm scripts + harness README

package.json gains synthetic:matrix and synthetic:report-matrix
scripts. scripts/synthetic/README.md documents:
  - the env-var swap mechanism that already exists in modelConfig.ts
  - the new --variant-tag flag for tagging events with a model name
  - the matrix workflow (list-variants -> matrix -> judge -> report)
  - per-surface env vars (corrects the spec's earlier confusion
    about SPAN_LABELING_PROVIDER — the actual var is SPAN_PROVIDER)
  - cost-per-variant guidance"
```

---

## Task 8: End-to-end verification

**Files:**

- (read-only verification; docs update in Task 9)

- [ ] **Step 1: Run matrix with 2 variants on suggestions**

Run: `npm run synthetic:matrix -- --only suggestions --variants qwen,gemini 2>&1 | tail -30`
Expected: orchestrator prints "running 2 variants" then runs each subprocess; final summary marks both as `OK`. Total runtime ~30-60 sec per variant.

Cost: ~$0.20 per variant in Qwen/Gemini calls + the upcoming judge run.

- [ ] **Step 2: Verify variant tagging worked**

Use the PostHog `mcp__posthog__execute-sql` tool (or `npx tsx` with a one-off query) to verify both variants emitted with the modelVariant tag:

```sql
SELECT properties.modelVariant AS variant, count() AS n
FROM events
WHERE event = 'suggestions.completed'
  AND properties.modelVariant IN ('qwen', 'gemini')
  AND timestamp > now() - INTERVAL 15 MINUTE
GROUP BY variant
```

Expected: two rows, one per variant, each with `n` matching the fixture's highlights count (~58).

- [ ] **Step 3: Run the judge**

Run: `npm run judge:run -- --surface suggestions 2>&1 | tail -10`
Expected: prints `running for suggestions`; no per-event errors.

- [ ] **Step 4: Run the comparison report**

Run: `npm run synthetic:report-matrix -- --only suggestions --since 30m 2>&1 | tail -25`
Expected: prints a markdown table with two rows (qwen, gemini), per-dimension averages, total scores, and a winner annotation.

- [ ] **Step 5: Sanity-check the report numbers against PostHog directly**

The report's totals should match what a direct PostHog query for `quality.scored` events filtered by `modelVariant` returns. If they don't match, the report's HogQL has drift — debug before continuing.

---

## Task 9: Update Measurement Program reordering log

**Files:**

- Modify: `docs/superpowers/programs/measurement.md`

- [ ] **Step 1: Add a reordering-log entry**

In `docs/superpowers/programs/measurement.md`, find the `### Reordering log` section. Insert a new entry at the top of the chronological list (after the most recent existing entry):

```markdown
- **2026-05-21 (Sub-project E):** Synthetic model matrix + comparison report shipped. Three new entrypoints: `scripts/synthetic/variants.ts` (typed preset registry), `scripts/synthetic/run-matrix.ts` (subprocess orchestrator), `scripts/synthetic/report-matrix.ts` (HogQL comparison query + markdown table). All three surface telemetry events gain optional `modelVariant?: string \| null` field. `run-harness.ts` gains `--variant-tag <name>` flag. Span-labeling driver aligned with the existing `SPAN_PROVIDER`/`SPAN_MODEL` env vars from `modelConfig.ts:391-392` — previously the driver hardcoded telemetry-annotation constants that drifted from what aiService actually routed to. New principle encoded: _measurement tooling that exists in two places (the routing layer in `modelConfig.ts` and the telemetry annotation in driver files) must read from the same env vars; drift between them produces silently-wrong telemetry that misattributes results to the wrong model._ Unblocks Sub-project B2 (Qwen vs Gemini emission-rate comparison) by making the question empirically answerable via `npm run synthetic:matrix -- --only suggestions --variants qwen,gemini` instead of manual env-edit + uncorrelated PostHog queries. End-to-end verification: 2-variant matrix run produced tagged events, judge scored them, report rendered the comparison table. Caveat: per-variant cost is ~$0.30 (synthetic + judge), no hard budget guard.
```

- [ ] **Step 2: Type/lint sanity (docs only)**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/programs/measurement.md
git commit -m "docs(measurement): record Sub-project E (synthetic model matrix) shipment

Reordering-log entry summarizing the three new entrypoints (variants.ts,
run-matrix.ts, report-matrix.ts), the modelVariant field on all three
surface telemetry events, the --variant-tag flag on run-harness.ts,
and the span-labeling driver alignment with SPAN_PROVIDER/SPAN_MODEL.

Encodes the principle: measurement tooling that exists in two places
(routing config + telemetry annotation) must read from the same env
vars or telemetry will silently misattribute results.

Sub-project E unblocks B2 (Qwen vs Gemini emission-rate comparison)
by making it empirically answerable."
```

---

## Self-Review

**Spec coverage check:**

- Spec § 0 motivation (Qwen emission rate unblock, env-var discoverability, tagging, matrix, span-labeling alignment) → captured in plan goal + all tasks 1-9.
- Spec § 1 locked decisions: TypeScript preset registry → Task 4. Subprocess per variant → Task 5 (`spawn` + `stdio: "inherit"`). Sequential execution → Task 5 (`for` loop with `await`). One surface per matrix invocation → Task 5 (`parseMatrixArgs` requires `--only`). Field name `modelVariant` → Task 1. Backward compatibility → Task 1 (`?? null`) + Task 2 (variantTag defaults to null). Report data source = existing `quality.scored` events joined to source events → Task 6. Report output = markdown table + dashboard URL → Task 6 (table); dashboard URL deferred to README per spec § 2.5. Judge swap out of scope → not in plan. Span-labeling alignment → Task 3 step 3.
- Spec § 2.1 variant preset shape → Task 4 `variants.ts`.
- Spec § 2.2 CLI surface → Task 2 (`--variant-tag`), Task 5 (`--only`, `--variants`, `--list-variants`), Task 6 (`--only`, `--since`).
- Spec § 2.3 event tagging → Task 1.
- Spec § 2.4 data flow → Task 5 (orchestrator) + Task 8 (verification).
- Spec § 2.5 comparison report format → Task 6 `formatComparisonTable`.
- Spec § 3 NOT scope (judge swap, auto-dashboard, cross-surface matrix, parallel execution, cost guards, continuous matrix) → none of these tasks implement them.
- Spec § 4 risks: subprocess env precedence → Task 5 `buildChildEnv` test. New env-var hooks regressing existing harness → Task 3's defaults preserve current behavior. modelVariant on OpenAI strict schema — N/A; it's on TELEMETRY events, not LLM output. Cost runaway → README + matrix orchestrator print estimated cost. Report query timeout → uses same subquery pattern from Sub-project B. Spawn overhead → acceptable. One variant erroring aborts matrix → Task 5 main() collects per-variant exit codes, doesn't abort.
- Spec § 5 sequencing → matches task order 1→2→3→4→5→6→7→8→9.

**Placeholder scan:** every step has actual content. No "TBD" or "implement later". The reordering-log entry in Task 9 has specific text not a placeholder.

**Type consistency:**

- `VariantPreset` defined in Task 4, used in Task 5 (`resolveVariants` return) and Task 6 (not directly referenced; `SurfaceTelemetry` is a different per-row type).
- `Surface` type defined in Task 4 as `"suggestions" | "optimize" | "span-labeling"`, used consistently across Tasks 5 and 6.
- `MatrixArgs` defined in Task 5, exported for testing.
- `SurfaceTelemetry` defined in Task 6, used by `formatComparisonTable` and `rowsFromHogQL`.
- `DriverDeps.variantTag: string | null` added in Task 3 across all three drivers, matches the `variantTag` field added to `CliConfig` in Task 2.
- `modelVariant?: string | null` field added consistently across the four telemetry interfaces in Task 1.
- `VALID_ENV_KEYS` whitelist in Task 4 matches the env vars actually documented in Task 7's README.

**No-regex compliance:** `parseSinceArg` in Task 6 uses char-by-char parsing (no `RegExp` literal, no `.exec()` method). The few regex literals in the test files (`/--only is required/i` etc.) are vitest `toThrow()` matchers — those are assertions about error messages, not classification logic, and use plain string-contains semantics under the hood. No new product-level classification regexes introduced.
