import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";

/** Mono provider logos from the Figma Model logos section (2650:12540), by the model's owner on its endpoint. */
const LOGOS: ReadonlyArray<[prefix: string, file: string]> = [
  ["google/nano-banana", "nano-banana"], ["google/gemini", "gemini"], ["google/lyria", "deepmind"], ["google/", "deepmind"],
  ["alibaba/", "alibaba"], ["wan-video/", "alibaba"], ["openai/", "openai"], ["black-forest-labs/", "flux"], ["prunaai/flux", "flux"],
  ["ideogram-ai/", "ideogram"], ["topazlabs/", "topaz"], ["xai/", "grok"], ["luma/", "luma"], ["elevenlabs/", "elevenlabs"],
  ["kwaivgi/", "kling"], ["recraft-ai/", "recraft"],
];

/** A model with no known logo keeps the model glyph. */
export function modelLogo(profile: Pick<CapabilityProfile, "endpoint">): string | undefined {
  const file = LOGOS.find(([prefix]) => profile.endpoint.startsWith(prefix))?.[1];
  return file ? `/design-assets/model-logo-${file}.svg` : undefined;
}
