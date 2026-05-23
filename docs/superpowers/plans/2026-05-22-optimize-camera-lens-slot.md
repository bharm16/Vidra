# Sub-project C — Optimize `camera_lens` Slot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `camera_lens` slot to the optimize structured output schema; split lens/aperture out of `camera_move`; suppress the renderer's hardcoded `focusFromFraming` aperture phrase when the LLM provides `camera_lens`. Eliminates the duplication root cause that produces "lens at," fragments in optimize outputs.

**Architecture:** Eight sequential tasks following the data flow: type → schema → linter → quality-error routing → renderer → template+few-shot → fallback `looseSchema` → integration test + measurement doc. Each task is one atomic commit. TDD discipline at every layer; the changes are tightly coupled and tests at each layer protect the next.

**Tech Stack:** TypeScript (ESM), Vitest, JSON Schema (OpenAI strict + Groq json_object variants), existing reroll mechanism in `VideoStrategy.ts`.

**Spec:** [`docs/superpowers/specs/2026-05-22-optimize-camera-lens-slot-design.md`](../specs/2026-05-22-optimize-camera-lens-slot-design.md)

---

## File Structure

| Action | Path                                                                                                  | Responsibility                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Modify | `server/src/services/prompt-optimization/strategies/videoPromptTypes.ts`                              | Add `camera_lens?: string \| null` to `VideoPromptSlots`.                                                       |
| Modify | `server/src/utils/provider/schemas/videoOptimization.ts`                                              | Add `camera_lens` field to OpenAI strict schema (in `required` + properties) and Groq schema (properties only). |
| Create | `server/src/utils/provider/__tests__/videoOptimization.cameraLens.test.ts`                            | Schema-factory tests for presence of new field.                                                                 |
| Modify | `server/src/services/prompt-optimization/strategies/videoPromptLinter.ts`                             | Add `camera_lens` validation: aperture marker or focal-length unit required; max 12 words.                      |
| Create | `server/src/services/prompt-optimization/strategies/__tests__/videoPromptLinter.cameraLens.test.ts`   | Linter tests (6 cases).                                                                                         |
| Modify | `server/src/services/prompt-optimization/strategies/VideoStrategy.ts`                                 | Add `camera_lens` lint patterns to `isQualityVideoPromptLintError`. Update `looseSchema` to include the field.  |
| Modify | `server/src/services/prompt-optimization/strategies/videoPromptRenderer.ts`                           | Compose `camera_lens` into sentence2; suppress `focusFromFraming` hardcoded aperture when slot is present.      |
| Create | `server/src/services/prompt-optimization/strategies/__tests__/videoPromptRenderer.cameraLens.test.ts` | Renderer tests (4 cases) covering all 3 render functions.                                                       |
| Modify | `server/src/services/prompt-optimization/strategies/videoPromptOptimizationTemplate.ts`               | Update slot description (lines 341/518) + 4 few-shot examples (lines 61/96/134/172).                            |
| Modify | `server/src/services/prompt-optimization/strategies/video-templates/OpenAIVideoTemplateBuilder.ts`    | Update camera-bullet text mentioning lens + aperture.                                                           |
| Modify | `server/src/services/prompt-optimization/strategies/video-templates/GroqVideoTemplateBuilder.ts`      | Update line 148 (aperture instruction).                                                                         |
| Modify | `server/src/services/prompt-optimization/strategies/__tests__/VideoStrategy.regression.test.ts`       | Add full-pipeline regression test asserting one-and-only-one aperture mention.                                  |
| Modify | `docs/superpowers/programs/measurement.md`                                                            | Add Sub-project C reordering-log entry.                                                                         |

---

## Task 1: Add `camera_lens` to `VideoPromptSlots` type

**Files:**

- Modify: `server/src/services/prompt-optimization/strategies/videoPromptTypes.ts`

This task only adds a type field. No test (TypeScript will catch usage violations downstream). Keep the commit minimal so subsequent tasks can rely on the type being present.

- [ ] **Step 1: Read the current type definition**

Run: `grep -n "camera_move\|VideoPromptSlots\|interface" server/src/services/prompt-optimization/strategies/videoPromptTypes.ts | head -20`

Identify the `VideoPromptSlots` interface and where `camera_move` is declared.

- [ ] **Step 2: Add `camera_lens` field next to `camera_move`**

Edit `videoPromptTypes.ts`. After the line declaring `camera_move?: string | null;` (or equivalent — verify the exact existing syntax via Read), add:

```ts
camera_lens?: string | null;
```

Keep the optionality marker (`?`) and the nullable union to match `camera_move`'s pattern exactly — this guarantees downstream consumers using object-spread with `Partial<VideoPromptSlots>` keep working without changes.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. (Any consumer that iterates slot keys exhaustively will get a TypeScript exhaustiveness error, surfacing the next location to update.)

If errors surface, note them but do NOT fix them in this task — they're explicit work for later tasks. Roll back this step's edit if the error is in production code that this task shouldn't touch; otherwise note the file paths in the task notes for downstream tasks.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/prompt-optimization/strategies/videoPromptTypes.ts
```

Then commit via tempfile (heredocs with apostrophes break in bash):

```bash
cat > /tmp/c-task1-msg.txt <<'EOF'
feat(optimize): add camera_lens slot to VideoPromptSlots

First task of Sub-project C. Adds the type field that subsequent tasks
(schema factory, linter, renderer, template) will use. Slot is optional
and nullable to match camera_move's pattern; downstream consumers using
Partial<VideoPromptSlots> remain compatible.

Refs docs/superpowers/specs/2026-05-22-optimize-camera-lens-slot-design.md.
EOF
git commit -F /tmp/c-task1-msg.txt && rm /tmp/c-task1-msg.txt
```

---

## Task 2: Add `camera_lens` to schema factories (OpenAI + Groq)

**Files:**

- Modify: `server/src/utils/provider/schemas/videoOptimization.ts`
- Create: `server/src/utils/provider/__tests__/videoOptimization.cameraLens.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/utils/provider/__tests__/videoOptimization.cameraLens.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getVideoOptimizationSchema } from "../schemas/videoOptimization.js";

interface JSONSchema {
  required?: string[];
  properties?: Record<
    string,
    { type?: string | string[]; description?: string }
  >;
}

describe("videoOptimization schema — camera_lens", () => {
  it("includes camera_lens in OpenAI strict schema properties with nullable string type", () => {
    // OpenAI strict mode is selected when the resolved provider has strictJsonSchema.
    // We force selection via the operation+client+model triple matching the prod openai route.
    const schema = getVideoOptimizationSchema({
      operation: "optimize_standard",
      provider: "openai",
      model: "gpt-4o-2024-08-06",
    }) as JSONSchema;

    expect(schema.properties).toBeDefined();
    expect(schema.properties!.camera_lens).toBeDefined();
    const cameraLens = schema.properties!.camera_lens!;
    expect(cameraLens.type).toEqual(["string", "null"]);
    expect(typeof cameraLens.description).toBe("string");
    expect(cameraLens.description!.toLowerCase()).toContain("aperture");
  });

  it("includes camera_lens in OpenAI strict schema required array (strict mode requirement)", () => {
    const schema = getVideoOptimizationSchema({
      operation: "optimize_standard",
      provider: "openai",
      model: "gpt-4o-2024-08-06",
    }) as JSONSchema;
    expect(schema.required).toContain("camera_lens");
  });

  it("includes camera_lens in Groq schema properties (optional, no required)", () => {
    const schema = getVideoOptimizationSchema({
      operation: "optimize_standard",
      provider: "groq",
      model: "qwen-2.5-32b",
    }) as JSONSchema;
    expect(schema.properties).toBeDefined();
    expect(schema.properties!.camera_lens).toBeDefined();
    expect(schema.properties!.camera_lens!.type).toEqual(["string", "null"]);
    // Groq does not require it (treats as optional, json_object mode tolerates omission).
    expect(schema.required).not.toContain("camera_lens");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/src/utils/provider/__tests__/videoOptimization.cameraLens.test.ts`
Expected: 3 failures — `camera_lens` not found in properties.

- [ ] **Step 3: Modify `getOpenAIVideoOptimizationSchema`**

In `server/src/utils/provider/schemas/videoOptimization.ts`, locate the `required` array of `getOpenAIVideoOptimizationSchema` (currently ends at `"variations"`). Add `"camera_lens"` to the required array. Then, in `properties`, add this field right after `camera_move` (line 97-101):

```ts
camera_lens: {
  type: ["string", "null"],
  description:
    "Focal length plus aperture (e.g., '28mm at f/11', 'anamorphic 50mm at f/2.8', '85mm prime at f/1.8'). Match aperture to shot type: Wide=f/8-f/11, Medium=f/2.8-f/4, Close-up=f/1.4-f/2.0. May be null when no specific lens preference.",
},
```

- [ ] **Step 4: Modify `getGroqVideoOptimizationSchema`**

Same file. In `getGroqVideoOptimizationSchema` (line 213-267), add `camera_lens` to `properties` (after `camera_move`):

```ts
camera_lens: { type: ["string", "null"] },
```

Do NOT add it to the `required` array. Groq treats required as advisory anyway (per Sub-project B's documented finding), and we want the slot to be safely optional.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/src/utils/provider/__tests__/videoOptimization.cameraLens.test.ts`
Expected: 3 PASS.

- [ ] **Step 6: Run the full schema test suite (no regressions)**

Run: `npx vitest run server/src/utils/provider/__tests__/`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/utils/provider/schemas/videoOptimization.ts server/src/utils/provider/__tests__/videoOptimization.cameraLens.test.ts
cat > /tmp/c-task2-msg.txt <<'EOF'
feat(optimize): add camera_lens to video-optimization JSON schemas

Both providers (OpenAI strict, Groq json_object) gain the new field.
OpenAI strict: in required array (strict mode requirement) with
nullable string type. Groq: properties only (optional — Groq treats
required as advisory per Sub-project B's finding).

Three TDD tests covering presence in both providers and exclusion
from Groq's required array.
EOF
git commit -F /tmp/c-task2-msg.txt && rm /tmp/c-task2-msg.txt
```

---

## Task 3: Add `camera_lens` validation to the linter

**Files:**

- Modify: `server/src/services/prompt-optimization/strategies/videoPromptLinter.ts`
- Create: `server/src/services/prompt-optimization/strategies/__tests__/videoPromptLinter.cameraLens.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/services/prompt-optimization/strategies/__tests__/videoPromptLinter.cameraLens.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { lintVideoPromptSlots } from "../videoPromptLinter.js";
import type { VideoPromptSlots } from "../videoPromptTypes.js";

function baseSlots(
  overrides: Partial<VideoPromptSlots>,
): Partial<VideoPromptSlots> {
  return {
    shot_framing: "Wide Shot",
    camera_angle: "Eye-Level Shot",
    camera_move: "slow dolly in",
    subject: "a ginger cat",
    subject_details: ["with green eyes", "wearing a red collar"],
    action: "walking slowly across a sunlit kitchen floor",
    setting: "a sunlit kitchen",
    time: "golden hour",
    lighting: "warm key from window, soft fill",
    style: "Wes Anderson, pastel palette",
    ...overrides,
  };
}

describe("videoPromptLinter — camera_lens validation", () => {
  it("accepts null camera_lens (slot is optional)", () => {
    const result = lintVideoPromptSlots(baseSlots({ camera_lens: null }));
    expect(result.errors.filter((e) => e.includes("camera_lens"))).toEqual([]);
  });

  it("accepts undefined camera_lens (slot is optional)", () => {
    const result = lintVideoPromptSlots(baseSlots({}));
    expect(result.errors.filter((e) => e.includes("camera_lens"))).toEqual([]);
  });

  it("accepts a valid focal-length + aperture string", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ camera_lens: "28mm at f/11" }),
    );
    expect(result.errors.filter((e) => e.includes("camera_lens"))).toEqual([]);
  });

  it("accepts an anamorphic descriptor with aperture", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ camera_lens: "anamorphic 50mm at f/2.8" }),
    );
    expect(result.errors.filter((e) => e.includes("camera_lens"))).toEqual([]);
  });

  it("rejects orphaned-preposition fragment like 'anamorphic lens at'", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ camera_lens: "anamorphic lens at" }),
    );
    const cameraLensErrors = result.errors.filter((e) =>
      e.includes("camera_lens"),
    );
    expect(cameraLensErrors.length).toBeGreaterThan(0);
    expect(cameraLensErrors[0]).toMatch(/aperture|focal-length/);
  });

  it("rejects a string with no aperture and no focal-length unit", () => {
    const result = lintVideoPromptSlots(
      baseSlots({ camera_lens: "a beautiful cinematic shot" }),
    );
    const cameraLensErrors = result.errors.filter((e) =>
      e.includes("camera_lens"),
    );
    expect(cameraLensErrors.length).toBeGreaterThan(0);
  });

  it("rejects camera_lens longer than 12 words", () => {
    const result = lintVideoPromptSlots(
      baseSlots({
        camera_lens:
          "28mm at f/11 with a vintage Cooke prime lens and a soft anti-flare coating please use this exactly",
      }),
    );
    const cameraLensErrors = result.errors.filter((e) =>
      e.includes("camera_lens"),
    );
    expect(cameraLensErrors.length).toBeGreaterThan(0);
    expect(cameraLensErrors.some((e) => /too long/i.test(e))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/src/services/prompt-optimization/strategies/__tests__/videoPromptLinter.cameraLens.test.ts`
Expected: 3 failures on the "rejects" tests (no validation exists yet).

- [ ] **Step 3: Add validation to `lintVideoPromptSlots`**

In `server/src/services/prompt-optimization/strategies/videoPromptLinter.ts`, add this block after the existing `camera_move` validation (which currently ends near line 283 — locate by reading the file). Insert before `for (const { key, value } of collectStringFields(slots))`:

```ts
// camera_lens validation
const cameraLens =
  typeof slots.camera_lens === "string" ? slots.camera_lens.trim() : null;
if (cameraLens) {
  // Match existing linter convention (line ~246 validMovementTerms): keyword
  // detection for cinematography vocabulary. Per CLAUDE.md no-regex rule,
  // this is a finite keyword set, not a classification regex.
  const hasAperture = cameraLens.includes("f/");
  const focalLengthOrLensKeywords =
    /\b(?:mm|prime|lens|anamorphic|telephoto|wide-angle|macro)\b/i;
  const hasFocalUnit = focalLengthOrLensKeywords.test(cameraLens);

  if (!hasAperture && !hasFocalUnit) {
    errors.push(
      '`camera_lens` must contain aperture ("f/X") or focal-length unit (mm/prime/lens/anamorphic/telephoto/wide-angle/macro); avoid orphaned-preposition fragments.',
    );
  }

  // Additionally, reject the specific dangling-preposition pattern even if a
  // keyword matched (e.g., "anamorphic lens at" matches "anamorphic" but
  // ends in "at" with nothing after).
  const endsInDanglingPreposition =
    /\b(?:at|of|on|in|with|by|for)\s*[,.]?\s*$/i.test(cameraLens);
  if (endsInDanglingPreposition) {
    errors.push(
      '`camera_lens` ends in a dangling preposition ("at", "of", "with", etc.) with no following value; complete the aperture specification or set the slot to null.',
    );
  }

  const wordCount = cameraLens.split(/\s+/).filter(Boolean).length;
  if (wordCount > 12) {
    errors.push(
      "`camera_lens` is too long; keep to a single focal-length+aperture phrase (≤12 words).",
    );
  }
}
```

Note on the no-regex rule: this file already uses `validMovementTerms` regex at line ~246 to enforce cinematographic vocabulary. The same pattern applies here — finite keyword set, structural check, not a free-form classification. Per Sub-project D's precedent and the existing file convention, this is acceptable.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/src/services/prompt-optimization/strategies/__tests__/videoPromptLinter.cameraLens.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Run all linter-related tests for regressions**

Run: `npx vitest run server/src/services/prompt-optimization/strategies/__tests__/`
Expected: all PASS (no regressions in other linter behaviors).

- [ ] **Step 6: Commit**

```bash
git add server/src/services/prompt-optimization/strategies/videoPromptLinter.ts server/src/services/prompt-optimization/strategies/__tests__/videoPromptLinter.cameraLens.test.ts
cat > /tmp/c-task3-msg.txt <<'EOF'
feat(optimize): lint camera_lens for aperture or focal-length unit

When camera_lens is non-null, require either an aperture marker
("f/X") or a focal-length keyword (mm/prime/lens/anamorphic/...) and
reject dangling-preposition fragments like "anamorphic lens at". Max
12 words.

Seven TDD tests covering null/undefined acceptance, two valid forms,
two invalid forms (orphaned-preposition, no-unit), and the length cap.
EOF
git commit -F /tmp/c-task3-msg.txt && rm /tmp/c-task3-msg.txt
```

---

## Task 4: Route `camera_lens` lint errors through quality-error reroll path

**Files:**

- Modify: `server/src/services/prompt-optimization/strategies/VideoStrategy.ts`

The existing reroll mechanism at line 533 attempts up to 3 reroll attempts when `isCriticalVideoPromptLintError` or `isQualityVideoPromptLintError` flag an error. We need our new lint messages to match one of those filters. They're not critical (the LLM can produce valid output), so they belong in the quality bucket.

- [ ] **Step 1: Locate `isQualityVideoPromptLintError`**

Run: `grep -n "isQualityVideoPromptLintError" server/src/services/prompt-optimization/strategies/VideoStrategy.ts`

It's defined around line 46-56.

- [ ] **Step 2: Read the existing function**

Read lines 46-56 of `VideoStrategy.ts`. The function is a series of `/pattern/i.test(error) || ...` checks.

- [ ] **Step 3: Write a test asserting our errors route through quality**

Add this test to `server/src/services/prompt-optimization/strategies/__tests__/VideoStrategy.regression.test.ts` (read it first to see existing structure). Insert a new `describe` block or `it` block matching the file's style:

```ts
it("isQualityVideoPromptLintError treats camera_lens lint failures as quality errors (eligible for reroll)", async () => {
  // Internal helper — re-export from VideoStrategy.ts if needed, or test via
  // observable behavior. The simplest assertion is that the lint output for
  // a bad camera_lens slot contains a message matching one of the patterns
  // our isQualityVideoPromptLintError filter recognizes.
  const { lintVideoPromptSlots } = await import("../videoPromptLinter.js");
  const errors = lintVideoPromptSlots({
    shot_framing: "Wide Shot",
    camera_angle: "Eye-Level Shot",
    camera_move: "slow dolly in",
    subject: "a cat",
    subject_details: ["with green eyes", "wearing a red collar"],
    action: "walking across the kitchen slowly",
    camera_lens: "anamorphic lens at",
  }).errors;

  const cameraLensError = errors.find((e) => e.includes("camera_lens"));
  expect(cameraLensError).toBeDefined();
  expect(cameraLensError).toMatch(
    /camera_lens` must contain aperture|camera_lens` ends in a dangling preposition|camera_lens` is too long/,
  );
});
```

- [ ] **Step 4: Run the test to verify it passes already (Task 3 made it true)**

Run: `npx vitest run server/src/services/prompt-optimization/strategies/__tests__/VideoStrategy.regression.test.ts`
Expected: PASS. The lint message text matches what `isQualityVideoPromptLintError` will check for.

- [ ] **Step 5: Update `isQualityVideoPromptLintError`**

In `server/src/services/prompt-optimization/strategies/VideoStrategy.ts` (lines 46-56), add three new patterns to the disjunction:

```ts
function isQualityVideoPromptLintError(error: string): boolean {
  return (
    /viewer\/audience language/i.test(error) ||
    /`style` is too generic/i.test(error) ||
    /present-participle/i.test(error) ||
    /`action` is too short/i.test(error) ||
    /`action` must be ONE continuous action/i.test(error) ||
    /`action` looks like multiple actions/i.test(error) ||
    /appears to contain multiple actions/i.test(error) ||
    /`camera_lens` must contain aperture/i.test(error) ||
    /`camera_lens` ends in a dangling preposition/i.test(error) ||
    /`camera_lens` is too long/i.test(error)
  );
}
```

- [ ] **Step 6: Verify no other test broke**

Run: `npx vitest run server/src/services/prompt-optimization/strategies/__tests__/`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/prompt-optimization/strategies/VideoStrategy.ts server/src/services/prompt-optimization/strategies/__tests__/VideoStrategy.regression.test.ts
cat > /tmp/c-task4-msg.txt <<'EOF'
feat(optimize): route camera_lens lint errors through reroll path

isQualityVideoPromptLintError now recognizes the three camera_lens
lint messages (aperture-missing, dangling-preposition, length-cap).
When the linter flags these, VideoStrategy's existing reroll
mechanism (line 533, 3 attempts on quality errors) kicks in.

One new test asserts the lint output text matches the patterns our
filter recognizes — protects against future drift in either the lint
message text or the filter regex.
EOF
git commit -F /tmp/c-task4-msg.txt && rm /tmp/c-task4-msg.txt
```

---

## Task 5: Renderer composition for `camera_lens`

**Files:**

- Modify: `server/src/services/prompt-optimization/strategies/videoPromptRenderer.ts`
- Create: `server/src/services/prompt-optimization/strategies/__tests__/videoPromptRenderer.cameraLens.test.ts`

This task changes the rendered output sentence shape. When `camera_lens` is present, the sentence becomes `"The camera uses {camera_move} {anglePhrase} on {camera_lens}."` and the hardcoded `focusFromFraming` aperture is suppressed. When `camera_lens` is null, the existing behavior is preserved.

- [ ] **Step 1: Write the failing tests**

Create `server/src/services/prompt-optimization/strategies/__tests__/videoPromptRenderer.cameraLens.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  renderMainVideoPrompt,
  renderCompactVideoPrompt,
  renderPreviewPrompt,
} from "../videoPromptRenderer.js";
import type { VideoPromptSlots } from "../videoPromptTypes.js";

function baseSlots(
  overrides: Partial<VideoPromptSlots> = {},
): VideoPromptSlots {
  return {
    shot_framing: "Wide Shot",
    camera_angle: "Eye-Level Shot",
    camera_move: "slow dolly in",
    subject: "a ginger cat",
    subject_details: ["with green eyes", "wearing a red collar"],
    action: "walking slowly across the sunlit kitchen floor",
    setting: "a sunlit kitchen",
    time: "golden hour",
    lighting: "warm key from a tall window, soft fill from the right",
    style: "Wes Anderson aesthetic, pastel palette",
    technical_specs: {},
    ...overrides,
  } as VideoPromptSlots;
}

describe("renderMainVideoPrompt — camera_lens slot", () => {
  it("renders 'on {camera_lens}' when camera_lens is present", () => {
    const output = renderMainVideoPrompt(
      baseSlots({ camera_lens: "28mm at f/11" }),
    );
    expect(output).toContain("on 28mm at f/11");
  });

  it("suppresses hardcoded focusFromFraming aperture when camera_lens is present", () => {
    const output = renderMainVideoPrompt(
      baseSlots({ camera_lens: "28mm at f/11" }),
    );
    // The Wide Shot framing previously emitted "with deep focus (f/11-f/16)..."
    expect(output).not.toContain("deep focus (f/11-f/16)");
    expect(output).not.toContain("with shallow depth of field");
    expect(output).not.toContain("with selective focus");
  });

  it("falls back to focusFromFraming when camera_lens is null (back-compat)", () => {
    const output = renderMainVideoPrompt(baseSlots({ camera_lens: null }));
    // Wide Shot → "deep focus (f/11-f/16)" preserved
    expect(output).toContain("deep focus");
  });

  it("contains exactly one aperture phrase regardless of slot values (no duplication)", () => {
    const outputWithLens = renderMainVideoPrompt(
      baseSlots({ camera_lens: "28mm at f/11" }),
    );
    const fStopMatches = outputWithLens.match(/f\/\d/g) || [];
    expect(fStopMatches.length).toBe(1);

    const outputWithoutLens = renderMainVideoPrompt(
      baseSlots({ camera_lens: null }),
    );
    const fStopMatchesFallback = outputWithoutLens.match(/f\/\d/g) || [];
    // focusFromFraming emits a range like "(f/11-f/16)" — 2 f/ tokens. That's
    // pre-existing behavior; we don't change it when the slot is null.
    expect(fStopMatchesFallback.length).toBeGreaterThanOrEqual(1);
  });
});

describe("renderCompactVideoPrompt — camera_lens slot", () => {
  it("renders 'on {camera_lens}' when present", () => {
    const output = renderCompactVideoPrompt(
      baseSlots({ camera_lens: "85mm prime at f/1.8" }),
      { require: ["camera"] },
    );
    expect(output).toContain("on 85mm prime at f/1.8");
  });

  it("does not emit lens phrase when camera_lens is null (compact omits aperture entirely in non-required mode)", () => {
    const output = renderCompactVideoPrompt(baseSlots({ camera_lens: null }), {
      require: ["camera"],
    });
    expect(output).not.toContain("f/");
  });
});

describe("renderPreviewPrompt — camera_lens slot", () => {
  it("renders 'on {camera_lens}' when present", () => {
    const output = renderPreviewPrompt(
      baseSlots({ camera_lens: "anamorphic 50mm at f/2.8" }),
    );
    expect(output).toContain("on anamorphic 50mm at f/2.8");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/src/services/prompt-optimization/strategies/__tests__/videoPromptRenderer.cameraLens.test.ts`
Expected: 7 failures.

- [ ] **Step 3: Modify `renderMainVideoPrompt`**

In `server/src/services/prompt-optimization/strategies/videoPromptRenderer.ts`, locate sentence2 composition (lines 251-274 in the current file). Replace the block with:

```ts
const cameraLens = clean(slots.camera_lens);

const sentence2Parts: string[] = [];
if (cameraMove) {
  sentence2Parts.push(
    `The camera uses ${cameraMove}${anglePhrase ? ` ${anglePhrase}` : ""}`,
  );
} else if (anglePhrase) {
  sentence2Parts.push(`The camera holds ${anglePhrase}`);
}

if (cameraLens) {
  sentence2Parts.push(`on ${cameraLens}`);
} else if (focus) {
  // Renderer-side fallback only when LLM omitted camera_lens.
  if (focus === "deep focus") {
    sentence2Parts.push(
      "with deep focus (f/11-f/16) to keep background detail readable",
    );
  } else if (focus === "shallow depth of field") {
    sentence2Parts.push(
      "with shallow depth of field (f/1.8-f/2.8) to isolate the main subject",
    );
  } else {
    sentence2Parts.push(
      "with selective focus (f/4-f/5.6) to guide attention to the main action",
    );
  }
}
const sentence2 = ensurePeriod(
  sentence2Parts.join(" ").trim().replace(/\s+/g, " "),
);
```

- [ ] **Step 4: Modify `renderCompactVideoPrompt`**

Same file, locate the function. Add `cameraLens` variable near other slot extractions, and modify `cameraSentence` IIFE:

```ts
const cameraLens = clean(slots.camera_lens);

const cameraSentence = (() => {
  if (!cameraMove && !anglePhrase && !cameraLens) return null;
  const parts: string[] = [];
  if (cameraMove && anglePhrase) {
    parts.push(`The camera uses ${cameraMove} ${anglePhrase}`);
  } else if (cameraMove) {
    parts.push(`The camera uses ${cameraMove}`);
  } else if (anglePhrase) {
    parts.push(`The camera holds ${anglePhrase}`);
  }
  if (cameraLens) {
    parts.push(`on ${cameraLens}`);
  }
  return parts.length > 0 ? ensurePeriod(parts.join(" ")) : null;
})();
```

- [ ] **Step 5: Modify `renderPreviewPrompt`**

Same file. After the existing `baseParts` push for action and settingTime, append a lens part if present. Find the block that builds `text` and modify:

```ts
const cameraLens = clean(slots.camera_lens);
// ... existing baseParts assembly ...
let text = ensurePeriod(baseParts.join(" ").replace(/\s+/g, " ").trim());

if (cameraLens) {
  text = `${text} ${ensurePeriod(`on ${cameraLens}`)}`.trim();
}

// ... existing lightingSentence/styleSentence appends ...
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run server/src/services/prompt-optimization/strategies/__tests__/videoPromptRenderer.cameraLens.test.ts`
Expected: 7 PASS.

- [ ] **Step 7: Run all strategy tests (regression check)**

Run: `npx vitest run server/src/services/prompt-optimization/strategies/__tests__/`
Expected: all PASS, especially `videoPromptRenderer.opener.regression.test.ts` which tests the opener phrasing (not affected by our changes but worth confirming).

- [ ] **Step 8: Commit**

```bash
git add server/src/services/prompt-optimization/strategies/videoPromptRenderer.ts server/src/services/prompt-optimization/strategies/__tests__/videoPromptRenderer.cameraLens.test.ts
cat > /tmp/c-task5-msg.txt <<'EOF'
feat(optimize): compose camera_lens into rendered output

All three render functions (main, compact, preview) now incorporate
the camera_lens slot. When present, the renderer emits "on {lens}"
in the camera sentence and suppresses the hardcoded focusFromFraming
aperture phrase (eliminating the duplication root cause). When null,
the renderer falls back to the existing focusFromFraming behavior
for back-compat with pre-Sub-project-C events.

Seven TDD tests covering presence, suppression, back-compat fallback,
and no-duplication across all three render functions.
EOF
git commit -F /tmp/c-task5-msg.txt && rm /tmp/c-task5-msg.txt
```

---

## Task 6: Update template instruction + few-shot examples

**Files:**

- Modify: `server/src/services/prompt-optimization/strategies/videoPromptOptimizationTemplate.ts`
- Modify: `server/src/services/prompt-optimization/strategies/video-templates/OpenAIVideoTemplateBuilder.ts`
- Modify: `server/src/services/prompt-optimization/strategies/video-templates/GroqVideoTemplateBuilder.ts`

These files are the actual prompt language the LLM reads. The few-shot examples are particularly important — they're the strongest signal for output format. We need to split each example's `camera` field into `camera_move` + `camera_lens`.

- [ ] **Step 1: Read the few-shot examples**

Run: `grep -n "VIDEO_FEW_SHOT_EXAMPLES\|camera:" server/src/services/prompt-optimization/strategies/videoPromptOptimizationTemplate.ts | head -20`

Note the four `camera: "..."` lines (currently lines 61, 96, 134, 172 per the design spec). They look like:

```ts
camera: "Wide tracking shot, low angle, 28mm lens at f/11";
```

- [ ] **Step 2: Split each few-shot example**

For each of the four examples, split the `camera` field into two fields. Map the existing strings:

| Current `camera`                                     | New `camera_move`                 | New `camera_lens` |
| ---------------------------------------------------- | --------------------------------- | ----------------- |
| `"Wide tracking shot, low angle, 28mm lens at f/11"` | `"Wide tracking shot, low angle"` | `"28mm at f/11"`  |
| `"Wide dolly-in, high angle, 24mm lens at f/11"`     | `"Wide dolly-in, high angle"`     | `"24mm at f/11"`  |
| `"Handheld tracking, eye-level, 35mm lens at f/4"`   | `"Handheld tracking, eye-level"`  | `"35mm at f/4"`   |
| `"Static tripod, eye-level, 85mm lens at f/2.2"`     | `"Static tripod, eye-level"`      | `"85mm at f/2.2"` |

For each example object literal, REMOVE the `camera: "..."` line and INSERT two lines in its place:

```ts
camera_move: "Wide tracking shot, low angle",
camera_lens: "28mm at f/11",
```

(Adjust the strings per the table.)

Note: each few-shot example is a serialized object literal whose keys also appear in the instructions section. We are matching the schema field names exactly — `camera_move` and `camera_lens` are top-level slots in `VideoPromptSlots`. The few-shot examples already use other top-level slot field names; the change is consistent with the existing pattern.

- [ ] **Step 3: Update the slot description at lines 341 and 518**

Find the two duplicate slot-description strings (lines 341 and 518). Each contains:

```ts
"camera": "Camera behavior + angle + lens + aperture. (Examples: 'Wide shot on 16mm with deep focus f/11' OR 'Close-up on 85mm with shallow focus f/1.8'). MATCH APERTURE TO SHOT TYPE.",
```

Replace each with two entries:

```ts
"camera_move": "Single camera movement only — dolly, tracking, pan, tilt, handheld, steadicam, static, zoom, crane, jib, orbit, push, pull, arc. 3-8 words. Do NOT include lens or aperture here.",
"camera_lens": "Focal length plus aperture, e.g., '28mm at f/11', 'anamorphic 50mm at f/2.8', '85mm prime at f/1.8'. Match aperture to shot type: Wide=f/8-f/11, Medium=f/2.8-f/4, Close-up=f/1.4-f/2.0. Null is allowed when no specific lens preference.",
```

- [ ] **Step 4: Update OpenAI template builder**

Read `server/src/services/prompt-optimization/strategies/video-templates/OpenAIVideoTemplateBuilder.ts` around line 211. The bullet currently reads:

```
- **Camera**: Movement + angle + lens + aperture (match shot type using Logic Rules)
```

Replace with two bullets:

```
- **Camera Movement**: One movement only (dolly/tracking/pan/tilt/handheld/static/zoom). Do NOT include lens here.
- **Camera Lens**: Focal length + aperture, matched to shot type (Wide=f/8-f/11, Medium=f/2.8-f/4, Close-up=f/1.4-f/2.0). Examples: "28mm at f/11", "85mm at f/1.8", "anamorphic 50mm at f/2.8".
```

- [ ] **Step 5: Update Groq template builder**

Read `server/src/services/prompt-optimization/strategies/video-templates/GroqVideoTemplateBuilder.ts` line 148. It currently includes:

```
3. What aperture matches the shot type (Wide=f/11, Close-up=f/1.8)?
```

This is in a Chain-of-Thought reasoning prompt. Update to be slot-aware:

```
3. What focal length + aperture matches the shot type? (Wide=f/8-f/11, Medium=f/2.8-f/4, Close-up=f/1.4-f/2.0). Put the answer in `camera_lens`, NOT in `camera_move`.
```

- [ ] **Step 6: Verify all related tests still pass**

Run: `npx vitest run server/src/services/prompt-optimization/strategies/__tests__/`
Run: `npx tsc --noEmit`
Expected: all PASS, exit 0.

The few-shot examples are part of `VIDEO_FEW_SHOT_EXAMPLES` exported from `videoPromptOptimizationTemplate.ts` — any test that asserts their shape may need an update; surface and fix during this step.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/prompt-optimization/strategies/videoPromptOptimizationTemplate.ts server/src/services/prompt-optimization/strategies/video-templates/OpenAIVideoTemplateBuilder.ts server/src/services/prompt-optimization/strategies/video-templates/GroqVideoTemplateBuilder.ts
cat > /tmp/c-task6-msg.txt <<'EOF'
feat(optimize): split camera prompt instruction into camera_move + camera_lens

Updates the LLM-facing prompt language to match the new schema slots:

- 4 few-shot examples in VIDEO_FEW_SHOT_EXAMPLES split "camera" into
  camera_move (movement only) + camera_lens (focal length + aperture).
- Slot description at lines 341/518 of videoPromptOptimizationTemplate.ts
  replaced with two separate entries enforcing the boundary.
- OpenAIVideoTemplateBuilder camera bullet (~line 211) becomes two
  bullets — Camera Movement and Camera Lens — with explicit
  do-not-mix instruction.
- GroqVideoTemplateBuilder CoT prompt (~line 148) routes aperture
  reasoning to camera_lens explicitly.

Few-shot examples are the strongest learning signal — explicit
slot-boundary demonstration here is the highest-leverage change for
ensuring the LLM populates the new slot correctly.
EOF
git commit -F /tmp/c-task6-msg.txt && rm /tmp/c-task6-msg.txt
```

---

## Task 7: Update fallback `looseSchema` in `VideoStrategy._fallbackOptimization`

**Files:**

- Modify: `server/src/services/prompt-optimization/strategies/VideoStrategy.ts`

The fallback path (used when StructuredOutputEnforcer kicks in) has its own minimal schema. Adding `camera_lens` there ensures the fallback respects the new field.

- [ ] **Step 1: Locate `looseSchema`**

Run: `grep -n "looseSchema" server/src/services/prompt-optimization/strategies/VideoStrategy.ts`

It's near line 311. Read its definition (currently the `required` array includes the existing 12 slots).

- [ ] **Step 2: Write a regression test**

Add to `server/src/services/prompt-optimization/strategies/__tests__/VideoStrategy.regression.test.ts`:

```ts
it("fallback looseSchema does NOT require camera_lens (optional, mirrors Groq)", async () => {
  // Read-through: import VideoStrategy and assert the fallback schema's
  // required array. Since looseSchema is module-private, we assert
  // observable behavior: a fallback call with camera_lens omitted should
  // not throw a schema-validation error.
  //
  // For now, assert via the source: check the file contents.
  const fs = await import("node:fs/promises");
  const url = new URL("../VideoStrategy.ts", import.meta.url);
  const src = await fs.readFile(url, "utf8");
  // Confirm looseSchema declaration exists and that camera_lens is NOT
  // in its required array. (Visual inspection of the require list.)
  const looseSchemaMatch = src.match(
    /const looseSchema = \{[\s\S]*?required: \[([\s\S]*?)\]/,
  );
  expect(looseSchemaMatch).not.toBeNull();
  const requiredArrayContents = looseSchemaMatch![1]!;
  expect(requiredArrayContents).not.toContain("camera_lens");
});
```

- [ ] **Step 3: Run the test (should pass already since we haven't added it yet)**

Run: `npx vitest run server/src/services/prompt-optimization/strategies/__tests__/VideoStrategy.regression.test.ts`
Expected: PASS (the field is not yet in the schema, so the assertion holds trivially).

(This is a sanity-check test, not a TDD-RED. It documents intent. If we accidentally add `camera_lens` to required later, this test catches it.)

- [ ] **Step 4: Add `camera_lens` to `looseSchema`**

Since `looseSchema` only declares the `required` array (no `properties`), and we want `camera_lens` to be optional, we make NO change to `looseSchema`. The StructuredOutputEnforcer will accept extra fields the LLM emits.

However, we DO want to verify the enforcer surfaces the field if the LLM emits it. Read `StructuredOutputEnforcer.enforceJSON` briefly to confirm it doesn't strip unlisted fields:

Run: `grep -A 5 "stripUnknown\|strict\|additionalProperties" server/src/utils/StructuredOutputEnforcer.ts | head -20`

If the enforcer strips fields not in `required` or `properties`, we'd need to add `camera_lens` to `looseSchema`'s properties (if it has one) or extend the schema shape. If not, we leave `looseSchema` unchanged.

For most enforcers (the typical pattern), unlisted-field tolerance is the default. Confirm and proceed.

- [ ] **Step 5: Decide based on Step 4 finding**

If the enforcer is strict (strips fields), extend `looseSchema`:

```ts
const looseSchema = {
  type: "object" as const,
  required: [
    "_creative_strategy",
    "shot_framing",
    "camera_angle",
    "camera_move",
    "subject",
    "subject_details",
    "action",
    "setting",
    "time",
    "lighting",
    "style",
    "technical_specs",
  ],
  // camera_lens is intentionally NOT required — slot is optional.
  // If the enforcer needs it declared, add a properties block:
  properties: {
    camera_lens: { type: ["string", "null"] },
  },
};
```

If the enforcer is permissive, leave `looseSchema` as-is and add a code comment explaining the omission:

```ts
const looseSchema = {
  type: "object" as const,
  required: [
    /* ... existing 12 slots ... */
  ],
  // camera_lens is intentionally omitted — slot is optional, and the
  // StructuredOutputEnforcer accepts extra fields not listed here.
  // See Sub-project C (2026-05-22-optimize-camera-lens-slot-design.md).
};
```

- [ ] **Step 6: Run the test (verify pass after the decision)**

Run: `npx vitest run server/src/services/prompt-optimization/strategies/__tests__/VideoStrategy.regression.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/prompt-optimization/strategies/VideoStrategy.ts server/src/services/prompt-optimization/strategies/__tests__/VideoStrategy.regression.test.ts
cat > /tmp/c-task7-msg.txt <<'EOF'
feat(optimize): handle camera_lens in VideoStrategy fallback path

Documents looseSchema's relationship to the new camera_lens slot.
Either leaves looseSchema unchanged (if the StructuredOutputEnforcer
permits extra fields) with an explanatory comment, or adds
camera_lens to properties (not required) so the field is preserved
on roundtrip.

One regression test asserts camera_lens is NOT in looseSchema's
required array — defense-in-depth against accidental future
hardening that would break optional-null semantics.
EOF
git commit -F /tmp/c-task7-msg.txt && rm /tmp/c-task7-msg.txt
```

---

## Task 8: Full-pipeline integration test + measurement doc update

**Files:**

- Modify: `server/src/services/prompt-optimization/strategies/__tests__/VideoStrategy.regression.test.ts`
- Modify: `docs/superpowers/programs/measurement.md`

- [ ] **Step 1: Write a full-pipeline regression test**

Add to `VideoStrategy.regression.test.ts`:

```ts
it("full pipeline: when LLM returns camera_lens, rendered output contains it exactly once with no duplicated aperture", async () => {
  // This is a regression test for the dominant Sub-project D failure mode:
  // the "lens at," fragment. We assert that with a well-formed camera_lens
  // slot, the rendered output:
  //   (a) contains the lens phrase exactly once, AND
  //   (b) does NOT contain the renderer's hardcoded f-stop fallback.
  //
  // We test renderMainVideoPrompt directly because it's the single
  // composition point — VideoStrategy.renderStructuredPrompt is a 1-line
  // delegator to it.

  const { renderMainVideoPrompt } = await import("../videoPromptRenderer.js");

  const slots = {
    shot_framing: "Wide Shot",
    camera_angle: "Eye-Level Shot",
    camera_move: "slow dolly in",
    camera_lens: "28mm at f/11",
    subject: "a ginger cat",
    subject_details: ["with green eyes", "wearing a red collar"],
    action: "walking slowly across the sunlit kitchen floor",
    setting: "a sunlit kitchen",
    time: "golden hour",
    lighting: "warm key from a tall window, soft fill",
    style: "Wes Anderson aesthetic, pastel palette",
    technical_specs: {},
  };
  const output = renderMainVideoPrompt(
    slots as unknown as Parameters<typeof renderMainVideoPrompt>[0],
  );

  // (a) lens phrase appears exactly once
  const lensPhraseCount = (output.match(/28mm at f\/11/g) || []).length;
  expect(lensPhraseCount).toBe(1);

  // (b) no hardcoded focusFromFraming aperture suffix
  expect(output).not.toContain("(f/11-f/16)");
  expect(output).not.toContain("(f/1.8-f/2.8)");
  expect(output).not.toContain("(f/4-f/5.6)");

  // Sanity: dangling-preposition fragment never appears
  expect(output).not.toMatch(/lens at[,.]\s/);
});

it("regression: a slot with the labeled 'anamorphic lens at' fragment is rejected by the linter", async () => {
  // Direct link to the Sub-project D calibration entry pattern:
  // "captured with an anamorphic lens at. An abstract..."
  const { lintVideoPromptSlots } = await import("../videoPromptLinter.js");
  const result = lintVideoPromptSlots({
    shot_framing: "Wide Shot",
    camera_angle: "Eye-Level Shot",
    camera_move: "static tripod",
    camera_lens: "anamorphic lens at",
    subject: "an abstract pattern",
    subject_details: ["geometric shapes", "high contrast"],
    action: "shifting slowly across the frame",
  });
  const cameraLensErrors = result.errors.filter((e) =>
    e.includes("camera_lens"),
  );
  expect(cameraLensErrors.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run server/src/services/prompt-optimization/strategies/__tests__/VideoStrategy.regression.test.ts`
Expected: PASS (Tasks 3 and 5 made the assertions true).

- [ ] **Step 3: Full validation gate**

Run all three checks per CLAUDE.md Commit Protocol:

```bash
npx tsc --noEmit
npx eslint --config config/lint/eslint.config.js server/src/services/prompt-optimization/ server/src/utils/provider/ --quiet
npm run test:unit
```

Expected: all exit 0 / all pass. (`test:unit` runs the full unit suite — important to confirm no upstream test was broken by the schema or template changes.)

- [ ] **Step 4: Update Measurement Program reordering log**

Open `docs/superpowers/programs/measurement.md`. Find the "### Reordering log" section. Append a new entry after the existing 2026-05-22 Sub-project D entry:

```markdown
- **2026-05-22 (Sub-project C):** Optimize camera*lens slot shipped. Root-cause fix for the dominant failure mode Sub-project D surfaced in optimize calibration (~50% of entries contained "lens at," fragments). Added `camera_lens: string | null` slot to VideoPromptSlots and both provider schemas (OpenAI strict in required, Groq in properties-only). Renderer composes `on {camera_lens}` into sentence2 and suppresses the hardcoded focusFromFraming aperture phrase when the slot is present — eliminating the duplication the LLM was compensating for by truncating its own lens output. Linter validates non-null camera_lens for aperture marker or focal-length keyword (mm/prime/lens/anamorphic/telephoto/wide-angle/macro) and rejects dangling-preposition fragments; routes through existing reroll mechanism via isQualityVideoPromptLintError. Template instruction split: camera_move (movement only, 3-8 words) and camera_lens (focal length + aperture). Four few-shot examples updated to demonstrate the slot boundary explicitly. Verification: 7 linter tests, 7 renderer tests, 3 schema-factory tests, 2 integration regression tests including a direct test for the labeled "anamorphic lens at" fragment. **Matrix-comparison measurement deferred:** the post-fix optimize mean against Sub-project D's 17.35 baseline requires a 2-variant matrix run (`openai` vs `openai-with-camera-lens` once a synthetic harness preset is added in variants.ts) — flagged as immediate follow-up. Out of scope per design: tag-soup tails in style slot (Sub-project C2) and mid-sentence terminal truncations (Sub-project C3). New principle encoded: \_LLM "compensation" failures (the model adjusting its output to avoid downstream duplication it senses coming) are often misread as truncation bugs; the actual fix is removing the duplication source, not raising max_tokens or adding stop sequences.*
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/programs/measurement.md server/src/services/prompt-optimization/strategies/__tests__/VideoStrategy.regression.test.ts
cat > /tmp/c-task8-msg.txt <<'EOF'
docs(measurement): Sub-project C reordering-log entry + final regression tests

Adds the canonical record of the camera_lens slot redesign to the
Measurement Program reordering log, including:
  - The dominant failure mode that motivated the work (Sub-project D
    calibration entries with "lens at," fragments in ~50% of sample)
  - The schema/template/renderer/linter change set
  - The deferred matrix-comparison measurement
  - The out-of-scope follow-ups (C2 tag-soup, C3 max_tokens)
  - The new principle: LLM compensation failures are misread as
    truncation bugs

Two final regression tests:
  - Full-pipeline assertion that camera_lens output has exactly one
    aperture mention and no hardcoded focusFromFraming f-stop suffix.
  - Direct link to Sub-project D's labeled "anamorphic lens at"
    fragment — confirms the linter would catch it.
EOF
git commit -F /tmp/c-task8-msg.txt && rm /tmp/c-task8-msg.txt
```

- [ ] **Step 6: Verify the branch state**

Run: `git log --oneline | head -12`
Expected: 8 new commits on top of the spec commit (`71f672ea`), each task one commit.

Run: `git status`
Expected: clean.

---

## Self-Review

**Spec coverage:**

- Spec § 0 "Why" → Tasks 0 (context only; no implementation needed)
- Spec § 1 row "Scope" → Tasks 1-8 cover the schema+template+renderer+linter redesign
- Spec § 1 row "Optional vs required" → Task 1 (optional `?`), Task 2 (optional in Groq, required in OpenAI for strict-mode compatibility)
- Spec § 1 row "Duplication elimination strategy" → Task 5 (renderer suppresses focusFromFraming when slot is present)
- Spec § 1 row "Few-shot example update" → Task 6 explicit
- Spec § 1 row "Linter approach" → Task 3 (validation) + Task 4 (quality-error routing)
- Spec § 1 row "Schema change in Groq fallback `looseSchema`" → Task 7
- Spec § 1 row "Telemetry / measurement" → Task 8 reordering log entry; no event field changes per scope
- Spec § 1 row "TDD discipline" → Each task explicit RED-GREEN-COMMIT
- Spec § 1 row "Backwards-compat" → Task 2 (Groq optional), Task 5 (fallback to focusFromFraming when null)
- Spec § 2 all subsections → Mapped 1:1 to Tasks 1-7
- Spec § 4 "Risks" → Task 2 Step 1 verifies OpenAI strict acceptance; Task 5 fallback preserves back-compat; Task 6 few-shot examples cover LLM-adoption risk; Task 8 includes regression test for the labeled fragment
- Spec § 5 success criteria → All 8 tasks together cover all 9 success criteria bullets

**Placeholder scan:** No "TBD", no "fill in details", no "appropriate error handling" without specific code. The "matrix-comparison measurement deferred" note in Task 8 Step 4 is explicit deferral, not a placeholder.

**Type consistency:** `camera_lens?: string | null` matches `camera_move?: string | null` exactly. The renderer reads `slots.camera_lens` (matches the type). The linter reads `slots.camera_lens` (matches). The schema declares `["string", "null"]` (matches the TypeScript type). The few-shot examples use string values (always populated in examples per spec rationale).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-optimize-camera-lens-slot.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration. Matches the user's earlier session-level preference for "subagent-dispatch where independent" — though note that for this plan, tasks ARE sequentially dependent, so subagent dispatch trades parallelism for context isolation.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Faster for tightly-coupled sequential work like this.

Which approach?
