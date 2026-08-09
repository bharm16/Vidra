/**
 * Provider-Specific Schema Factory
 *
 * Creates optimized JSON schemas based on LLM provider capabilities.
 */

import { getVideoOptimizationSchema } from "./schemas/videoOptimization";
import type { JSONSchema, SchemaOptions } from "./schemas/types";

export type { JSONSchema, SchemaOptions };

export { getVideoOptimizationSchema };

export default {
  getVideoOptimizationSchema,
};
