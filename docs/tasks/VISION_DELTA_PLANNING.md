# Vision-Based Storyboard Delta Planning

## Problem

The storyboard frame planner writes edit deltas **before the base image exists**.
It imagines what the scene looks like from the text prompt, then writes edit
commands for that imagined scene. When the base image is a user-uploaded seed
photo (which could look like anything), the disconnect is total — deltas
describe changes to a scene the model has never seen.

Result: near-identical frames instead of temporal progression.

## Solution

Generate (or resolve) the base image **first**, then pass it to a
vision-capable LLM (GPT-4o via the existing `claudeClient`) so it plans
deltas based on what it actually **sees**.

## Scope & Isolation Rules

**This change MUST NOT touch any shared adapter code.** Specifically:

- `server/src/clients/adapters/GeminiAdapter.ts` — DO NOT MODIFY
- `server/src/clients/adapters/gemini/*` — DO NOT MODIFY
- `server/src/clients/adapters/OpenAICompatibleAdapter.ts` — DO NOT MODIFY
- `server/src/clients/adapters/openai/*` — DO NOT MODIFY
- `server/src/clients/LLMClient.ts` — DO NOT MODIFY
- `server/src/interfaces/IAIClient.ts` — DO NOT MODIFY
- `VideoToImagePromptTransformer` — DO NOT MODIFY
- `AIModelService` — DO NOT MODIFY

The OpenAI-compatible adapter already handles multimodal `messages` arrays
with `image_url` content parts natively (it passes `options.messages` through
to the API verbatim via `OpenAiMessageBuilder.buildFromMessageHistory`). No
adapter changes are needed.

## Architecture

```
BEFORE:  planDeltas(text) → resolveBaseImage() → generateEditFrames(deltas, baseImage)
AFTER:   resolveBaseImage() → planDeltas(text, baseImageUrl) → generateEditFrames(deltas, baseImage)
```

Inject a second optional LLM client (`claudeClient` / GPT-4o) into the planner
for vision requests. The existing `geminiClient` continues to handle the
text-only fallback path with zero changes to its code path.

---

## Files to Change (6 files, 1 new)

### 1. NEW FILE: `server/src/services/image-generation/storyboard/fetchImageAsDataUrl.ts`

Utility to fetch an image URL and return a base64 data URL string.

```ts
import { logger } from "@infrastructure/Logger";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Fetch an image from a URL and return it as a base64 data URL.
 *
 * Used to pass images inline to the OpenAI vision API, which accepts
 * data URLs in `image_url.url` fields.
 */
export async function fetchImageAsDataUrl(
  imageUrl: string,
  options?: { timeoutMs?: number; maxBytes?: number },
): Promise<string> {
  const log = logger.child({ service: "fetchImageAsDataUrl" });
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(imageUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        `Image fetch failed: ${response.status} ${response.statusText}`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "image/png";
    const mimeType = contentType.split(";")[0]!.trim();

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new Error(
        `Image too large: ${buffer.byteLength} bytes exceeds ${maxBytes} byte limit`,
      );
    }

    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("Failed to fetch image as data URL", {
      imageUrl: imageUrl.slice(0, 120),
      error: message,
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
```

### 2. MODIFY: `server/src/services/image-generation/storyboard/prompts.ts`

**Add one new exported function.** Do NOT modify any existing functions.

Add after the existing `buildFallbackDeltas` function:

```ts
/**
 * Build the user prompt for vision-based delta planning.
 *
 * Sent alongside the base image to a vision LLM so it plans edits
 * based on what it actually sees rather than imagining from text.
 */
export const buildVisionDeltaUserPrompt = (textPrompt: string): string =>
  `The attached image is Frame 0 (the base frame).

The creator described this scene as:
"${textPrompt.trim()}"

Study the image carefully. Note:
- Exact pose: which foot is forward, arm positions, weight distribution, gaze direction
- Composition: where the subject sits in the frame, how much headroom/leadroom
- Lighting: where the key light falls, shadow directions, color temperature
- Environment: background elements, ground texture, atmospheric effects

Now plan your edit deltas based on what you SEE in this image, not what the text description says. The image is the ground truth.`;
```

### 3. MODIFY: `server/src/services/image-generation/storyboard/StoryboardFramePlanner.ts`

#### 3a. Change the options interface

Replace:

```ts
export interface StoryboardFramePlannerOptions {
  llmClient: LLMClient;
  timeoutMs?: number;
}
```

With:

```ts
export interface StoryboardFramePlannerOptions {
  llmClient: LLMClient;
  /** Vision-capable LLM for image-aware delta planning (GPT-4o). Falls back to llmClient if null. */
  visionLlmClient?: LLMClient | null;
  timeoutMs?: number;
  /** Timeout for vision requests (image fetch + LLM call). Defaults to 15000ms. */
  visionTimeoutMs?: number;
}
```

#### 3b. Store new fields in the constructor

Add two private fields and assign them in the constructor:

```ts
private readonly visionLlmClient: LLMClient | null;
private readonly visionTimeoutMs: number;
```

Constructor body additions:

```ts
this.visionLlmClient = options.visionLlmClient ?? null;
this.visionTimeoutMs = options.visionTimeoutMs ?? 15000;
```

#### 3c. Change `planDeltas` signature

Replace:

```ts
async planDeltas(prompt: string, frameCount: number): Promise<string[]> {
```

With:

```ts
async planDeltas(prompt: string, frameCount: number, baseImageUrl?: string): Promise<string[]> {
```

Pass `baseImageUrl` through to `requestPlan`:

```ts
const responseText = await this.requestPlan(
  trimmed,
  expectedCount,
  baseImageUrl,
);
```

And to `requestRepair` (add as optional 5th parameter — see 3f).

#### 3d. Add vision path to `requestPlan`

Replace the entire `requestPlan` method:

```ts
private async requestPlan(
  prompt: string,
  expectedCount: number,
  baseImageUrl?: string
): Promise<string> {
  // Vision path: base image available + vision client configured
  if (baseImageUrl && this.visionLlmClient) {
    return this.requestVisionPlan(prompt, expectedCount, baseImageUrl);
  }

  // Text-only path: completely unchanged from current behavior
  const response = await this.llmClient.complete(buildSystemPrompt(expectedCount), {
    userMessage: prompt,
    maxTokens: 400,
    temperature: 0.4,
    timeout: this.timeoutMs,
    jsonMode: true,
  });
  return extractResponseText(response);
}
```

#### 3e. Add new private method `requestVisionPlan`

```ts
private async requestVisionPlan(
  prompt: string,
  expectedCount: number,
  baseImageUrl: string
): Promise<string> {
  let dataUrl: string;
  try {
    dataUrl = await fetchImageAsDataUrl(baseImageUrl, {
      timeoutMs: Math.min(this.visionTimeoutMs, 8000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    this.log.warn('Vision plan image fetch failed, falling back to text-only', {
      error: message,
      imageUrl: baseImageUrl.slice(0, 120),
    });
    // Graceful degradation: fall back to text-only planning
    const response = await this.llmClient.complete(buildSystemPrompt(expectedCount), {
      userMessage: prompt,
      maxTokens: 400,
      temperature: 0.4,
      timeout: this.timeoutMs,
      jsonMode: true,
    });
    return extractResponseText(response);
  }

  const systemPrompt = buildSystemPrompt(expectedCount);
  const response = await this.visionLlmClient!.complete(systemPrompt, {
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: buildVisionDeltaUserPrompt(prompt) },
        ],
      },
    ],
    maxTokens: 400,
    temperature: 0.4,
    timeout: this.visionTimeoutMs,
    jsonMode: true,
  });
  return extractResponseText(response);
}
```

Add the necessary imports at the top of the file:

```ts
import { fetchImageAsDataUrl } from "./fetchImageAsDataUrl";
```

Update the existing prompts import line to include `buildVisionDeltaUserPrompt`:

```ts
import {
  buildFallbackDeltas,
  buildRepairSystemPrompt,
  buildSystemPrompt,
  buildVisionDeltaUserPrompt, // ADD THIS
} from "./prompts";
```

#### 3f. Pass `baseImageUrl` through repair flow

Change `requestRepair` signature to accept an optional `baseImageUrl`:

```ts
private async requestRepair(
  prompt: string,
  responseText: string,
  expectedCount: number,
  partialDeltas?: string[],
  baseImageUrl?: string   // ADD THIS
): Promise<string> {
```

Inside `requestRepair`, if `baseImageUrl` AND `this.visionLlmClient` exist,
use the vision client for the repair call too (same multimodal `messages`
pattern but with `buildRepairSystemPrompt` as system prompt and the repair
user message content). Otherwise keep the existing text-only repair path
unchanged.

Update the call site in `planDeltas` to pass `baseImageUrl`:

```ts
const repairText = await this.requestRepair(
  trimmed,
  responseText,
  expectedCount,
  parsed.partial?.deltas,
  baseImageUrl, // ADD THIS
);
```

### 4. MODIFY: `server/src/services/image-generation/storyboard/StoryboardPreviewService.ts`

**Flip the execution order** so `resolveBaseImage` runs before `planDeltas`,
then pass the resolved base image URL to the planner.

In `generateStoryboard`, replace the current order:

```ts
// CURRENT ORDER (remove this block):
const deltas = await this.storyboardFramePlanner.planDeltas(
  storyboardPrompt,
  STORYBOARD_FRAME_COUNT,
);

if (deltas.length !== STORYBOARD_FRAME_COUNT - 1) {
  throw new Error(
    "Storyboard planner did not return the expected number of deltas",
  );
}

this.log.info("Storyboard deltas planned", {
  userId,
  deltaCount: deltas.length,
});

const { baseImageUrl, baseProviderUrl, baseStoragePath } =
  await this.resolveBaseImage({
    prompt: storyboardPrompt,
    ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
    ...(seedImageUrl ? { seedImageUrl } : {}),
    ...(effectiveReferenceImageUrl
      ? { referenceImageUrl: effectiveReferenceImageUrl }
      : {}),
    ...(request.speedMode ? { speedMode: request.speedMode } : {}),
    userId,
  });
const baseProvider = seedImageUrl
  ? "seed-image"
  : effectiveReferenceImageUrl
    ? EDIT_PROVIDER
    : BASE_PROVIDER;
this.log.info("Storyboard base image resolved", {
  userId,
  baseProvider,
  usedSeedImage: Boolean(seedImageUrl),
  usedReferenceImage: Boolean(effectiveReferenceImageUrl),
});
```

With:

```ts
// NEW ORDER — resolve base image FIRST, then plan deltas with it:
const { baseImageUrl, baseProviderUrl, baseStoragePath } =
  await this.resolveBaseImage({
    prompt: storyboardPrompt,
    ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
    ...(seedImageUrl ? { seedImageUrl } : {}),
    ...(effectiveReferenceImageUrl
      ? { referenceImageUrl: effectiveReferenceImageUrl }
      : {}),
    ...(request.speedMode ? { speedMode: request.speedMode } : {}),
    userId,
  });
const baseProvider = seedImageUrl
  ? "seed-image"
  : effectiveReferenceImageUrl
    ? EDIT_PROVIDER
    : BASE_PROVIDER;
this.log.info("Storyboard base image resolved", {
  userId,
  baseProvider,
  usedSeedImage: Boolean(seedImageUrl),
  usedReferenceImage: Boolean(effectiveReferenceImageUrl),
});

// Pass the base image URL to the planner for vision-based delta planning.
// baseProviderUrl is the raw provider URL (not a storage proxy) — this is
// what the vision LLM needs to actually see the image.
const deltas = await this.storyboardFramePlanner.planDeltas(
  storyboardPrompt,
  STORYBOARD_FRAME_COUNT,
  baseProviderUrl, // NEW — enables vision-based planning
);

if (deltas.length !== STORYBOARD_FRAME_COUNT - 1) {
  throw new Error(
    "Storyboard planner did not return the expected number of deltas",
  );
}

this.log.info("Storyboard deltas planned", {
  userId,
  deltaCount: deltas.length,
});
```

Keep the rest of the method (`generateEditFrames` call and return) unchanged.

### 5. MODIFY: `server/src/config/services/image-generation.services.ts`

Change the `storyboardFramePlanner` registration to inject `claudeClient`:

Replace:

```ts
container.register(
  "storyboardFramePlanner",
  (geminiClient: LLMClient | null) => {
    if (!geminiClient) {
      logger.warn(
        "Gemini client not available, storyboard frame planner disabled",
      );
      return null;
    }
    return new StoryboardFramePlanner({
      llmClient: geminiClient,
      timeoutMs: 8000,
    });
  },
  ["geminiClient"],
);
```

With:

```ts
container.register(
  "storyboardFramePlanner",
  (geminiClient: LLMClient | null, claudeClient: LLMClient | null) => {
    if (!geminiClient) {
      logger.warn(
        "Gemini client not available, storyboard frame planner disabled",
      );
      return null;
    }
    if (!claudeClient) {
      logger.warn(
        "OpenAI client not available, vision-based storyboard planning disabled (text-only fallback)",
      );
    }
    return new StoryboardFramePlanner({
      llmClient: geminiClient,
      visionLlmClient: claudeClient,
      timeoutMs: 8000,
      visionTimeoutMs: 15000,
    });
  },
  ["geminiClient", "claudeClient"],
);
```

### 6. UPDATE TESTS

#### 6a. `server/src/services/image-generation/storyboard/__tests__/StoryboardFramePlanner.test.ts`

The existing tests must continue to pass with zero modifications — they test
the text-only path which is unchanged (no `baseImageUrl` argument, no
`visionLlmClient` configured). Add a NEW `describe('vision path', ...)` block:

```ts
describe("vision path", () => {
  const createVisionClient = () => {
    const completeMock: MockedFunction<
      (
        systemPrompt: string,
        options?: Record<string, unknown>,
      ) => Promise<AIResponse>
    > = vi.fn();
    const adapter = { complete: completeMock };
    const client = new LLMClient({
      adapter,
      providerName: "test-vision",
      defaultTimeout: 5000,
    });
    return { client, completeMock };
  };

  it("uses the vision client when baseImageUrl is provided", async () => {
    const { client: textClient } = createClient();
    const { client: visionClient, completeMock: visionComplete } =
      createVisionClient();
    visionComplete.mockResolvedValueOnce(
      buildResponse(
        '{"deltas": ["move foot forward", "shift weight", "extend arm"]}',
      ),
    );

    // Mock the fetch utility at the module level
    vi.mock("../fetchImageAsDataUrl", () => ({
      fetchImageAsDataUrl: vi
        .fn()
        .mockResolvedValue("data:image/png;base64,AAAA"),
    }));

    const planner = new StoryboardFramePlanner({
      llmClient: textClient,
      visionLlmClient: visionClient,
    });
    const result = await planner.planDeltas(
      "prompt",
      4,
      "https://example.com/base.webp",
    );

    expect(result).toEqual(["move foot forward", "shift weight", "extend arm"]);
    expect(visionComplete).toHaveBeenCalledTimes(1);

    // Verify multimodal message structure
    const callOptions = visionComplete.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(callOptions).toHaveProperty("messages");
    const messages = callOptions.messages as Array<{
      role: string;
      content: unknown;
    }>;
    const userMessage = messages.find((m) => m.role === "user");
    expect(Array.isArray(userMessage?.content)).toBe(true);
  });

  it("falls back to text-only when image fetch fails", async () => {
    const { client: textClient, completeMock: textComplete } = createClient();
    const { client: visionClient } = createVisionClient();
    textComplete.mockResolvedValueOnce(
      buildResponse(
        '{"deltas": ["text delta 1", "text delta 2", "text delta 3"]}',
      ),
    );

    vi.mock("../fetchImageAsDataUrl", () => ({
      fetchImageAsDataUrl: vi.fn().mockRejectedValue(new Error("fetch failed")),
    }));

    const planner = new StoryboardFramePlanner({
      llmClient: textClient,
      visionLlmClient: visionClient,
    });
    const result = await planner.planDeltas(
      "prompt",
      4,
      "https://example.com/base.webp",
    );

    expect(result).toEqual(["text delta 1", "text delta 2", "text delta 3"]);
    expect(textComplete).toHaveBeenCalledTimes(1);
  });

  it("uses text-only path when no visionLlmClient is configured", async () => {
    const { client: textClient, completeMock: textComplete } = createClient();
    textComplete.mockResolvedValueOnce(
      buildResponse('{"deltas": ["d1", "d2", "d3"]}'),
    );

    const planner = new StoryboardFramePlanner({ llmClient: textClient });
    const result = await planner.planDeltas(
      "prompt",
      4,
      "https://example.com/base.webp",
    );

    expect(result).toEqual(["d1", "d2", "d3"]);
    expect(textComplete).toHaveBeenCalledTimes(1);
  });

  it("uses text-only path when baseImageUrl is not provided even with vision client", async () => {
    const { client: textClient, completeMock: textComplete } = createClient();
    const { client: visionClient, completeMock: visionComplete } =
      createVisionClient();
    textComplete.mockResolvedValueOnce(
      buildResponse('{"deltas": ["d1", "d2", "d3"]}'),
    );

    const planner = new StoryboardFramePlanner({
      llmClient: textClient,
      visionLlmClient: visionClient,
    });
    const result = await planner.planDeltas("prompt", 4);

    expect(result).toEqual(["d1", "d2", "d3"]);
    expect(textComplete).toHaveBeenCalledTimes(1);
    expect(visionComplete).not.toHaveBeenCalled();
  });
});
```

**Important mock note:** The `vi.mock` calls for `fetchImageAsDataUrl` should
be hoisted. If this causes issues with the existing tests in the same file,
consider:

1. Moving vision path tests to a separate test file, OR
2. Using `vi.spyOn` with dynamic imports instead of `vi.mock`

The key assertions are:

- Vision client receives multimodal messages when image URL is provided
- Text client is used as fallback when vision is unavailable
- Both clients being absent (no visionLlmClient) works identically to current behavior

#### 6b. `server/src/services/image-generation/storyboard/__tests__/StoryboardPreviewService.test.ts`

The existing tests mock `planDeltas` via `vi.spyOn(storyboardFramePlanner, 'planDeltas')`.
Since the `StoryboardPreviewService` now calls `resolveBaseImage` before `planDeltas`,
the existing test setup already handles this correctly — `planDeltas` is mocked to
return canned deltas regardless of when it's called.

**Verify** that all existing tests still pass after the reorder. The mock call order
for `generatePreview` may shift — pay attention to assertions that check
`generatePreview.mock.calls[N]` indices. The base image generation call
(`generatePreview.mock.calls[0]`) should remain the first call in the
non-seed-image path, which is the same as before since `resolveBaseImage`
just moved up.

**IMPORTANT EDGE CASE:** The test `'throws when the planner returns the wrong
number of deltas'` currently sets up `planDeltas` to return `['only one']`
but does NOT set up `generatePreview`. After the reorder, `resolveBaseImage`
runs first and calls `generatePreview`, which will now be undefined/unmocked
and throw. **Fix**: Add a `generatePreview` mock before `planDeltas` in that
specific test:

```ts
it("throws when the planner returns the wrong number of deltas", async () => {
  const {
    imageGenerationService,
    storyboardFramePlanner,
    planDeltas,
    generatePreview,
  } = createServices();
  // resolveBaseImage now runs before planDeltas — must mock generatePreview
  generatePreview.mockResolvedValueOnce({
    imageUrl: "https://images.example.com/base.webp",
    providerUrl: "https://images.example.com/base-provider.webp",
    metadata: {
      aspectRatio: "16:9",
      model: "flux-schnell",
      duration: 1200,
      generatedAt: new Date().toISOString(),
    },
  });
  planDeltas.mockResolvedValueOnce(["only one"]);

  const service = new StoryboardPreviewService({
    imageGenerationService,
    storyboardFramePlanner,
  });

  await expect(
    service.generateStoryboard({ prompt: "valid prompt" }),
  ).rejects.toThrow(
    "Storyboard planner did not return the expected number of deltas",
  );
});
```

Add one new test to the existing `describe('core behavior', ...)` or
`describe('edge cases', ...)` block:

```ts
it("passes baseProviderUrl to planDeltas for vision-based planning", async () => {
  const {
    imageGenerationService,
    storyboardFramePlanner,
    planDeltas,
    generatePreview,
  } = createServices();
  planDeltas.mockResolvedValueOnce(["delta 1", "delta 2", "delta 3"]);
  generatePreview
    .mockResolvedValueOnce({
      imageUrl: "https://images.example.com/base.webp",
      providerUrl: "https://images.example.com/base-provider.webp",
      metadata: {
        aspectRatio: "16:9",
        model: "flux-schnell",
        duration: 1200,
        generatedAt: new Date().toISOString(),
      },
    })
    .mockResolvedValue({
      imageUrl: "https://images.example.com/edit.webp",
      providerUrl: "https://images.example.com/edit-provider.webp",
      metadata: {
        aspectRatio: "16:9",
        model: "kontext-fast",
        duration: 1200,
        generatedAt: new Date().toISOString(),
      },
    });

  const service = new StoryboardPreviewService({
    imageGenerationService,
    storyboardFramePlanner,
  });

  await service.generateStoryboard({ prompt: "valid prompt" });

  // planDeltas should receive the provider URL as the third argument
  expect(planDeltas).toHaveBeenCalledWith(
    "valid prompt",
    STORYBOARD_FRAME_COUNT,
    "https://images.example.com/base-provider.webp",
  );
});
```

#### 6c. NEW FILE: `server/src/services/image-generation/storyboard/__tests__/fetchImageAsDataUrl.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchImageAsDataUrl } from "../fetchImageAsDataUrl";

describe("fetchImageAsDataUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a base64 data URL for a valid image", async () => {
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const mockResponse = {
      ok: true,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: () => Promise.resolve(imageBytes.buffer),
    };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

    const result = await fetchImageAsDataUrl("https://example.com/image.png");

    expect(result).toMatch(/^data:image\/png;base64,/);
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/image.png",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("throws when the response is not ok", async () => {
    const mockResponse = { ok: false, status: 404, statusText: "Not Found" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

    await expect(
      fetchImageAsDataUrl("https://example.com/missing.png"),
    ).rejects.toThrow("Image fetch failed: 404 Not Found");
  });

  it("throws when image exceeds max byte limit", async () => {
    const largeBuffer = new ArrayBuffer(100);
    const mockResponse = {
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: () => Promise.resolve(largeBuffer),
    };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

    await expect(
      fetchImageAsDataUrl("https://example.com/huge.jpg", { maxBytes: 50 }),
    ).rejects.toThrow(/too large/);
  });

  it("defaults content type to image/png when header is missing", async () => {
    const imageBytes = new Uint8Array([0xff, 0xd8]);
    const mockResponse = {
      ok: true,
      headers: new Headers(),
      arrayBuffer: () => Promise.resolve(imageBytes.buffer),
    };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

    const result = await fetchImageAsDataUrl("https://example.com/image");
    expect(result).toMatch(/^data:image\/png;base64,/);
  });
});
```

---

## Verification Steps

After implementing all changes, run:

```bash
# 1. Existing planner unit tests must pass with zero modification
npx vitest run server/src/services/image-generation/storyboard/__tests__/StoryboardFramePlanner.test.ts

# 2. Service tests (may need the delta-count test fix described in 6b)
npx vitest run server/src/services/image-generation/storyboard/__tests__/StoryboardPreviewService.test.ts

# 3. New utility tests
npx vitest run server/src/services/image-generation/storyboard/__tests__/fetchImageAsDataUrl.test.ts

# 4. Full test suite — nothing else should break
npx vitest run

# 5. TypeScript compilation
npx tsc --noEmit
```

## What is NOT Changing

| File/Module                               | Status    |
| ----------------------------------------- | --------- |
| `GeminiAdapter` + `gemini/*`              | Untouched |
| `OpenAICompatibleAdapter` + `openai/*`    | Untouched |
| `LLMClient.ts`                            | Untouched |
| `IAIClient.ts`                            | Untouched |
| `VideoToImagePromptTransformer`           | Untouched |
| `AIModelService`                          | Untouched |
| `planParser.ts`                           | Untouched |
| `storyboardUtils.ts`                      | Untouched |
| `constants.ts`                            | Untouched |
| `buildEditPrompt` in `prompts.ts`         | Untouched |
| `buildSystemPrompt` in `prompts.ts`       | Untouched |
| `buildRepairSystemPrompt` in `prompts.ts` | Untouched |
| `buildFallbackDeltas` in `prompts.ts`     | Untouched |
| Health routes                             | Untouched |
| All other DI registrations                | Untouched |

## Summary of Changes

| #   | File                                                    | Change Type | Description                                                                              |
| --- | ------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| 1   | `storyboard/fetchImageAsDataUrl.ts`                     | **NEW**     | Fetch image URL → base64 data URL                                                        |
| 2   | `storyboard/prompts.ts`                                 | **ADD**     | New `buildVisionDeltaUserPrompt()` function                                              |
| 3   | `storyboard/StoryboardFramePlanner.ts`                  | **MODIFY**  | Add `visionLlmClient` option, vision path in `requestPlan`, graceful fallback            |
| 4   | `storyboard/StoryboardPreviewService.ts`                | **MODIFY**  | Flip execution order: `resolveBaseImage()` before `planDeltas()`, pass `baseProviderUrl` |
| 5   | `config/services/image-generation.services.ts`          | **MODIFY**  | Inject `claudeClient` into `storyboardFramePlanner` registration                         |
| 6   | `storyboard/__tests__/fetchImageAsDataUrl.test.ts`      | **NEW**     | Unit tests for fetch utility                                                             |
| 7   | `storyboard/__tests__/StoryboardFramePlanner.test.ts`   | **ADD**     | New `describe('vision path')` test block                                                 |
| 8   | `storyboard/__tests__/StoryboardPreviewService.test.ts` | **MODIFY**  | Fix delta-count test setup, add `baseProviderUrl` pass-through test                      |
