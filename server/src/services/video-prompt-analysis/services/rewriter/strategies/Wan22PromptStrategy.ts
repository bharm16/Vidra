import type { ModelPromptStrategy } from "./types";
import { buildBaseHeader } from "./promptStrategyUtils";

export const wan22PromptStrategy: ModelPromptStrategy = {
  modelId: "wan-2.2",
  output: { format: "text" },
  buildPrompt: (context) => `${buildBaseHeader(context)}
INSTRUCTIONS for Wan 2.2:
1. Use the structure: Subject + Scene + Motion.
2. Spend most of your word budget on VISIBLE DETAILS: materials, textures, colors, body positions, facial expressions, clothing, surface qualities.
3. Describe the subject's appearance and action precisely — clothes, posture, gesture, expression.
4. Include at least 2-3 specific environmental details (objects, surfaces, atmospheric conditions).
5. Describe lighting naturally within the scene (e.g., "warm golden sunlight rakes across the pavement") rather than as a technical spec.
6. MINIMIZE camera movement instructions — Wan 2.2 has limited camera control.
7. Every word must describe something the camera can see. No abstract emotions or moods.
8. Do NOT use bilingual output; use English only.

Output ONLY the optimized prompt.`,
};
