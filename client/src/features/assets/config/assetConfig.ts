export const ASSET_TYPES = {
  character: {
    id: "character",
    label: "Character",
    icon: "User",
    color: "violet",
    colorClass: "text-foreground",
    bgClass: "bg-surface-3",
    borderClass: "border-border",
    maxReferenceImages: 10,
    description: "People, animals, or any entity that appears in your videos",
    placeholders: {
      name: "e.g., Alice (Protagonist)",
      trigger: "e.g., @Alice",
      textDefinition:
        "e.g., A woman in her early 30s with shoulder-length auburn hair, sharp facial features, light freckles, wearing a distressed leather jacket",
      negativePrompt: "e.g., no glasses, no hat",
    },
  },
  style: {
    id: "style",
    label: "Style",
    icon: "Palette",
    color: "amber",
    colorClass: "text-foreground",
    bgClass: "bg-surface-3",
    borderClass: "border-border",
    maxReferenceImages: 5,
    description: "Visual styles, color palettes, or aesthetic treatments",
    placeholders: {
      name: "e.g., CyberNoir",
      trigger: "e.g., @CyberNoir",
      textDefinition:
        "e.g., dark cyberpunk aesthetic with neon accents, high contrast, rain-slicked surfaces, blue and magenta color palette",
      negativePrompt: "e.g., bright daylight, pastel colors",
    },
  },
  location: {
    id: "location",
    label: "Location",
    icon: "MapPin",
    color: "emerald",
    colorClass: "text-foreground",
    bgClass: "bg-surface-3",
    borderClass: "border-border",
    maxReferenceImages: 5,
    description: "Places, environments, or settings for your scenes",
    placeholders: {
      name: "e.g., Tokyo Alley",
      trigger: "e.g., @TokyoAlley",
      textDefinition:
        "e.g., narrow Japanese alleyway with traditional lanterns, vending machines, steam rising from grates, wet pavement reflecting lights",
      negativePrompt: "e.g., daytime, empty streets",
    },
  },
  object: {
    id: "object",
    label: "Object",
    icon: "Box",
    color: "blue",
    colorClass: "text-foreground",
    bgClass: "bg-surface-3",
    borderClass: "border-border",
    maxReferenceImages: 5,
    description: "Props, vehicles, or specific items that appear in scenes",
    placeholders: {
      name: "e.g., Hovercar",
      trigger: "e.g., @Hovercar",
      textDefinition:
        "e.g., sleek futuristic vehicle with glowing blue undercarriage, chrome finish, gull-wing doors",
      negativePrompt: "e.g., wheels touching ground",
    },
  },
};

export const ASSET_TYPE_LIST = Object.values(ASSET_TYPES);

export const getAssetTypeConfig = (type: string) =>
  ASSET_TYPES[type as keyof typeof ASSET_TYPES] || ASSET_TYPES.object;

export const TRIGGER_REGEX = /@[a-zA-Z][a-zA-Z0-9_]*/g;

export const MAX_TRIGGER_LENGTH = 20;
export const MAX_NAME_LENGTH = 50;
export const MAX_TEXT_DEFINITION_LENGTH = 1000;
