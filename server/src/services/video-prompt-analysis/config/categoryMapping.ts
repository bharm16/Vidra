import { getParentCategory, TAXONOMY } from "#shared/taxonomy";

/**
 * Category mapping patterns for video phrase role detection
 * Now uses TAXONOMY constants as single source of truth
 */

interface CategoryPatternConfig {
  pattern: RegExp;
  role: string;
}

export const CATEGORY_PATTERNS: Record<string, CategoryPatternConfig> = {
  // ============================================================================
  // SUBJECT GROUP (Entity)
  // ============================================================================

  // Main subject entity
  [TAXONOMY.SUBJECT.id]: {
    pattern:
      /subject|character|figure|talent|person|performer|actor|protagonist/i,
    role: "subject or character detail",
  },

  // Subject attributes
  [TAXONOMY.SUBJECT.attributes.APPEARANCE]: {
    pattern:
      /appearance|face|body|build|hair|eyes|skin|features|complexion|physique/i,
    role: "subject appearance detail",
  },

  [TAXONOMY.SUBJECT.attributes.WARDROBE]: {
    pattern:
      /wardrobe|clothing|costume|attire|outfit|garment|jacket|suit|dress|wearing|dressed/i,
    role: "wardrobe and costume detail",
  },

  [TAXONOMY.SUBJECT.attributes.EMOTION]: {
    pattern: /emotion|mood|expression|demeanor|countenance|feeling/i,
    role: "subject emotional state",
  },

  // ============================================================================
  // ACTION GROUP (One Clip, One Action)
  // ============================================================================

  [TAXONOMY.ACTION.id]: {
    pattern: /action|movement|motion|activity|gesture|pose/i,
    role: "subject movement or activity",
  },

  [TAXONOMY.ACTION.attributes.MOVEMENT]: {
    pattern:
      /running|walking|floating|drifting|leaping|jumping|spinning|turning|rotating|leaning|holding|lifting|gripping|pushing|pulling|gesturing|smiling|gazing/i,
    role: "subject movement or activity",
  },

  [TAXONOMY.ACTION.attributes.STATE]: {
    pattern:
      /standing|sitting|kneeling|lying|crouching|perched|resting|poised/i,
    role: "subject static pose or state",
  },

  [TAXONOMY.ACTION.attributes.GESTURE]: {
    pattern: /raising|pointing|waving|nodding|shaking head|smiling|looking/i,
    role: "subject gesture or micro-action",
  },

  // ============================================================================
  // SETTING GROUP
  // ============================================================================

  // Environment
  [TAXONOMY.ENVIRONMENT.id]: {
    pattern:
      /location|setting|environment|background|place|interior|exterior|world/i,
    role: "location or environment detail",
  },

  [TAXONOMY.ENVIRONMENT.attributes.LOCATION]: {
    pattern: /location|setting|place|room|space|chamber|landscape|street/i,
    role: "specific location detail",
  },

  [TAXONOMY.ENVIRONMENT.attributes.WEATHER]: {
    pattern: /weather|rain|fog|sun|storm|cloud|wind/i,
    role: "weather condition",
  },

  [TAXONOMY.ENVIRONMENT.attributes.CONTEXT]: {
    pattern: /crowded|empty|busy|quiet|abandoned|pristine/i,
    role: "environmental context",
  },

  // Lighting
  [TAXONOMY.LIGHTING.id]: {
    pattern: /light|lighting|illumination|shadow|glow|contrast|exposure/i,
    role: "lighting description",
  },

  [TAXONOMY.LIGHTING.attributes.SOURCE]: {
    pattern:
      /\b(sunlight|moonlight|neon|candle|lamp|spotlight|natural light|artificial)\b/i,
    role: "light source",
  },

  [TAXONOMY.LIGHTING.attributes.QUALITY]: {
    pattern: /soft|hard|diffused|harsh|gentle|dramatic|flat/i,
    role: "light quality",
  },

  [TAXONOMY.LIGHTING.attributes.TIME]: {
    pattern:
      /timeofday|timeday|golden hour|dusk|dawn|morning|evening|night|day|sunset|sunrise/i,
    role: "time of day",
  },

  // ============================================================================
  // TECHNICAL GROUP
  // ============================================================================

  // Shot (framing)
  [TAXONOMY.SHOT.id]: {
    pattern:
      /shot|framing|close[- ]?up|wide|medium|extreme|bird'?s eye|overhead|dutch|angle|viewpoint/i,
    role: "shot type or framing",
  },

  [TAXONOMY.SHOT.attributes.TYPE]: {
    pattern:
      /shot|framing|close[- ]?up|wide|medium|extreme|bird'?s eye|overhead|dutch|angle|viewpoint/i,
    role: "shot type or framing",
  },

  // Camera
  [TAXONOMY.CAMERA.id]: {
    pattern: /camera|cinematography|lens|focus/i,
    role: "camera description",
  },

  [TAXONOMY.CAMERA.attributes.MOVEMENT]: {
    pattern: /pan|dolly|tracking|crane|zoom|tilt|handheld|static|steadicam/i,
    role: "camera movement",
  },

  [TAXONOMY.CAMERA.attributes.LENS]: {
    pattern: /lens|mm\b|focal|anamorphic|wide-angle|telephoto|fish-eye/i,
    role: "lens specification",
  },

  [TAXONOMY.CAMERA.attributes.ANGLE]: {
    pattern: /\b(low angle|high angle|dutch angle|overhead|eye level)\b/i,
    role: "camera angle",
  },

  // Style
  [TAXONOMY.STYLE.id]: {
    pattern: /style|tone|aesthetic|mood|genre|vibe|look/i,
    role: "style or aesthetic descriptor",
  },

  [TAXONOMY.STYLE.attributes.AESTHETIC]: {
    pattern: /cyberpunk|noir|vintage|modern|retro|minimalist|baroque/i,
    role: "aesthetic style",
  },

  [TAXONOMY.STYLE.attributes.FILM_STOCK]: {
    pattern: /film|kodak|fuji|35mm|16mm|70mm|digital/i,
    role: "film stock or medium",
  },

  // Technical specs
  [TAXONOMY.TECHNICAL.id]: {
    pattern: /spec|technical|duration|resolution/i,
    role: "technical specification",
  },

  [TAXONOMY.TECHNICAL.attributes.FPS]: {
    pattern: /framerate|fps|frames per second|24fps|30fps|60fps/i,
    role: "frame rate",
  },

  [TAXONOMY.TECHNICAL.attributes.ASPECT_RATIO]: {
    pattern: /aspect ratio|16:9|9:16|2\.39:1|4:3|1:1/i,
    role: "aspect ratio",
  },

  [TAXONOMY.TECHNICAL.attributes.RESOLUTION]: {
    pattern: /4k|8k|1080p|720p|resolution/i,
    role: "video resolution",
  },

  // Audio
  [TAXONOMY.AUDIO.id]: {
    pattern: /audio|music|sound|score|soundtrack/i,
    role: "audio or score descriptor",
  },

  [TAXONOMY.AUDIO.attributes.SCORE]: {
    pattern: /music|score|soundtrack|orchestral|ambient/i,
    role: "musical score",
  },

  [TAXONOMY.AUDIO.attributes.SFX]: {
    pattern: /sound|sfx|effect|footstep|wind|traffic/i,
    role: "sound effects",
  },

  // ============================================================================
  // LEGACY/QUALITY (No direct taxonomy parent - kept for compatibility)
  // ============================================================================

  COLOR: {
    pattern: /color|colour|palette|hue|saturation/i,
    role: "color and visual tone",
  },

  QUALITY: {
    pattern: /quality|masterpiece|detailed|photorealistic/i,
    role: "quality booster",
  },
};

/**
 * Role lookup keyed by taxonomy id.
 *
 * CATEGORY_PATTERNS is keyed by `TAXONOMY.*.id`, so an id resolves by key.
 * Testing the patterns in sequence instead resolves an attribute id to its
 * parent's entry — every attribute id contains its parent's name and the parent
 * is declared first, so `camera.movement` matches the ACTION pattern before it
 * ever reaches its own. Keys are folded to lower case because attribute ids are
 * camelCase (`lighting.timeOfDay`) while callers pass the id normalized.
 */
const ROLE_BY_CATEGORY_ID = new Map<string, string>(
  Object.entries(CATEGORY_PATTERNS).map(
    ([categoryId, config]): [string, string] => [
      categoryId.toLowerCase(),
      config.role,
    ],
  ),
);

/**
 * Resolve the role declared for a taxonomy category id.
 *
 * An attribute id with no entry of its own falls back to its parent's role.
 * Anything the taxonomy does not declare returns null, so the caller falls
 * through to context-based detection exactly as it does today.
 */
export function getRoleForCategoryId(
  categoryId: string | null | undefined,
): string | null {
  if (!categoryId) return null;

  const normalized = categoryId.trim().toLowerCase();
  const declared = ROLE_BY_CATEGORY_ID.get(normalized);
  if (declared) return declared;

  const parent = getParentCategory(normalized);
  if (parent && parent !== normalized) {
    return ROLE_BY_CATEGORY_ID.get(parent) ?? null;
  }

  return null;
}

/**
 * Context patterns for phrase role detection
 */
export const CONTEXT_PATTERNS = {
  location:
    /\b(location|setting|background|environment|interior|exterior|room|space|chamber|landscape|street)\b/,
  camera:
    /\b(camera|shot|angle|frame|lens|dolly|pan|tilt|tracking|handheld|static)\b/,
  shot: /\b(close[- ]?up|wide|medium|extreme|bird'?s eye|overhead|dutch|angle|viewpoint|shot)\b/,
  action:
    /\b(run|walk|walking|running|float|drift|jump|leap|spin|turn|lean|sit|stand|gesture|pose|smile|gaze)\b/,
  lighting:
    /\b(light|lighting|illuminated|glow|shadow|contrast|exposure|flare)\b/,
  character:
    /\bcharacter|figure|subject|person|leader|speaker|performer|actor|portrait\b/,
  style: /\bstyle|aesthetic|tone|mood|vibe|genre|inspired\b/,
  audio: /\bscore|music|soundtrack|audio\b/,
};

/**
 * Default role when no category matches
 */
export const DEFAULT_ROLE = "general visual detail";
