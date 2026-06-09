/**
 * UNIFIED TECHNICAL TAXONOMY
 * The single source of truth for all Video Prompt Builder categories.
 *
 * HIERARCHY PRINCIPLE:
 * 1. SHOT & CAMERA (framing + movement) - What the camera sees and how it moves
 * 2. ENTITY & ACTION (Subject, appearance, wardrobe, emotion, action)
 * 3. SETTING (Environment, Lighting) - Global scene context
 * 4. STYLE & TECHNICAL (Style, Specs, Audio) - Aesthetic and delivery
 *
 * This taxonomy structurally enforces parent-child relationships,
 * preventing "orphaned attributes" (e.g., wardrobe without subject).
 *
 * VERSION 3.0: Universal Prompt Framework alignment (PDF)
 * - Shot Type separated from camera ops
 * - Action promoted to its own slot (One Clip, One Action)
 * - Namespaced IDs preserved with camelCase attributes
 */

export interface CategoryConfig {
  id: string;
  label: string;
  description: string;
  group: "entity" | "setting" | "technical";
  color: string;
  attributes?: Record<string, string>;
}

export type TaxonomyKey =
  | "SHOT"
  | "SUBJECT"
  | "ACTION"
  | "ENVIRONMENT"
  | "LIGHTING"
  | "CAMERA"
  | "STYLE"
  | "TECHNICAL"
  | "AUDIO";

export interface Taxonomy {
  readonly SHOT: CategoryConfig;
  readonly SUBJECT: CategoryConfig;
  readonly ACTION: CategoryConfig;
  readonly ENVIRONMENT: CategoryConfig;
  readonly LIGHTING: CategoryConfig;
  readonly CAMERA: CategoryConfig;
  readonly STYLE: CategoryConfig;
  readonly TECHNICAL: CategoryConfig;
  readonly AUDIO: CategoryConfig;
}

export const TAXONOMY = {
  // ============================================================================
  // GROUP 0: THE SHOT (FRAMING)
  // ============================================================================

  /**
   * SHOT - The framing and shot type (priority slot #1)
   */
  SHOT: {
    id: "shot",
    label: "Shot Type",
    description: "Framing and vantage of the camera",
    group: "technical",
    color: "cyan",
    attributes: {
      /** Shot type / framing: "Wide shot", "Close-up", "Bird\'s eye", "Dutch angle" */
      TYPE: "shot.type",
    },
  },

  // ============================================================================
  // GROUP 1: THE SUBJECT (ENTITIES)
  // ============================================================================

  /**
   * SUBJECT - The focal point of the shot (person, object, animal)
   * Parent category for all subject-related attributes
   */
  SUBJECT: {
    id: "subject",
    label: "Subject & Character",
    description: "The focal point of the shot",
    group: "entity",
    color: "orange",
    attributes: {
      /** Core identity: "A cowboy", "An alien" */
      IDENTITY: "subject.identity",

      /** Physical traits: "Weathered face", "Tall", "Athletic build" */
      APPEARANCE: "subject.appearance",

      /** Clothing: "Leather jacket", "Space suit", "Vintage attire" */
      WARDROBE: "subject.wardrobe",

      /** Movement/Activity (maps to action slot for compatibility): "Running", "Sitting", "Leaning against wall" */
      ACTION: "action.movement",

      /** Emotional state: "Stoic expression", "Joyful demeanor" */
      EMOTION: "subject.emotion",
    },
  },

  // ============================================================================
  // GROUP 1B: ACTION (ONE CLIP, ONE ACTION)
  // ============================================================================

  /**
   * ACTION - Physical action/state for the subject (priority slot #3)
   */
  ACTION: {
    id: "action",
    label: "Action & Motion",
    description: "What the subject is doing (one continuous action)",
    group: "entity",
    color: "rose",
    attributes: {
      /** Movement / verb phrase: "running", "floating", "leaning" */
      MOVEMENT: "action.movement",
      /** Static pose/state: "standing", "sitting", "kneeling" */
      STATE: "action.state",
      /** Gestures/micro-actions: "raising hand", "smiling softly" */
      GESTURE: "action.gesture",
    },
  },

  // ============================================================================
  // GROUP 2: THE SETTING
  // ============================================================================

  /**
   * ENVIRONMENT - Where the scene takes place
   * Spatial and contextual setting information
   */
  ENVIRONMENT: {
    id: "environment",
    label: "Environment",
    description: "Where the scene takes place",
    group: "setting",
    color: "emerald",
    attributes: {
      /** Physical location: "Diner", "Mars", "Forest" */
      LOCATION: "environment.location",

      /** Weather conditions: "Rainy", "Foggy", "Sunny" */
      WEATHER: "environment.weather",

      /** Environmental context: "Crowded", "Empty", "Abandoned" */
      CONTEXT: "environment.context",
    },
  },

  /**
   * LIGHTING - Illumination and atmosphere
   * How the scene is lit and the quality of light
   */
  LIGHTING: {
    id: "lighting",
    label: "Lighting",
    description: "Illumination and atmosphere",
    group: "setting",
    color: "yellow",
    attributes: {
      /** Light source: "Neon sign", "Sun", "Candles" */
      SOURCE: "lighting.source",

      /** Light quality: "Soft", "Hard", "Diffused" */
      QUALITY: "lighting.quality",

      /** Time of day: "Golden hour", "Night", "Dawn" */
      TIME: "lighting.timeOfDay",

      /** Color temperature: "5500K", "3200K", "warm", "cool" */
      COLOR_TEMP: "lighting.colorTemp",
    },
  },

  // ============================================================================
  // GROUP 3: TECHNICAL & CINEMATOGRAPHY
  // ============================================================================

  /**
   * CAMERA - Cinematography and framing
   * How the scene is captured and composed
   */
  CAMERA: {
    id: "camera",
    label: "Camera",
    description: "Cinematography and framing",
    group: "technical",
    color: "sky",
    attributes: {
      /** Shot type: "Close-up", "Wide shot", "Medium" */
      FRAMING: "shot.type",

      /** Camera movement: "Dolly", "Pan", "Static", "Crane" */
      MOVEMENT: "camera.movement",

      /** Lens specs: "35mm", "Anamorphic", "Wide angle" */
      LENS: "camera.lens",

      /** Camera angle: "Low angle", "Overhead", "Eye level" */
      ANGLE: "camera.angle",

      /** Focus/aperture: "f/2.8", "deep focus", "shallow depth of field" */
      FOCUS: "camera.focus",
    },
  },

  /**
   * STYLE - Visual treatment and aesthetic
   * Overall look and feel of the video
   */
  STYLE: {
    id: "style",
    label: "Style & Aesthetic",
    description: "Visual treatment and medium",
    group: "technical",
    color: "violet",
    attributes: {
      /** Aesthetic style: "Cyberpunk", "Noir", "Vintage" */
      AESTHETIC: "style.aesthetic",

      /** Film medium: "Kodak Portra", "35mm film", "Digital" */
      FILM_STOCK: "style.filmStock",

      /** Color grading: "warm tones", "desaturated", "vibrant colors" */
      COLOR_GRADE: "style.colorGrade",
    },
  },

  /**
   * TECHNICAL - Technical specifications
   * Video technical parameters
   */
  TECHNICAL: {
    id: "technical",
    label: "Technical Specs",
    description: "Video technical parameters",
    group: "technical",
    color: "slate",
    attributes: {
      /** Aspect ratio: "16:9", "2.39:1", "9:16" */
      ASPECT_RATIO: "technical.aspectRatio",

      /** Frame rate: "24fps", "30fps", "60fps" */
      FPS: "technical.frameRate",

      /** Resolution: "4K", "1080p", "8K" */
      RESOLUTION: "technical.resolution",

      /** Duration: "4-8s", "10s", "30 seconds" */
      DURATION: "technical.duration",
    },
  },

  /**
   * AUDIO - Audio and sound design
   * Sound elements in the video
   */
  AUDIO: {
    id: "audio",
    label: "Audio",
    description: "Sound and music elements",
    group: "technical",
    color: "fuchsia",
    attributes: {
      /** Music/Score: "Orchestral score", "Ambient music" */
      SCORE: "audio.score",

      /** Sound effects: "Footsteps", "Wind", "Traffic" */
      SFX: "audio.soundEffect",

      /** Ambient sounds: "Natural ambience", "City sounds", "Forest sounds" */
      AMBIENT: "audio.ambient",
    },
  },
} as const satisfies Taxonomy;

// ============================================================================
// VALIDATION SET
// ============================================================================

/**
 * Fast lookup set for validation.
 * Contains ALL valid IDs (parents + attributes).
 * Use .has() for O(1) validation instead of object lookup.
 */
export const VALID_CATEGORIES = new Set<string>();

// Populate the validation set
Object.values(TAXONOMY).forEach((category) => {
  VALID_CATEGORIES.add(category.id);
  if (category.attributes) {
    Object.values(category.attributes).forEach((attributeId) => {
      VALID_CATEGORIES.add(attributeId);
    });
  }
});

/**
 * Taxonomy Version - Used for cache invalidation and debugging
 */
export const TAXONOMY_VERSION = "3.0.0";

/**
 * Check if a category ID is valid
 *
 * @example
 * isValidCategory('subject') // true
 * isValidCategory('subject.wardrobe') // true
 * isValidCategory('invalid') // false
 */
export function isValidCategory(id: string): boolean {
  return VALID_CATEGORIES.has(id);
}

/**
 * Resolve a category ID (post-migration, no legacy mapping).
 *
 * @example
 * resolveCategory('subject.wardrobe') // 'subject.wardrobe'
 */
export function resolveCategory(id: string | null | undefined): string {
  if (!id) return id ?? "";
  return id;
}

/**
 * Legacy capitalized role aliases from pre-3.0 span-labeling responses.
 * Cached responses may still carry these; map them to current taxonomy ids.
 */
export const LEGACY_ROLE_TO_CATEGORY: Record<string, string> = {
  Subject: "subject",
  Appearance: "subject.appearance",
  Wardrobe: "subject.wardrobe",
  Movement: "action.movement",
  Environment: "environment",
  Lighting: "lighting",
  Camera: "camera",
  Framing: "shot.type",
  Specs: "technical",
  Style: "style",
  Quality: "style.aesthetic",
};

/**
 * Normalize a raw span role/category to a valid taxonomy id.
 *
 * The single home for taxonomy normalization, shared by the span-labeling
 * route transform (server) and the highlight conversion (client) so the two
 * sides cannot drift. Valid ids pass through; legacy capitalized roles map
 * via LEGACY_ROLE_TO_CATEGORY; anything unknown defaults to the subject root.
 *
 * @example
 * normalizeRole('subject.wardrobe') // 'subject.wardrobe'
 * normalizeRole('Lighting')         // 'lighting'
 * normalizeRole('garbage')          // 'subject'
 */
export function normalizeRole(role: string | null | undefined): string {
  if (typeof role !== "string" || !role) return TAXONOMY.SUBJECT.id;
  if (VALID_CATEGORIES.has(role)) return role;
  const legacy = LEGACY_ROLE_TO_CATEGORY[role];
  if (legacy) return legacy;
  return TAXONOMY.SUBJECT.id;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export interface ParsedCategoryId {
  parent: string;
  attribute: string | null;
  isParent: boolean;
}

/**
 * Parse a category ID into its components
 *
 * @example
 * parseCategoryId('subject.wardrobe')
 * // { parent: 'subject', attribute: 'wardrobe', isParent: false }
 *
 * parseCategoryId('subject')
 * // { parent: 'subject', attribute: null, isParent: true }
 */
export function parseCategoryId(
  id: string | null | undefined,
): ParsedCategoryId | null {
  if (!id || typeof id !== "string") return null;

  const parts = id.split(".");
  const parent = parts[0];
  if (!parent) {
    return null;
  }
  if (parts.length === 1) {
    // Parent category
    return { parent, attribute: null, isParent: true };
  }

  // Attribute category
  const attribute = parts[1];
  if (!attribute) {
    return null;
  }
  return { parent, attribute, isParent: false };
}

/**
 * Get the parent category ID from any category or attribute ID
 *
 * @example
 * getParentCategory('subject.wardrobe') // 'subject'
 * getParentCategory('subject') // 'subject' (is already parent)
 * getParentCategory('camera.framing') // 'camera'
 */
export function getParentCategory(
  categoryId: string | null | undefined,
): string | null {
  if (!categoryId) return null;
  const parsed = parseCategoryId(categoryId);

  if (!parsed) return null;
  return parsed.parent;
}

/**
 * Check if a category ID is an attribute (child) rather than a parent
 *
 * @example
 * isAttribute('subject.wardrobe') // true
 * isAttribute('subject') // false
 */
export function isAttribute(categoryId: string | null | undefined): boolean {
  if (!categoryId) return false;
  const parsed = parseCategoryId(categoryId);

  return parsed ? !parsed.isParent : false;
}

/**
 * Get all attribute IDs across the entire taxonomy
 *
 * @example
 * getAllAttributes() // ['subject.identity', 'subject.appearance', ...]
 */
export function getAllAttributes(): string[] {
  const attributes: string[] = [];

  for (const category of Object.values(TAXONOMY)) {
    if (category.attributes) {
      attributes.push(...Object.values(category.attributes));
    }
  }

  return attributes;
}

/**
 * Get all parent category IDs
 *
 * @example
 * getAllParentCategories() // ['subject', 'environment', 'lighting', ...]
 */
export function getAllParentCategories(): string[] {
  return Object.values(TAXONOMY).map((cat) => cat.id);
}

export interface CategoryByIdResult {
  id: string;
  parent?: string;
  attribute?: string;
  isAttribute?: boolean;
}

/**
 * Get category configuration by ID (parent or attribute)
 *
 * @example
 * getCategoryById('subject') // { id: 'subject', label: '...', ... }
 * getCategoryById('subject.wardrobe') // { id: 'subject.wardrobe', parent: 'subject', ... }
 */
export function getCategoryById(
  categoryId: string | null | undefined,
): CategoryConfig | CategoryByIdResult | null {
  if (!categoryId) return null;
  const parsed = parseCategoryId(categoryId);

  if (!parsed) return null;

  // Check if it's a parent category
  for (const category of Object.values(TAXONOMY)) {
    if (category.id === parsed.parent) {
      if (parsed.isParent) {
        return category;
      } else {
        // It's an attribute
        const attribute = parsed.attribute;
        if (!attribute) {
          return null;
        }
        return {
          id: categoryId,
          parent: parsed.parent,
          attribute,
          isAttribute: true,
        };
      }
    }
  }

  return null;
}

/**
 * Get all attributes for a given parent category
 *
 * @example
 * getAttributesForParent('subject') // ['subject.identity', 'subject.appearance', ...]
 */
export function getAttributesForParent(
  parentId: string | null | undefined,
): string[] {
  if (!parentId) return [];

  for (const category of Object.values(TAXONOMY)) {
    if (category.id === parentId && category.attributes) {
      return Object.values(category.attributes);
    }
  }

  return [];
}

/**
 * Get the group (entity, setting, technical) for a category
 *
 * @example
 * getGroupForCategory('subject.wardrobe') // 'entity'
 * getGroupForCategory('lighting') // 'setting'
 */
export function getGroupForCategory(
  categoryId: string | null | undefined,
): string | null {
  if (!categoryId) return null;

  const parentId = getParentCategory(categoryId);
  if (!parentId) return null;

  for (const category of Object.values(TAXONOMY)) {
    if (category.id === parentId) {
      return category.group;
    }
  }

  return null;
}

/**
 * Get the color theme for a category
 *
 * @example
 * getColorForCategory('subject.wardrobe') // 'orange'
 * getColorForCategory('camera') // 'blue'
 */
export function getColorForCategory(
  categoryId: string | null | undefined,
): string | null {
  if (!categoryId) return null;

  const parentId = getParentCategory(categoryId);
  if (!parentId) return null;

  for (const category of Object.values(TAXONOMY)) {
    if (category.id === parentId) {
      return category.color;
    }
  }

  return null;
}
