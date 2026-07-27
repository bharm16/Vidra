/**
 * Registry for managing prompt optimization strategy factories
 *
 * Stores factory functions instead of singleton instances to prevent
 * shared mutable state across concurrent requests. Every call to get()
 * returns a fresh strategy instance with clean state.
 *
 * Bug context: BaseStrategy.currentMetadata and KlingStrategy.entityRegistry
 * are mutable instance fields. When strategies were singletons, concurrent
 * requests would corrupt each other's metadata and leak entity IDs across
 * users.
 */

import { resolvePromptModelId } from "@config/videoModelRegistry";
import { getPromptModelConstraints } from "@shared/videoModels";
import type { ModelConstraints, PromptOptimizationStrategy } from "./types";

export type StrategyFactory = () => PromptOptimizationStrategy;

/**
 * StrategyRegistry manages factory functions for prompt optimization strategies.
 * Each factory is registered by model ID and produces a fresh instance per call.
 */
export class StrategyRegistry {
  private factories: Map<string, StrategyFactory> = new Map();

  /**
   * Register a factory for a specific model
   * @param modelId - The model identifier (e.g., "runway-gen45", "kling-26")
   * @param factory - Function that creates a fresh strategy instance
   * @throws Error if a factory with the same modelId is already registered
   */
  register(modelId: string, factory: StrategyFactory): void {
    if (this.factories.has(modelId)) {
      throw new Error(`Strategy for model "${modelId}" is already registered`);
    }
    this.factories.set(modelId, factory);
  }

  /**
   * Create a fresh strategy instance for a model
   * @param modelId - The model identifier
   * @returns A new strategy instance if factory exists, undefined otherwise
   */
  get(modelId: string): PromptOptimizationStrategy | undefined {
    const normalizedModelId = resolvePromptModelId(modelId) ?? modelId;
    const factory = this.factories.get(normalizedModelId);
    return factory ? factory() : undefined;
  }

  getModelConstraints(modelId: string): ModelConstraints | undefined {
    return getPromptModelConstraints(resolvePromptModelId(modelId) ?? modelId);
  }

  /**
   * Create fresh instances of all registered strategies
   * @returns Array of new strategy instances
   */
  getAll(): PromptOptimizationStrategy[] {
    return Array.from(this.factories.values()).map((f) => f());
  }

  /**
   * Check if a factory is registered for a model
   * @param modelId - The model identifier to check
   * @returns true if a factory exists for the model
   */
  has(modelId: string): boolean {
    const normalizedModelId = resolvePromptModelId(modelId) ?? modelId;
    return this.factories.has(normalizedModelId);
  }

  /**
   * Get all registered model IDs
   * @returns Array of model IDs
   */
  getModelIds(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Get the count of registered strategies
   * @returns Number of registered strategy factories
   */
  get size(): number {
    return this.factories.size;
  }

  /**
   * Clear all registered factories
   * Useful for testing or resetting the registry
   */
  clear(): void {
    this.factories.clear();
  }
}
