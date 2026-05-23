import type { ModelPromptStrategy } from "./types";
import { buildBaseHeader } from "./promptStrategyUtils";

export const sora2PromptStrategy: ModelPromptStrategy = {
  modelId: "sora-2",
  output: { format: "text" },
  buildPrompt: (context) => `${buildBaseHeader(context)}
INSTRUCTIONS for Sora:
1. Use a descriptive "World-building" style, drawing heavily from the 'environment' and 'meta' fields in the IR.
2. Create rich, multi-sentence descriptions of 60-120 words. Do NOT exceed 120 words.
3. Detail background layers, atmospheric effects, and physical interactions between subjects.
4. Describe physics and motion trajectories concretely (e.g., "hair sways with the turn", "dust rises from the tires"). Sora excels at realistic motion.
5. Integrate technical specs (duration, lens, aspect ratio) into the prose narratively — e.g. "a slow 5-second push on 35mm" — NOT as a parenthetical tail like "(5s, 16:9, 50mm)". See OUTPUT FORMAT RULES above.
6. ANTI-FILLER: Every word must describe something camera-visible. Do NOT use filler phrases like "ensuring that", "creating a sense of", "adding to the overall", "truly", "characteristic of".
7. VISUAL SPECIFICITY: Name materials, colors, textures, and physical positions. Replace abstract moods with concrete visual equivalents (e.g., "warm amber light on weathered skin" instead of "a warm, inviting feeling").

Output ONLY the optimized prompt.`,
};
