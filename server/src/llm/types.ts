/**
 * Types for LLM services
 */

import type { ExecuteParams } from "@services/ai-model/AIModelService";
import type { AIResponse } from "@interfaces/IAIClient";
import type { OperationName } from "@config/modelConfig";

/**
 * Input span for role classification
 */
export interface InputSpan {
  text: string;
  start: number;
  end: number;
}

/**
 * Labeled span with role and confidence
 */
export interface LabeledSpan {
  text: string;
  start: number;
  end: number;
  role: string;
  confidence: number;
}

/**
 * AI Service interface
 */
export interface AIService {
  execute: (
    operation: OperationName,
    params: ExecuteParams,
  ) => Promise<AIResponse>;
}
