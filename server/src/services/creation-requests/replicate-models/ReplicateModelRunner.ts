import { assertNoLegacyApiKeyData } from "@utils/apiKeyUser";
import { logger } from "@infrastructure/Logger";
import { sleep as sleepForMs } from "@utils/sleep";
import {
  awaitReplicatePrediction,
  type ReplicatePredictionClient,
} from "@services/image-generation/providers/runReplicatePrediction";

export interface ModelRunCall {
  model: string;
  input: Record<string, unknown>;
  userId: string;
  timeoutMs: number;
  pollIntervalMs: number;
}

export interface ModelRunResult { predictionId: string; output: unknown; }

/** Runs one exact model call and retains its provider identity with the raw result. */
export interface ModelRunner {
  run(call: ModelRunCall): Promise<ModelRunResult>;
}

/**
 * The shared Replicate prediction protocol (create with rate-limit retry,
 * poll to a deadline tolerating transient poll failures) for any model whose
 * input a definition has already shaped exactly.
 */
export class ReplicateModelRunner implements ModelRunner {
  private readonly log = logger.child({ service: "ReplicateModelRunner" });

  constructor(
    private readonly client: ReplicatePredictionClient,
    private readonly sleep: (ms: number) => Promise<void> = sleepForMs,
  ) {}

  async run(call: ModelRunCall): Promise<ModelRunResult> {
    assertNoLegacyApiKeyData(call.userId);
    const prediction = await awaitReplicatePrediction({
      client: this.client,
      model: call.model,
      input: call.input,
      timeoutMs: call.timeoutMs,
      pollIntervalMs: call.pollIntervalMs,
      userId: call.userId,
      log: this.log,
      sleep: this.sleep,
    });
    return { predictionId: prediction.id, output: prediction.output };
  }
}
