import type { AIResponse } from '@interfaces/IAIClient';
import { AIModelService } from '@services/ai-model/index';
import type {
  ClientsMap,
  ExecuteParams,
  StreamParams,
} from '@services/ai-model/types';
import type { LlmCallTelemetryService } from '@services/observability/LlmCallTelemetryService';
import type { ReplayAiModelRequest } from '@shared/schemas/replay.schemas';
import type { CassetteStore } from './CassetteStore';
import { contractForOperation, validateEntryPayload } from './contracts';
import { aiModelRequestKey } from './requestKey';

export type ReplayMode = 'record' | 'replay';

/**
 * Record/replay seam at the aiService boundary.
 *
 * Subclasses the router so every DI consumer keeps its `AIModelService`
 * dependency untouched. In `record` mode calls pass through to the real
 * provider clients and the request/response pair is captured into the
 * cassette store (contract-validated on capture). In `replay` mode the
 * recorded response is served with zero network — a miss or a contract
 * violation throws loudly instead of degrading.
 */
export class RecordReplayAiService extends AIModelService {
  private readonly mode: ReplayMode;
  private readonly store: CassetteStore;

  constructor({
    clients,
    llmCallTelemetry,
    mode,
    store,
  }: {
    clients: ClientsMap;
    llmCallTelemetry?: LlmCallTelemetryService;
    mode: ReplayMode;
    store: CassetteStore;
  }) {
    super({ clients, ...(llmCallTelemetry ? { llmCallTelemetry } : {}) });
    this.mode = mode;
    this.store = store;
  }

  override async execute(
    operation: string,
    params: ExecuteParams
  ): Promise<AIResponse> {
    const request = this.toRequest(operation, params, false);

    if (this.mode === 'replay') {
      return this.replayResponse(request);
    }

    const response = await super.execute(operation, params);
    this.recordResponse(request, {
      text: response.text,
      metadata: (response.metadata ?? {}) as Record<string, unknown>,
    });
    return response;
  }

  override async stream(
    operation: string,
    params: StreamParams
  ): Promise<string> {
    // StreamParams' Omit collapses to an index signature, so the prompt
    // fields come back `unknown`; they are the same strings execute() sees.
    const request = this.toRequest(
      operation,
      {
        systemPrompt: params.systemPrompt as string,
        userMessage: params.userMessage as string | undefined,
        messages: params.messages as ExecuteParams['messages'],
      },
      true
    );

    if (this.mode === 'replay') {
      const response = await this.replayResponse(request);
      // Deterministic single-chunk replay of the recorded stream.
      params.onChunk(response.text);
      return response.text;
    }

    const text = await super.stream(operation, params);
    this.recordResponse(request, {
      text,
      metadata: { recordedFrom: 'stream' },
    });
    return text;
  }

  /** Streaming is always available in replay mode — no live client needed. */
  override supportsStreaming(operation: string): boolean {
    if (this.mode === 'replay') {
      return true;
    }
    return super.supportsStreaming(operation);
  }

  private toRequest(
    operation: string,
    params: {
      systemPrompt: string;
      userMessage?: string | undefined;
      messages?: ExecuteParams['messages'] | undefined;
    },
    stream: boolean
  ): ReplayAiModelRequest {
    return {
      operation,
      systemPrompt: params.systemPrompt,
      userMessage: params.userMessage ?? null,
      messages: params.messages ?? null,
      stream,
    };
  }

  private async replayResponse(
    request: ReplayAiModelRequest
  ): Promise<AIResponse> {
    const key = aiModelRequestKey(request);
    const entry = this.store.lookupOrThrow(
      key,
      `aiService operation "${request.operation}" (stream=${String(request.stream)})`
    );
    if (entry.seam !== 'ai-model') {
      throw new Error(
        `Replay entry for key ${key} is not an ai-model recording`
      );
    }
    // Replay-time contract validation: drifted contracts fail loudly here.
    validateEntryPayload(entry, {
      surface: 'replay-lookup',
      scenario: request.operation,
    });
    return structuredClone(entry.response) as AIResponse;
  }

  private recordResponse(
    request: ReplayAiModelRequest,
    response: { text: string; metadata: Record<string, unknown> }
  ): void {
    this.store.record({
      seam: 'ai-model',
      key: aiModelRequestKey(request),
      contract: contractForOperation(request.operation),
      request,
      response,
    });
  }
}
