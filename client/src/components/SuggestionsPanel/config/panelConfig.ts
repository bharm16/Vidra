/**
 * SuggestionsPanel Configuration
 *
 * Centralized configuration for default states, props, thresholds, and API endpoints.
 */

import {
  AlertTriangle,
  Sparkles,
  CheckCircle,
} from "@promptstudio/system/components/ui";

// ===========================
// DEFAULT STATES
// ===========================

export const DEFAULT_INACTIVE_STATE = {
  icon: Sparkles,
  title: "Click a highlighted token",
  description:
    "Click a highlighted token in the output to explore alternatives.",
  example: {
    from: "baby",
    to: ["toddler", "infant", "young child"],
  },
} as const;

export const DEFAULT_EMPTY_STATE = {
  icon: Sparkles,
  title: "No suggestions available",
  description:
    "Try selecting a different section or use a custom request above.",
} as const;

export const DEFAULT_ERROR_STATE = {
  icon: AlertTriangle,
  title: "Unable to load suggestions",
  description: "Please try again in a moment.",
} as const;

// ===========================
// DEFAULT PROPS
// ===========================

export const DEFAULT_PANEL_CONFIG = {
  panelTitle: "",
  panelClassName: "flex flex-col overflow-hidden",
  enableCustomRequest: true,
  customRequestPlaceholder: "Make it more cinematic, brighter, tense, etc.",
  customRequestHelperText:
    "Describe the tone, detail, or direction you want to see.",
  customRequestCtaLabel: "Get Suggestions",
  contextLabel: "For",
  showContextBadge: false,
  contextBadgeText: "Context-aware",
  contextBadgeIcon: CheckCircle,
  showCategoryTabs: true,
  showCopyAction: true,
} as const;

// ===========================
// THRESHOLDS & LIMITS
// ===========================

export const COMPATIBILITY_THRESHOLDS = {
  HIGH: 0.8,
  LOW: 0.6,
} as const;

export const MAX_KEYBOARD_SHORTCUTS = 8 as const;
export const MAX_REQUEST_LENGTH = 500 as const;

// ===========================
// API ENDPOINTS
// ===========================

export const API_ENDPOINTS = {
  CUSTOM_SUGGESTIONS: "/api/enhancement/custom-suggestions",
} as const;
