import type {
  ExecuteParams,
  StreamParams,
} from "@services/ai-model/AIModelService";
import type { AIResponse } from "@interfaces/IAIClient";
import type { ModelConfigEntry } from "@services/ai-model/types";
import type { OperationName } from "@config/modelConfig";

export interface AIExecutionPort {
  execute(
    operation: OperationName,
    options: ExecuteParams,
  ): Promise<AIResponse>;
  stream?(operation: OperationName, options: StreamParams): Promise<string>;
  supportsStreaming?(operation: OperationName): boolean;
  getAvailableClients?(): string[];
  getOperationConfig?(operation: OperationName): ModelConfigEntry;
}
