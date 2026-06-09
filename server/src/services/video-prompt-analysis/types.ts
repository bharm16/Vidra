/**
 * Types for video prompt analysis services
 * Shared type definitions used across video prompt analysis modules
 */

/**
 * Constraint configuration
 */
export interface ConstraintConfig {
  mode: string;
  minWords: number;
  maxWords: number;
  maxSentences: number;
  slotDescriptor: string;
  disallowTerminalPunctuation?: boolean;
  formRequirement?: string;
  focusGuidance?: string[];
  extraRequirements?: string[];
}

/**
 * Constraint generation details
 */
export interface ConstraintDetails {
  highlightWordCount?: number | undefined;
  phraseRole?: string | null | undefined;
  highlightedText?: string | undefined;
  highlightedCategory?: string | null | undefined;
  highlightedCategoryConfidence?: number | null | undefined;
}

/**
 * Constraint generation options
 */
export interface ConstraintOptions {
  forceMode?: string;
}

/**
 * Span object for guidance analysis
 */
export interface GuidanceSpan {
  category?: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * Edit history entry
 *
 * `category` admits null because enhancement's EditHistoryEntry
 * (the upstream producer wired in via the VideoService seam) carries
 * `category: string | null`; consumers guard with truthiness checks.
 */
export interface EditHistoryEntry {
  category?: string | null;
  original?: string;
  replacement?: string;
}

/**
 * Existing elements analysis result
 */
export interface ExistingElements {
  timeOfDay: string | null;
  location: string | null;
  mood: string | null;
  subject: {
    core: string;
    appearance: boolean;
    emotion: boolean;
    details: boolean;
  };
  lighting: {
    direction: boolean;
    quality: boolean;
    temperature: boolean;
    intensity: boolean;
  };
  camera: {
    movement: boolean;
    lens: boolean;
    angle: boolean;
    framing: boolean;
  };
  action: string;
  style: string | null;
}

/**
 * Category relationships analysis
 */
export interface CategoryRelationships {
  constraints: string[];
  opportunities: string[];
}

/**
 * Intermediate Representation (IR) of a video prompt
 * Used to normalize user intent before synthesis into model-specific formats
 */
export interface VideoPromptIR {
  subjects: Array<{
    text: string;
    count?: number;
    attributes: string[]; // e.g., "sad", "cyberpunk"
  }>;
  actions: string[]; // e.g., "running", "exploding"
  camera: {
    movements: string[]; // e.g., "dolly in", "pan left"
    angle?: string; // e.g., "low angle"
    shotType?: string; // e.g., "wide shot"
  };
  environment: {
    setting: string;
    lighting: string[];
    weather?: string;
  };
  audio: {
    dialogue?: string;
    music?: string;
    sfx?: string;
  };
  meta: {
    mood: string[];
    style: string[];
    temporal?: string[]; // e.g., "then", "after"
  };
  technical: Record<string, string>; // Key-value pairs from technical specifications (duration, aspect ratio, etc.)
  raw: string; // Original input text
}
