import type { ModelPromptStrategy } from "./types";
import { buildBaseHeader } from "./promptStrategyUtils";

export const kling26PromptStrategy: ModelPromptStrategy = {
  modelId: "kling-2.1",
  output: { format: "text" },
  buildPrompt: (context) => `${buildBaseHeader(context)}
INSTRUCTIONS for Kling 2.1:
1. Use the structure: [Subject], [Subject Description], [Movement/Action], [Scene/Context], [Camera/Lighting].
2. Use strong, active verbs for motion (e.g., "sprinting", "gliding").
3. Include concrete physical appearance: facial details, clothing materials, body build, distinguishing features.
4. Specify camera movement clearly (e.g., "Wide aerial shot", "Low-angle tracking shot").
5. CHARACTER PERFORMANCE: Describe micro-expressions (eyes widening, lips curling), hand gestures, weight shifts, and breathing patterns. These are Kling's strength.
6. Do NOT include f-stop, aperture, ISO, or focal length specs — Kling ignores these. Spend those tokens on character detail instead.
7. VISUAL SPECIFICITY: Describe observable details — material textures, color temperatures, physical positions — not abstract moods or feelings.
8. Keep prompt length concise unless the user asked for more.
9. Do NOT use screenplay format. Use standard descriptive prose.

Output ONLY the optimized prompt.`,
};
