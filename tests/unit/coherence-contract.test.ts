import { describe, expect, it, vi } from "vitest";

import {
  CoherenceCheckRequestSchema,
  CoherenceCheckResultSchema,
  CoherenceSpanSchema,
} from "#shared/schemas/coherence.schemas";
import type { CoherenceCheckResult } from "#shared/types/coherence";
import { PromptCoherenceService } from "@services/enhancement/services/PromptCoherenceService";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";

/**
 * The coherence contract used to be declared three times — shared TypeScript,
 * a private copy inside PromptCoherenceService, and a private Zod copy in the
 * client's api module — and the three had drifted: `id` existed on the shared
 * and client findings but not on the server's, `source` existed only on the
 * server's span, `leftCtx`/`rightCtx` only on the shared one. The client was
 * validating for an `id` the server had no way to send.
 *
 * These tests pin the collapsed contract: the server's real output must parse
 * under the schema the client validates with, and both sides' span dialects
 * must survive the same request schema.
 *
 * Only the AI port is scripted — the real StructuredOutputEnforcer and the
 * real sanitizer run.
 */

function makePort(payload: string): AIExecutionPort {
  return {
    execute: vi.fn(async () => ({
      text: payload,
      metadata: { model: "llama-3.3-70b", provider: "groq" },
    })),
    getOperationConfig: vi.fn(() => ({ temperature: 0.2, client: "groq" })),
  } as unknown as AIExecutionPort;
}

/**
 * Compile-time half of the agreement: the service's return type must *be* the
 * shared contract type, not a structurally similar twin. Mutual assignability
 * only holds while both sides resolve to the same declaration, so
 * re-introducing a local interface on either side breaks `tsc`.
 */
type ServiceResult = Awaited<
  ReturnType<PromptCoherenceService["checkCoherence"]>
>;
type MutuallyAssignable<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never;
const serviceSpeaksTheSharedContract: MutuallyAssignable<
  ServiceResult,
  CoherenceCheckResult
> = true;

describe("coherence contract: server and client agree on the field set", () => {
  it("holds the service return type identical to the shared contract type", () => {
    expect(serviceSpeaksTheSharedContract).toBe(true);
  });

  it("parses the real service output with the schema the client validates with", async () => {
    const service = new PromptCoherenceService(
      makePort(
        JSON.stringify({
          conflicts: [
            {
              severity: "medium",
              message: "Daylight contradicts the night reference.",
              reasoning: "The applied change introduced daylight.",
              involvedSpanIds: ["span-2"],
              recommendations: [
                {
                  title: "Align the night reference",
                  rationale: "Keep temporal consistency.",
                  confidence: 0.8,
                  edits: [
                    {
                      type: "replaceSpanText",
                      spanId: "span-2",
                      replacementText: "daytime boulevard",
                    },
                  ],
                },
              ],
            },
          ],
          harmonizations: [],
        }),
      ),
    );

    const result = await service.checkCoherence({
      beforePrompt: "A runner at night in a city street.",
      afterPrompt: "A runner in bright daylight on a city street at night.",
      appliedChange: { spanId: "span-1", newText: "in bright daylight" },
      spans: [
        { id: "span-1", text: "in bright daylight", category: "lighting.time" },
        { id: "span-2", text: "at night", category: "lighting.time" },
      ],
    });

    const parsed = CoherenceCheckResultSchema.safeParse(result);

    expect(parsed.success).toBe(true);
    expect(result.conflicts).toHaveLength(1);
  });

  it("accepts the optional finding/recommendation ids the client renders keys from", () => {
    const parsed = CoherenceCheckResultSchema.safeParse({
      conflicts: [
        {
          id: "conflict-1",
          severity: "high",
          message: "Underwater contradicts the campfire.",
          reasoning: "Physically incompatible environments.",
          recommendations: [
            {
              id: "rec-1",
              title: "Drop the campfire",
              rationale: "Fire cannot burn underwater.",
              edits: [{ type: "removeSpan", spanId: "span-3" }],
            },
          ],
        },
      ],
      harmonizations: [],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.conflicts[0]?.id).toBe("conflict-1");
    expect(
      parsed.success && parsed.data.conflicts[0]?.recommendations[0]?.id,
    ).toBe("rec-1");
  });

  it("accepts both span dialects: the client's leftCtx/rightCtx and the server's source", () => {
    const clientSpan = CoherenceSpanSchema.safeParse({
      id: "span_0_12_0",
      start: 0,
      end: 12,
      category: "lighting.time",
      confidence: 0.9,
      text: "at night",
      quote: "at night",
      leftCtx: "A runner ",
      rightCtx: " in a city",
    });
    const serverContextSpan = CoherenceSpanSchema.safeParse({
      text: "A runner at night in a city street.",
      quote: "A runner at night in a city street.",
      start: 0,
      end: 35,
      source: "context",
    });

    expect(clientSpan.success).toBe(true);
    expect(serverContextSpan.success).toBe(true);
    expect(CoherenceSpanSchema.safeParse({ source: "invented" }).success).toBe(
      false,
    );
  });

  it("accepts the request body the client sends and the route forwards", () => {
    const parsed = CoherenceCheckRequestSchema.safeParse({
      beforePrompt: "A runner at night.",
      afterPrompt: "A runner in bright daylight.",
      appliedChange: {
        spanId: "span-1",
        category: "lighting.time",
        oldText: "at night",
        newText: "in bright daylight",
      },
      spans: [{ id: "span-1", text: "in bright daylight" }],
    });

    expect(parsed.success).toBe(true);
    expect(
      CoherenceCheckRequestSchema.safeParse({ beforePrompt: "x" }).success,
    ).toBe(false);
  });
});
