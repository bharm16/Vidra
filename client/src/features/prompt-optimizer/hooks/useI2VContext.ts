import { useGenerationControlsStoreState } from "@features/generation-controls";
import type { I2VContext } from "../types/i2v";

export function useI2VContext(): I2VContext {
  const { domain } = useGenerationControlsStoreState();
  const startImageUrl = domain.startFrame?.url ?? null;

  return {
    isI2VMode: Boolean(startImageUrl),
    startImageUrl,
    startImageSourcePrompt: domain.startFrame?.sourcePrompt ?? null,
  };
}
