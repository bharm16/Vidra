/**
 * Configuration for prompt optimization service
 * Centralizes all timeouts, token limits, and mode-specific settings
 */

interface OptimizationTimeouts {
  contextInference: number;
  modeDetection: number;
  optimization: {
    default: number;
    video: number;
  };
}

interface OptimizationTokens {
  contextInference: number;
  modeDetection: number;
  optimization: {
    default: number;
    video: number;
  };
  domainContent: number;
}

interface OptimizationTemperatures {
  contextInference: number;
  modeDetection: number;
  optimization: {
    default: number;
    video: number;
  };
  domainContent: number;
}

interface QualityThresholds {
  minAcceptableScore: number;
}

interface ModeDetectionConfig {
  minConfidenceThreshold: number;
  defaultMode: string;
}

interface TemplateVersions {
  default: string;
  video: string;
}

interface SpanLabelingConfig {
  maxSpans: number;
  minConfidence: number;
  templateVersion: string;
}

interface CacheConfig {
  promptOptimization: string;
  contextInference: string;
  modeDetection: string;
}

export const OptimizationConfig = {
  // API timeout settings (in milliseconds)
  timeouts: {
    contextInference: 15000, // Context inference from prompt
    modeDetection: 10000, // Mode detection
    optimization: {
      default: 30000,
      video: 90000, // Video prompts need more time
    },
  } as OptimizationTimeouts,

  // Token limits for different operations
  tokens: {
    contextInference: 500,
    modeDetection: 300,
    optimization: {
      default: 2500,
      video: 4000,
    },
    domainContent: 1500,
  } as OptimizationTokens,

  // Temperature settings for different operations
  temperatures: {
    contextInference: 0.3, // Low for consistent inference
    modeDetection: 0.2, // Very low for consistent mode detection
    optimization: {
      default: 0.3,
      video: 0.7, // Higher creativity for video
    },
    domainContent: 0.4,
  } as OptimizationTemperatures,

  // Quality thresholds
  quality: {
    minAcceptableScore: 0.6,
  } as QualityThresholds,

  // Mode detection thresholds
  modeDetection: {
    minConfidenceThreshold: 0.3,
    defaultMode: "video",
  } as ModeDetectionConfig,

  // Template versions for tracking improvements
  templateVersions: {
    default: "2.0.0",
    video: "1.0.0",
  } as TemplateVersions,

  // Span labeling configuration (for video mode)
  spanLabeling: {
    maxSpans: 60,
    minConfidence: 0.5,
    templateVersion: "v1",
  } as SpanLabelingConfig,

  // Cache configuration keys
  cache: {
    promptOptimization: "promptOptimization",
    contextInference: "contextInference",
    modeDetection: "modeDetection",
  } as CacheConfig,
} as const;

export default OptimizationConfig;
