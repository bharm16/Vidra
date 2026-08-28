import type { ModelPromptStrategy } from "./types";
import { buildBaseHeader } from "./promptStrategyUtils";

export const veo4PromptStrategy: ModelPromptStrategy = {
  modelId: "veo-3",
  output: { format: "text" },
  buildPrompt: (context) => `${buildBaseHeader(context)}
INSTRUCTIONS for Google Veo 3:
1. Output cinematic prose, not JSON.
2. Keep one coherent shot with clear subject, action, setting, and camera movement.
3. VISUAL SPECIFICITY: Describe what the camera sees. Use material textures (weathered wood, brushed steel), surface qualities (matte, reflective, translucent), specific colors (burnt sienna, cool slate blue), and body positions (hunched forward, arms extended). Do NOT use abstract emotions or viewer-directed language.
4. LIGHTING: Never use bare "cinematic" as a style reference. Specify lighting source and quality: "warm golden-hour backlight", "cool overcast diffused light", "harsh overhead fluorescent". Reference specific film looks when relevant (e.g., "naturalistic lighting in the style of Terrence Malick", "high-contrast chiaroscuro").
5. Keep hierarchy clear: lead with the most visually distinctive element, then camera, then environment/style.
6. Include audio only when explicitly requested by the user prompt.
7. Avoid template artifacts, markdown headings, and technical parameter lists.

Output ONLY the optimized prompt text.`,
};
