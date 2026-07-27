import type { AIResponse } from "@interfaces/IAIClient";
import { AIModelService } from "@services/ai-model/index";
import type {
  ClientsMap,
  ExecuteParams,
  StreamParams,
} from "@services/ai-model/types";
import type { LlmProviderCircuitManager } from "@llm/failover/LlmProviderCircuitManager";
import type { LlmCallTelemetryService } from "@services/observability/LlmCallTelemetryService";
import type { ReplayAiModelRequest } from "@shared/schemas/replay.schemas";
import type { CassetteStore } from "./CassetteStore";
import { contractForOperation } from "./contracts";
import { aiModelRequestKey } from "./requestKey";
import { ReplaySeam, type ReplayMode } from "./ReplaySeam";

export type { ReplayMode } from "./ReplaySeam";

/**
 * Record/replay seam at the aiService boundary.
 *
 * Subclasses the router so every DI consumer keeps its `AIModelService`
 * dependency untouched. In `record` mode calls pass through to the real
 * provider clients — including the health-based failover circuit, so the
 * captured execution path is the production one — and the request/response
 * pair is captured into the cassette store (contract-validated on capture).
 * In `replay` mode the recorded response is served with zero network; a miss
 * or a contract violation throws loudly instead of degrading.
 *
 * Hazard: subclassing means a constructor parameter added to `AIModelService`
 * is silently dropped here unless it is also accepted and forwarded below.
 */
export class RecordReplayAiService extends AIModelService {
  private readonly seam: ReplaySeam<"ai-model">;

  constructor({
    clients,
    llmCallTelemetry,
    providerCircuit,
    mode,
    store,
  }: {
    clients: ClientsMap;
    llmCallTelemetry?: LlmCallTelemetryService;
    providerCircuit?: LlmProviderCircuitManager;
    mode: ReplayMode;
    store: CassetteStore;
  }) {
    super({
      clients,
      ...(llmCallTelemetry ? { llmCallTelemetry } : {}),
      ...(providerCircuit ? { providerCircuit } : {}),
    });
    this.seam = new ReplaySeam({
      seam: "ai-model",
      mode,
      store,
      keyOf: aiModelRequestKey,
    });
  }

  override async execute(
    operation: string,
    params: ExecuteParams,
  ): Promise<AIResponse> {
    const request = this.toRequest(operation, params, false);
    const response = await this.seam.through({
      request,
      summary: `aiService operation "${operation}" (stream=false)`,
      scenario: operation,
      contract: contractForOperation(operation),
      live: () => super.execute(operation, params),
      toRecorded: (live) => ({
        text: live.text,
        metadata: (live.metadata ?? {}) as Record<string, unknown>,
      }),
    });
    return response as AIResponse;
  }

  override async stream(
    operation: string,
    params: StreamParams,
  ): Promise<string> {
    // StreamParams' Omit collapses to an index signature, so the prompt
    // fields come back `unknown`; they are the same strings execute() sees.
    const request = this.toRequest(
      operation,
      {
        systemPrompt: params.systemPrompt as string,
        userMessage: params.userMessage as string | undefined,
        messages: params.messages as ExecuteParams["messages"],
      },
      true,
    );
    const response = await this.seam.through({
      request,
      summary: `aiService operation "${operation}" (stream=true)`,
      scenario: operation,
      contract: contractForOperation(operation),
      live: async () => super.stream(operation, params),
      toRecorded: (text) => ({ text, metadata: { recordedFrom: "stream" } }),
    });

    if (typeof response === "string") {
      return response;
    }
    // Deterministic single-chunk replay of the recorded stream.
    params.onChunk(response.text);
    return response.text;
  }

  /** Streaming is always available in replay mode — no live client needed. */
  override supportsStreaming(operation: string): boolean {
    if (this.seam.isReplaying) {
      return true;
    }
    return super.supportsStreaming(operation);
  }

  private toRequest(
    operation: string,
    params: {
      systemPrompt: string;
      userMessage?: string | undefined;
      messages?: ExecuteParams["messages"] | undefined;
    },
    stream: boolean,
  ): ReplayAiModelRequest {
    return {
      operation,
      systemPrompt: params.systemPrompt,
      userMessage: params.userMessage ?? null,
      messages: params.messages ?? null,
      stream,
    };
  }
}
