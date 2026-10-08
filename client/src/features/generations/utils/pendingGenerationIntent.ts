import type {
  DraftModel,
  GenerationOverrides,
} from "@features/generation-controls";

export type PendingGenerationIntent =
  | {
      sessionId: string;
      prompt: string;
      kind: "draft";
      model: DraftModel;
      overrides?: GenerationOverrides | undefined;
    }
  | {
      sessionId: string;
      prompt: string;
      kind: "render";
      model: string;
      overrides?: GenerationOverrides | undefined;
    }
;

let pendingIntent: PendingGenerationIntent | null = null;

export const setPendingGenerationIntent = (
  intent: PendingGenerationIntent,
): void => {
  pendingIntent = intent;
};

export const peekPendingGenerationIntent = (): PendingGenerationIntent | null =>
  pendingIntent;

export const consumePendingGenerationIntent = (
  sessionId: string,
): PendingGenerationIntent | null => {
  if (!pendingIntent || pendingIntent.sessionId !== sessionId) {
    return null;
  }

  const nextIntent = pendingIntent;
  pendingIntent = null;
  return nextIntent;
};

export const clearPendingGenerationIntent = (): void => {
  pendingIntent = null;
};
