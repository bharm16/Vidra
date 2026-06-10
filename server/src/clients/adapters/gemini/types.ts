/**
 * Type definitions for Gemini API integration
 *
 * Extracted from GeminiAdapter.ts to follow SRP - these types define
 * the contracts for Gemini API communication and can change independently
 * of the transport or parsing logic.
 */

import type { AIResponse } from "@interfaces/IAIClient";
export type { AbortControllerResult } from "@clients/utils/abortController";

/**
 * Options for completion requests
 */
export interface CompletionOptions {
  userMessage?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  signal?: AbortSignal;
  jsonMode?: boolean;
  isArray?: boolean;
  messages?: Array<{ role: string; content: string | unknown }>;
  onChunk?: (chunk: string) => void;
  responseSchema?: object;
  schema?: object;
  thinkingBudget?: number;
}

/**
 * Configuration for initializing a Gemini adapter
 */
export interface AdapterConfig {
  apiKey: string;
  baseURL?: string;
  defaultModel: string;
  defaultTimeout?: number;
  providerName?: string;
}

/**
 * Gemini API request payload structure
 */
export interface GeminiPayload {
  contents: GeminiContent[];
  generationConfig: GeminiGenerationConfig;
  systemInstruction?: GeminiSystemInstruction;
}

/**
 * A single content item in Gemini's message format
 */
export interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

/**
 * A part within a Gemini content item
 */
export interface GeminiPart {
  text: string;
}

/**
 * Generation configuration for Gemini API
 */
export interface GeminiGenerationConfig {
  temperature: number;
  maxOutputTokens: number;
  responseMimeType?: string;
  responseSchema?: object;
  thinkingConfig?: { thinkingBudget: number };
}

/**
 * System instruction format for Gemini API
 */
export interface GeminiSystemInstruction {
  parts: GeminiPart[];
}

/**
 * Gemini API response structure
 */
export interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

/**
 * A candidate response from Gemini
 */
export interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
}

/**
 * Result of building messages for Gemini API
 */
export interface GeminiMessagesResult {
  systemInstruction: string;
  contents: GeminiContent[];
}

/**
 * Re-export AIResponse for convenience
 */
export type { AIResponse };
