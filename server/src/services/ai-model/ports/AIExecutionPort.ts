import type {
  ExecuteParams,
  StreamParams,
} from "@services/ai-model/AIModelService";
import type {
  ModelConfigEntry,
  ResolvedExecution,
  RoutedAIResponse,
} from "@services/ai-model/types";
import type { OperationName } from "@config/modelConfig";

export interface AIExecutionPort {
  execute(
    operation: OperationName,
    options: ExecuteParams,
  ): Promise<RoutedAIResponse>;

  /**
   * The provider/model that will run `operation` if dispatched now.
   *
   * Required, not optional, and never throws. Both properties exist for the
   * same reason: an answer a caller cannot rely on is one they write a
   * fallback for, and those fallbacks are how provider identity ended up being
   * re-derived from `ModelConfig` in four different modules. Callers that
   * already hold a response should read `response.executedBy` instead — this
   * exists for callers that must shape the request before sending it.
   */
  resolveExecution(operation: OperationName): ResolvedExecution;

  stream?(operation: OperationName, options: StreamParams): Promise<string>;
  supportsStreaming?(operation: OperationName): boolean;
  getAvailableClients?(): string[];

  /**
   * The static config entry for an operation — tuning knobs only
   * (temperature, maxTokens, …). It reports what was *requested*, so it is not
   * a source of truth for which provider runs: use `resolveExecution`.
   */
  getOperationConfig?(operation: OperationName): ModelConfigEntry;
}
