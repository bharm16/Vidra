import {
  NativeOutputSchema,
  WorkflowPreflightError,
  type NativeOutput,
} from "@services/creation-requests/execution/types";
import type { ModelRunner } from "./ReplicateModelRunner";
import type {
  ModelCall,
  ModelInputTools,
  ReplicateModelDefinition,
} from "./types";

export interface ReplicateModelServices {
  runner: ModelRunner;
  tools: ModelInputTools;
}

/** Media models answer with a URL or a list whose first entry is the result. */
function resultUrl(output: unknown): string {
  const candidate = Array.isArray(output) ? output[0] : output;
  if (typeof candidate === "string" && /^https?:\/\//.test(candidate))
    return candidate;
  throw new Error("The model returned no media URL");
}

/**
 * One exact model call: refusals and input shaping happen before the spend
 * reservation, so a refused or unreadable request never reserves or spends.
 * Anything after `reserve` is a provider outcome, never retried here.
 */
export async function executeReplicateModel(
  definition: ReplicateModelDefinition,
  call: ModelCall,
  slot: { ownerId: string; slotId: string },
  services: ReplicateModelServices,
  reserve: () => Promise<void>,
): Promise<NativeOutput> {
  const refusal = definition.preflight?.(call);
  if (refusal) throw new WorkflowPreflightError(refusal);
  let input: Record<string, unknown>;
  try {
    input = await definition.input(call, services.tools);
  } catch {
    throw new WorkflowPreflightError(
      "A selected input could not be prepared for this model.",
    );
  }
  await reserve();
  const { endpoint } = definition.profile;
  const result = await services.runner.run({
    model: endpoint,
    input,
    userId: slot.ownerId,
    timeoutMs: definition.timeoutMs,
    pollIntervalMs: definition.pollIntervalMs,
  });
  const produced = { model: endpoint, provider: "replicate" };
  switch (definition.profile.output.kind) {
    case "text": {
      if (!definition.text)
        throw new Error(`${endpoint} has no text formatter`);
      return NativeOutputSchema.parse({
        kind: "text",
        text: definition.text(result.output, call),
        ...produced,
      });
    }
    case "image":
    case "audio":
    case "video":
      // The lifecycle checkpoints this evidence before any download or upload.
      return NativeOutputSchema.parse({ kind: "provider-media", mediaKind: definition.profile.output.kind, sourceUrl: resultUrl(result.output), predictionId: result.predictionId, ...produced });
    case "file":
      throw new Error(`${endpoint} declares an unsupported file output`);
  }
}
