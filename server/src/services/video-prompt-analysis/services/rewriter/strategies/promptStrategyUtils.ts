import type { RewriteConstraints } from "../../../strategies/types";
import type { PromptBuildContext } from "./types";

const formatConstraintBlock = (constraints: RewriteConstraints): string => {
  const sections: string[] = [];
  const { mandatory, suggested, avoid } = constraints;

  if (mandatory && mandatory.length > 0) {
    sections.push(
      `MANDATORY CONSTRAINTS (must appear, paraphrased if needed):\n- ${mandatory.join("\n- ")}`,
    );
  }

  if (suggested && suggested.length > 0) {
    sections.push(
      `SUGGESTED CONSTRAINTS (include when natural):\n- ${suggested.join("\n- ")}`,
    );
  }

  if (avoid && avoid.length > 0) {
    sections.push(
      `AVOID (do not include these words/phrases):\n- ${avoid.join("\n- ")}`,
    );
  }

  if (sections.length === 0) {
    return "";
  }

  return `\nCONSTRAINTS:\n${sections.join("\n")}\n`;
};

export const buildBaseHeader = ({
  ir,
  modelId,
  constraints,
}: PromptBuildContext): string => {
  const irJson = JSON.stringify(ir, null, 2);
  const constraintBlock = formatConstraintBlock(constraints);

  return `You are a professional video prompt engineer. Your goal is to rewrite the original user intent into an optimized prompt for the ${modelId} video generation model.

Below is the structured Intermediate Representation (IR) of the user's request, which includes the narrative description, subjects, actions, camera movements, environment, audio, and technical specifications. Use this structured data to generate a high-fidelity prompt.

OUTPUT FORMAT RULES (apply to every model strategy):
- Integrate technical specs (duration, aspect ratio, frame rate, lens, aperture) NATURALLY into the prose narrative when they belong. Example: "captured on 35mm at f/2.8" inside a sentence is fine.
- DO NOT append a parenthetical or comma-separated tech-spec tail at the end of the prompt (e.g. "(5s, 16:9, 24fps, 50mm at f/2.8)"). Such tails are prone to mid-phrase truncation when the response length runs out, producing fragments like "...50mm at" with no completion.
- End the prompt with a complete sentence terminated by punctuation. No trailing commas, no half-finished parenthetical lists.

Video Prompt IR:
\`\`\`json
${irJson}
\`\`\`

${constraintBlock}`;
};
