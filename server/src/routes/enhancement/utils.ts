import type { EnhancementResult } from "@services/enhancement/services/types";

export const countSuggestions = (result: EnhancementResult): number => {
  if (result.isPlaceholder) {
    return result.suggestions.reduce(
      (sum, group) => sum + group.suggestions.length,
      0,
    );
  }
  return result.suggestions.length;
};
