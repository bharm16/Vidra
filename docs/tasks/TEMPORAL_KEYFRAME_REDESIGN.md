# Storyboard: Temporal Keyframe Redesign

## Problem

Storyboard output produces near-identical frames. Root causes:

1. **Edit-delta paradigm**: System prompt teaches micro-movements ("shift right foot forward, tilt torso") — sub-second animation language, not storyboard keyframes.
2. **Chain topology**: Sequential generation (Base → Frame 1 → Frame 2 → Frame 3) where each frame edits the previous. Kontext is an img2img edit model that preserves most of the input. Three small deltas ≈ one small delta from base.
3. **Prompt format**: `buildEditPrompt` wraps deltas as "Edit this image: {delta}" which reinforces minimal edits.

## Solution

Complete paradigm shift from "what changed between frames" to "what does each frame look like at its moment in time."

**Topology change**: Chain → Star. All frames generated from the base image in parallel.

```
CURRENT (chain):
  Base → Frame 1 → Frame 2 → Frame 3

NEW (star):
  Base ──┬→ Frame 1
         ├→ Frame 2
         └→ Frame 3
```

**Prompt change**: Edit commands → Complete temporal scene descriptions. Each "delta" is now a full standalone image prompt describing the scene at that point in time.

**Speed bonus**: Parallel generation (~3x faster, 45s → 20s).

## Scope

4 files modified, 0 new files. Only storyboard module internals change. Zero API contract changes, zero DI changes, zero client changes, zero route changes.

## Files that MUST NOT be modified

- `ImageGenerationService` — no changes
- `ReplicateFluxKontextFastProvider` — no changes
- `ReplicateFluxSchnellProvider` — no changes
- `planParser.ts` — no changes (still parses `{"deltas": [...]}`)
- `storyboardUtils.ts` — no changes
- `fetchImageAsDataUrl.ts` — no changes
- `image-generation.services.ts` (DI registration) — no changes
- `imageStoryboardGenerate.ts` (route handler) — no changes
- Any client code — no changes
- Any LLM adapters — no changes

---

## File 1: `server/src/services/image-generation/storyboard/constants.ts`

Add temporal configuration constants. Keep all existing exports.

```ts
import type { ImagePreviewProviderId } from "@services/image-generation/providers/types";

export const STORYBOARD_FRAME_COUNT = 4;

export const BASE_PROVIDER: ImagePreviewProviderId = "replicate-flux-schnell";
export const EDIT_PROVIDER: ImagePreviewProviderId =
  "replicate-flux-kontext-fast";

/** Total duration of the storyboard sequence in seconds. */
export const STORYBOARD_DURATION_SECONDS = 4;

/** Timestamp for each frame position (including frame 0). Length must equal STORYBOARD_FRAME_COUNT. */
export const STORYBOARD_FRAME_TIMESTAMPS: readonly number[] = [
  0.0, 1.3, 2.7, 4.0,
];

/** Maximum number of Kontext edit frames to generate in parallel. */
export const STORYBOARD_MAX_PARALLEL = 3;
```

---

## File 2: `server/src/services/image-generation/storyboard/prompts.ts`

**Complete rewrite.** Replace the entire file contents. Every function signature changes or its body changes substantially.

```ts
import {
  STORYBOARD_FRAME_TIMESTAMPS,
  STORYBOARD_DURATION_SECONDS,
} from "./constants";

const FALLBACK_TEMPORAL_KEYFRAMES = [
  "Mid-shot of the same subject, slightly further from camera, action progressed one beat forward, same lighting and environment visible at wider framing.",
  "Wide shot of the same subject at moderate distance, action at midpoint, environment now visible in full context, lighting consistent with base frame.",
  "Establishing wide shot, subject at far distance completing the action, full environment and sky visible, same lighting direction and atmosphere.",
];

export const buildSystemPrompt = (
  keyframeCount: number,
  timestamps: readonly number[] = STORYBOARD_FRAME_TIMESTAMPS,
): string => {
  const duration =
    timestamps[timestamps.length - 1] ?? STORYBOARD_DURATION_SECONDS;
  const frameList = timestamps
    .slice(1, keyframeCount + 1)
    .map((t, i) => `  Frame ${i + 1} (${t.toFixed(1)}s)`)
    .join("\n");

  return `You are a cinematic storyboard planner.

You will receive a prompt describing a video scene. Return exactly ${keyframeCount} KEYFRAME DESCRIPTIONS for a ${duration}s video.

These keyframes will be generated as images using the base frame (Frame 0 at 0.0s) as a visual identity reference. Each keyframe must be a COMPLETE scene description, not a list of changes.

TIME POSITIONS:
${frameList}

OUTPUT FORMAT:
- Return ONLY valid JSON: {"deltas":["...","...","..."]}
- The "deltas" array must contain exactly ${keyframeCount} strings.

KEYFRAME RULES:
- Each keyframe is a COMPLETE SCENE DESCRIPTION for that moment in time. Describe the full frame as a standalone image prompt.
- Think cinematically: how does the camera framing change over ${duration} seconds? How far does the subject move?
- A person walks ~1.5m/s, runs ~3-4m/s, sprints ~7m/s. Use real physics for movement over the time span.
- Camera typically progresses: close-up → mid-shot → wide → establishing, or vice versa. Choose the progression that serves the scene.
- Each description MUST include: subject (identity, clothing, pose at that moment), framing (shot scale, camera angle), environment (what's visible at this framing), lighting (how it interacts with the subject at this distance).
- Preserve character identity details across all frames: same clothing, same build, same hair. Repeat these details in every description.
- Make temporal progression OBVIOUS. Frame 3 should look dramatically different from Frame 0 in composition/scale/framing.

ANTI-PATTERNS (do NOT do these):
- ❌ Micro-movements: "shift foot forward, tilt torso" — these are animation frames, not storyboard keyframes
- ❌ Edit commands: "Move X to Y, Add Z" — these are edit instructions, not scene descriptions
- ❌ Identical framing: all frames at same shot scale with minor pose changes
- ❌ Ignoring physics: subject in same position after 4 seconds of running

GOOD KEYFRAME (complete scene at a moment):
"Wide shot from behind: woman in white sundress walking along shoreline, 8 meters ahead of starting position, ankle-deep in retreating wave, wet footprints trailing behind her, golden hour sun low on horizon casting long shadow to the right, ocean filling left half of frame"

BAD KEYFRAME (edit command):
"Shift the woman's right foot forward into the wet sand. Tilt her torso into the stride."`;
};

export const buildRepairSystemPrompt = (
  keyframeCount: number,
  timestamps: readonly number[] = STORYBOARD_FRAME_TIMESTAMPS,
): string =>
  `${buildSystemPrompt(keyframeCount, timestamps)}

REPAIR MODE:
- The previous response was invalid JSON or did not match the schema.
- Return ONLY valid JSON with the exact schema and array length.`;

/**
 * Build the prompt sent to Kontext for each keyframe.
 *
 * In the temporal keyframe paradigm, the description IS the prompt.
 * The base image provides identity/style via Kontext's img_cond_path.
 */
export const buildEditPrompt = (
  basePrompt: string,
  temporalDescription: string,
): string => {
  const description = temporalDescription.trim();
  return description || basePrompt.trim();
};

export const buildFallbackDeltas = (expectedCount: number): string[] => {
  if (expectedCount <= 0) {
    return [];
  }
  const deltas: string[] = [];
  for (let index = 0; index < expectedCount; index += 1) {
    deltas.push(
      FALLBACK_TEMPORAL_KEYFRAMES[index % FALLBACK_TEMPORAL_KEYFRAMES.length] ??
        FALLBACK_TEMPORAL_KEYFRAMES[0]!,
    );
  }
  return deltas;
};

/**
 * Build the user prompt for vision-based temporal keyframe planning.
 *
 * Sent alongside the base image to a vision LLM so it plans keyframes
 * based on what it actually sees rather than imagining from text.
 */
export const buildVisionDeltaUserPrompt = (textPrompt: string): string =>
  `The attached image is Frame 0 (the base frame at T=0.0s).

The creator described this scene as:
"${textPrompt.trim()}"

Study the image carefully — it is the ground truth for visual identity:
- Subject: exact appearance, clothing, build, coloring
- Environment: terrain, background elements, atmospheric conditions
- Lighting: key light direction, color temperature, shadow behavior
- Camera: current shot scale and angle

Now write temporal keyframe descriptions. Each must be a COMPLETE scene description that:
1. Maintains the exact visual identity you see (repeat clothing/appearance details)
2. Advances time realistically (use real-world physics for movement speed)
3. Progresses camera framing to show scene evolution
4. Could stand alone as an image generation prompt`;
```

---

## File 3: `server/src/services/image-generation/storyboard/StoryboardFramePlanner.ts`

Pass `STORYBOARD_FRAME_TIMESTAMPS` to all prompt builder calls. The changes are minimal — only the arguments to `buildSystemPrompt` and `buildRepairSystemPrompt` change. Everything else (vision path, repair flow, fallback logic) stays structurally identical.

### Changes required:

1. Add import:

```ts
import { STORYBOARD_FRAME_TIMESTAMPS } from "./constants";
```

2. In `requestTextPlan`, change:

```ts
buildSystemPrompt(expectedCount);
```

to:

```ts
buildSystemPrompt(expectedCount, STORYBOARD_FRAME_TIMESTAMPS);
```

3. In `requestVisionPlan`, change both occurrences of:

```ts
buildSystemPrompt(expectedCount);
```

to:

```ts
buildSystemPrompt(expectedCount, STORYBOARD_FRAME_TIMESTAMPS);
```

4. In `requestRepair`, change:

```ts
buildRepairSystemPrompt(expectedCount);
```

to (both occurrences):

```ts
buildRepairSystemPrompt(expectedCount, STORYBOARD_FRAME_TIMESTAMPS);
```

No other changes to this file. The class structure, vision path, repair flow, and fallback logic all remain identical.

---

## File 4: `server/src/services/image-generation/storyboard/StoryboardPreviewService.ts`

Replace the `generateEditFrames` method with `generateKeyframes` that uses star topology (all frames from base, in parallel).

### 4a. Replace the `generateEditFrames` method

Delete the entire `generateEditFrames` method and replace with:

```ts
private async generateKeyframes(options: {
  baseImageUrl: string;
  baseProviderUrl: string;
  baseStoragePath?: string;
  keyframeDescriptions: string[];
  prompt: string;
  aspectRatio?: string;
  speedMode?: ImagePreviewSpeedMode;
  seed?: number;
  userId: string;
}): Promise<{ imageUrls: string[]; storagePaths: string[] }> {
  const imageUrls: string[] = [options.baseImageUrl];
  const storagePaths: string[] = [options.baseStoragePath ?? ''];
  const seedBase = computeSeedBase(options.seed);

  // Star topology: all frames generated from base image, not chained
  const framePromises = options.keyframeDescriptions.map(async (description, index) => {
    const framePrompt = buildEditPrompt(options.prompt, description);
    const editSeed = computeEditSeed(seedBase, index);

    this.log.debug('Storyboard keyframe generation started', {
      userId: options.userId,
      frameIndex: index + 1,
      descriptionPreview: description.slice(0, 120),
    });

    const result = await this.imageGenerationService.generatePreview(framePrompt, {
      ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
      provider: EDIT_PROVIDER,
      inputImageUrl: options.baseProviderUrl, // Always base image, never previous frame
      ...(options.speedMode ? { speedMode: options.speedMode } : {}),
      userId: options.userId,
      ...(editSeed !== undefined ? { seed: editSeed } : {}),
      disablePromptTransformation: true,
    });

    return {
      index,
      imageUrl: result.imageUrl,
      storagePath: result.storagePath ?? '',
    };
  });

  // Generate all keyframes in parallel
  const results = await Promise.all(framePromises);

  // Sort by index and append in order
  results.sort((a, b) => a.index - b.index);
  for (const result of results) {
    imageUrls.push(result.imageUrl);
    storagePaths.push(result.storagePath);
  }

  return { imageUrls, storagePaths };
}
```

### 4b. Update the call site in `generateStoryboard`

Replace the call to `generateEditFrames`:

```ts
const { imageUrls, storagePaths } = await this.generateEditFrames({
  baseImageUrl,
  baseProviderUrl,
  ...(baseStoragePath ? { baseStoragePath } : {}),
  deltas,
  prompt: storyboardPrompt,
  ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
  ...(request.speedMode ? { speedMode: request.speedMode } : {}),
  ...(request.seed !== undefined ? { seed: request.seed } : {}),
  userId,
});
```

With:

```ts
const { imageUrls, storagePaths } = await this.generateKeyframes({
  baseImageUrl,
  baseProviderUrl,
  ...(baseStoragePath ? { baseStoragePath } : {}),
  keyframeDescriptions: deltas,
  prompt: storyboardPrompt,
  ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
  ...(request.speedMode ? { speedMode: request.speedMode } : {}),
  ...(request.seed !== undefined ? { seed: request.seed } : {}),
  userId,
});
```

### 4c. Remove unused import

Remove `resolveChainingUrl` from the imports — it's no longer used (star topology doesn't chain):

```ts
// REMOVE from imports:
import { resolveChainingUrl } from "./storyboardUtils";

// KEEP:
import {
  computeEditSeed,
  computeSeedBase,
  normalizeSeedImageUrl,
} from "./storyboardUtils";
```

NOTE: `resolveChainingUrl` is still used in `resolveBaseImage` for the base image itself. Check before removing — if it IS still used there, keep the import.

---

## Test Updates

### `StoryboardPreviewService.test.ts`

Several tests assert chain-topology behavior that must be updated for star topology.

#### Test: `'generates a base image then chains edit frames with correct prompts'`

This test currently asserts:

- `editCall?.[0]` equals `'Edit this image: delta 1 The scene depicts: base prompt'`
- `editCall?.[1]?.inputImageUrl` equals `'https://images.example.com/base-provider.webp'`

With temporal keyframes and the new `buildEditPrompt`, the prompt is just the temporal description itself (or the base prompt if empty). Update the assertion:

```ts
// OLD:
expect(editCall?.[0]).toBe(
  "Edit this image: delta 1 The scene depicts: base prompt",
);

// NEW:
expect(editCall?.[0]).toBe("delta 1");
```

The `inputImageUrl` assertion stays correct — star topology means ALL edit frames use `base-provider.webp`.

#### Test: `'throws on partial edit failure and chains input images up to the failing frame'`

This test asserts chaining behavior:

```ts
expect(generatePreview.mock.calls[1]?.[1]?.inputImageUrl).toBe(
  "https://images.example.com/base-provider.webp",
);
expect(generatePreview.mock.calls[2]?.[1]?.inputImageUrl).toBe(
  "https://images.example.com/edit-1-provider.webp", // THIS CHANGES
);
```

With star topology, ALL frames use the base image:

```ts
expect(generatePreview.mock.calls[1]?.[1]?.inputImageUrl).toBe(
  "https://images.example.com/base-provider.webp",
);
expect(generatePreview.mock.calls[2]?.[1]?.inputImageUrl).toBe(
  "https://images.example.com/base-provider.webp", // Star topology: always base
);
```

IMPORTANT: With `Promise.all`, when frame 2 fails, ALL parallel promises may have already started. The test still works because `Promise.all` rejects with the first rejection, but the mock setup needs to handle all 3 edit calls being initiated. Update the mock setup so `generatePreview` handles all parallel calls:

```ts
generatePreview
  .mockResolvedValueOnce({
    // base image generation
    imageUrl: "https://images.example.com/base.webp",
    providerUrl: "https://images.example.com/base-provider.webp",
    metadata: {
      aspectRatio: "16:9",
      model: "flux-schnell",
      duration: 1200,
      generatedAt: new Date().toISOString(),
    },
  })
  .mockResolvedValueOnce({
    // frame 1 (succeeds)
    imageUrl: "https://images.example.com/edit-1.webp",
    providerUrl: "https://images.example.com/edit-1-provider.webp",
    metadata: {
      aspectRatio: "16:9",
      model: "kontext-fast",
      duration: 1200,
      generatedAt: new Date().toISOString(),
    },
  })
  .mockRejectedValueOnce(new Error("edit frame 2 failed"))
  .mockResolvedValueOnce({
    // frame 3 (may or may not be reached, but mock it for safety)
    imageUrl: "https://images.example.com/edit-3.webp",
    providerUrl: "https://images.example.com/edit-3-provider.webp",
    metadata: {
      aspectRatio: "16:9",
      model: "kontext-fast",
      duration: 1200,
      generatedAt: new Date().toISOString(),
    },
  });
```

Also update the `generatePreview` call count assertion. With sequential chain, exactly 3 calls happened (base + frame 1 + frame 2 fail). With parallel star, base is called first, then all 3 keyframes start in parallel, so up to 4 calls may be initiated. The rejection still propagates via `Promise.all`, but the exact call count is non-deterministic. Change:

```ts
// OLD:
expect(generatePreview).toHaveBeenCalledTimes(3);

// NEW: all 3 parallel frames start + 1 base = 4 calls initiated
// (Promise.all rejects after all promises settle or the first rejects)
// The exact count depends on Promise scheduling, so just assert the error propagates:
// Remove the toHaveBeenCalledTimes assertion, or change to:
expect(generatePreview).toHaveBeenCalledTimes(4);
```

And update the inputImageUrl assertions — with star topology all frames use base:

```ts
// All edit frames use the base provider URL (star topology)
for (let i = 1; i < generatePreview.mock.calls.length; i++) {
  expect(generatePreview.mock.calls[i]?.[1]?.inputImageUrl).toBe(
    "https://images.example.com/base-provider.webp",
  );
}
```

#### Test: `'sanitizes prompt sections before composing storyboard edit prompts'`

This test asserts the old `buildEditPrompt` format:

```ts
expect(firstEditCallPrompt).toBe(
  "Edit this image: The runner advances one stride. The scene depicts: A cinematic tracking shot of a runner crossing dunes at golden hour.",
);
```

With the new `buildEditPrompt`, the temporal description IS the prompt:

```ts
expect(firstEditCallPrompt).toBe("The runner advances one stride.");
```

#### Test: `'uses the provided seed image URL and skips base generation'`

This test checks that with a seed image, the first `generatePreview` call uses the seed URL as `inputImageUrl`. With star topology, this is still correct — all frames use the base (which IS the seed image URL). The assertion:

```ts
const firstEditCall = generatePreview.mock.calls[0]?.[1];
expect(firstEditCall?.inputImageUrl).toBe(
  "https://images.example.com/base.webp",
);
```

stays correct because with a seed image, there's no Schnell generation call — the first `generatePreview` call IS the first keyframe edit, and it should use the seed image URL.

### `StoryboardFramePlanner.test.ts` and `StoryboardFramePlanner.vision.test.ts`

The planner's behavior is minimally changed — only the system prompt content changes. The existing tests mock the LLM response and assert on the parsed deltas array, NOT on the system prompt content. These tests should pass without modification.

However, if any test explicitly asserts on the system prompt string content (e.g., checking that the prompt contains specific text), those assertions need updating. Check for assertions like:

```ts
expect(completeMock.mock.calls[0]?.[0]).toContain("edit instructions");
```

These would need to change to match the new temporal keyframe language.

### `prompts.ts` unit tests

If there is a `prompts.test.ts` file (check `__tests__/` directory), its assertions on `buildSystemPrompt`, `buildEditPrompt`, `buildFallbackDeltas`, and `buildVisionDeltaUserPrompt` output will all need updating to match the new content.

Specifically for `buildEditPrompt`:

```ts
// OLD behavior:
buildEditPrompt("base prompt", "delta text");
// → 'Edit this image: delta text The scene depicts: base prompt'

// NEW behavior:
buildEditPrompt("base prompt", "delta text");
// → 'delta text'

// NEW behavior with empty delta:
buildEditPrompt("base prompt", "");
// → 'base prompt'

// NEW behavior with whitespace-only delta:
buildEditPrompt("base prompt", "   ");
// → 'base prompt'
```

---

## Verification

After implementing all changes, run:

```bash
# 1. TypeScript compilation — must pass with zero errors
npx tsc --noEmit

# 2. Storyboard unit tests
npx vitest run server/src/services/image-generation/storyboard/__tests__/

# 3. Full test suite — nothing outside storyboard should break
npx vitest run

# 4. Verify no other files import the deleted generateEditFrames or resolveChainingUrl
# (grep to confirm no dangling references)
grep -r "generateEditFrames" server/src/ --include="*.ts"
grep -r "resolveChainingUrl" server/src/ --include="*.ts"
```

## Summary of Changes

| #   | File                               | Change  | Key Detail                                                                                     |
| --- | ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| 1   | `constants.ts`                     | ADD     | `STORYBOARD_FRAME_TIMESTAMPS`, `STORYBOARD_DURATION_SECONDS`, `STORYBOARD_MAX_PARALLEL`        |
| 2   | `prompts.ts`                       | REWRITE | New temporal system prompt, simplified `buildEditPrompt`, new fallbacks, updated vision prompt |
| 3   | `StoryboardFramePlanner.ts`        | MODIFY  | Pass `STORYBOARD_FRAME_TIMESTAMPS` to all `buildSystemPrompt`/`buildRepairSystemPrompt` calls  |
| 4   | `StoryboardPreviewService.ts`      | MODIFY  | Replace `generateEditFrames` (chain) with `generateKeyframes` (star + parallel)                |
| 5   | `StoryboardPreviewService.test.ts` | MODIFY  | Update assertions for star topology and new `buildEditPrompt` output                           |
| 6   | Other test files                   | CHECK   | Verify planner tests still pass; update prompt content assertions if any exist                 |

## What is NOT changing

| Item                                                                       | Status                                  |
| -------------------------------------------------------------------------- | --------------------------------------- |
| API response shape (`imageUrls`, `storagePaths`, `deltas`, `baseImageUrl`) | Identical                               |
| Route handler                                                              | Untouched                               |
| DI registration                                                            | Untouched                               |
| Client code                                                                | Untouched                               |
| `planParser.ts` (still parses `{"deltas": [...]}`)                         | Untouched                               |
| `storyboardUtils.ts`                                                       | Untouched                               |
| `fetchImageAsDataUrl.ts`                                                   | Untouched                               |
| `ImageGenerationService`                                                   | Untouched                               |
| All image providers                                                        | Untouched                               |
| All LLM adapters                                                           | Untouched                               |
| Vision planning path (structure)                                           | Untouched (only prompt content changes) |
| Repair/fallback flow (structure)                                           | Untouched (only prompt content changes) |
