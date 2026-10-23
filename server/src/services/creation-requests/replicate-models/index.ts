import { PICTURE_MODEL_DEFINITIONS } from "./pictureModels";
import { SOUND_MODEL_DEFINITIONS } from "./soundModels";
import { STUDIO_PICTURE_MODEL_DEFINITIONS } from "./studioPictureModels";
import type { ReplicateModelDefinition } from "./types";
import { VIDEO_MODEL_DEFINITIONS } from "./videoModels";

/**
 * Replicate models offered as exact native profiles. Each definition is one
 * profile: a model, an action and a mode, with every documented setting.
 */
export const REPLICATE_MODEL_DEFINITIONS: readonly ReplicateModelDefinition[] =
  [
    ...VIDEO_MODEL_DEFINITIONS,
    ...PICTURE_MODEL_DEFINITIONS,
    ...STUDIO_PICTURE_MODEL_DEFINITIONS,
    ...SOUND_MODEL_DEFINITIONS,
  ];

const BY_PROFILE_ID = new Map(
  REPLICATE_MODEL_DEFINITIONS.map((definition) => [
    definition.profile.id,
    definition,
  ]),
);

/** The definition behind a profile, only when the profile still names the same model. */
export function replicateModelFor(profile: {
  id: string;
  endpoint: string;
}): ReplicateModelDefinition | undefined {
  const definition = BY_PROFILE_ID.get(profile.id);
  return definition?.profile.endpoint === profile.endpoint
    ? definition
    : undefined;
}

export type {
  ModelCall,
  ModelInput,
  ModelInputTools,
  ReplicateModelDefinition,
} from "./types";
