import type { SlotPolicy } from "../types.js";

const defaultWeights = {
  familyFit: 0.45,
  contextFit: 0.25,
  literalness: 0.2,
  overlapPenalty: 0.1,
} as const;

const guidedLlmDefaults = {
  targetCount: 6,
  minAcceptableCount: 3,
  rescueStrategy: {
    enabled: true,
    maxCalls: 1,
  },
  scorerWeights: defaultWeights,
} as const;

export const SLOT_POLICIES: SlotPolicy[] = [
  {
    categoryId: "shot.type",
    mode: "enumerated",
    grammar: { kind: "technical_phrase", minWords: 1, maxWords: 4 },
    targetCount: 6,
    minAcceptableCount: 3,
    requiredFamilies: ["shot_type"],
    forbiddenFamilies: [
      "camera_movement",
      "camera_lens",
      "camera_focus",
      "lighting_direction",
    ],
    promptGuidance:
      "Suggest only framing alternatives, not movement, lens, or focus details.",
    enumeratedOptions: [
      { text: "extreme close-up", families: ["shot_type"] },
      { text: "close-up", families: ["shot_type"] },
      { text: "medium close-up", families: ["shot_type"] },
      { text: "medium shot", families: ["shot_type"] },
      { text: "medium wide shot", families: ["shot_type"] },
      { text: "wide shot", families: ["shot_type"] },
      { text: "extreme wide shot", families: ["shot_type"] },
      { text: "over-the-shoulder", families: ["shot_type"] },
      { text: "master shot", families: ["shot_type"] },
    ],
    scorerWeights: defaultWeights,
  },
  {
    categoryId: "camera.angle",
    mode: "enumerated",
    grammar: { kind: "technical_phrase", minWords: 1, maxWords: 3 },
    targetCount: 6,
    minAcceptableCount: 3,
    requiredFamilies: ["camera_angle"],
    forbiddenFamilies: [
      "camera_movement",
      "camera_lens",
      "camera_focus",
      "shot_type",
    ],
    promptGuidance: "Suggest only angle or viewpoint changes.",
    enumeratedOptions: [
      { text: "eye-level", families: ["camera_angle"] },
      { text: "low-angle", families: ["camera_angle"] },
      { text: "high-angle", families: ["camera_angle"] },
      { text: "overhead", families: ["camera_angle"] },
      { text: "bird's-eye", families: ["camera_angle"] },
      { text: "worm's-eye", families: ["camera_angle"] },
      { text: "Dutch tilt", families: ["camera_angle"] },
      { text: "profile view", families: ["camera_angle"] },
      { text: "point-of-view", families: ["camera_angle"] },
    ],
    scorerWeights: defaultWeights,
  },
  {
    categoryId: "lighting.timeOfDay",
    mode: "enumerated",
    grammar: { kind: "time_phrase", minWords: 1, maxWords: 3 },
    targetCount: 6,
    minAcceptableCount: 3,
    requiredFamilies: ["lighting_time_of_day"],
    forbiddenFamilies: [
      "camera_movement",
      "camera_lens",
      "lighting_direction",
      "lighting_source",
    ],
    promptGuidance:
      "Suggest only alternate times of day or daylight conditions.",
    enumeratedOptions: [
      { text: "pre-dawn", families: ["lighting_time_of_day"] },
      { text: "sunrise", families: ["lighting_time_of_day"] },
      { text: "morning", families: ["lighting_time_of_day"] },
      { text: "midday", families: ["lighting_time_of_day"] },
      { text: "afternoon", families: ["lighting_time_of_day"] },
      { text: "golden hour", families: ["lighting_time_of_day"] },
      { text: "sunset", families: ["lighting_time_of_day"] },
      { text: "dusk", families: ["lighting_time_of_day"] },
      { text: "blue hour", families: ["lighting_time_of_day"] },
      { text: "night", families: ["lighting_time_of_day"] },
    ],
    scorerWeights: defaultWeights,
  },
  {
    categoryId: "technical.aspectRatio",
    mode: "enumerated",
    grammar: { kind: "technical_phrase", minWords: 1, maxWords: 2 },
    targetCount: 5,
    minAcceptableCount: 3,
    requiredFamilies: ["technical_aspect_ratio"],
    forbiddenFamilies: [
      "technical_frame_rate",
      "technical_resolution",
      "technical_duration",
    ],
    promptGuidance: "Suggest only aspect ratio values.",
    enumeratedOptions: [
      { text: "16:9", families: ["technical_aspect_ratio"] },
      { text: "9:16", families: ["technical_aspect_ratio"] },
      { text: "4:3", families: ["technical_aspect_ratio"] },
      { text: "1:1", families: ["technical_aspect_ratio"] },
      { text: "2.39:1", families: ["technical_aspect_ratio"] },
    ],
    scorerWeights: defaultWeights,
  },
  {
    categoryId: "technical.frameRate",
    mode: "enumerated",
    grammar: { kind: "technical_phrase", minWords: 1, maxWords: 2 },
    targetCount: 5,
    minAcceptableCount: 3,
    requiredFamilies: ["technical_frame_rate"],
    forbiddenFamilies: [
      "technical_aspect_ratio",
      "technical_resolution",
      "technical_duration",
    ],
    promptGuidance: "Suggest only frame-rate values.",
    enumeratedOptions: [
      { text: "24fps", families: ["technical_frame_rate"] },
      { text: "30fps", families: ["technical_frame_rate"] },
      { text: "48fps", families: ["technical_frame_rate"] },
      { text: "60fps", families: ["technical_frame_rate"] },
      { text: "120fps", families: ["technical_frame_rate"] },
    ],
    scorerWeights: defaultWeights,
  },
  {
    categoryId: "technical.resolution",
    mode: "enumerated",
    grammar: { kind: "technical_phrase", minWords: 1, maxWords: 2 },
    targetCount: 4,
    minAcceptableCount: 3,
    requiredFamilies: ["technical_resolution"],
    forbiddenFamilies: [
      "technical_aspect_ratio",
      "technical_frame_rate",
      "technical_duration",
    ],
    promptGuidance: "Suggest only resolution values.",
    enumeratedOptions: [
      { text: "1080p", families: ["technical_resolution"] },
      { text: "1440p", families: ["technical_resolution"] },
      { text: "4K", families: ["technical_resolution"] },
      { text: "8K", families: ["technical_resolution"] },
    ],
    scorerWeights: defaultWeights,
  },
  {
    categoryId: "technical.duration",
    mode: "enumerated",
    grammar: { kind: "technical_phrase", minWords: 1, maxWords: 2 },
    targetCount: 4,
    minAcceptableCount: 2,
    requiredFamilies: ["technical_duration"],
    forbiddenFamilies: [
      "technical_aspect_ratio",
      "technical_frame_rate",
      "technical_resolution",
    ],
    promptGuidance: "Suggest only duration values.",
    enumeratedOptions: [
      { text: "4s", families: ["technical_duration"] },
      { text: "6s", families: ["technical_duration"] },
      { text: "8s", families: ["technical_duration"] },
      { text: "10s", families: ["technical_duration"] },
    ],
    scorerWeights: defaultWeights,
  },
  {
    // B3 (2026-05-22): Sub-project D labeled this policy's template space as
    // a "slow dolly {direction}" diversity collapse — 6 picks span too few
    // distinct shapes. See docs/superpowers/specs/2026-05-22-suggestions-diversity-design.md
    // for Option A (template expansion) / B (hybrid) / C (full guided_llm) options.
    categoryId: "camera.movement",
    mode: "templated",
    grammar: { kind: "technical_phrase", minWords: 1, maxWords: 5 },
    targetCount: 6,
    minAcceptableCount: 3,
    requiredFamilies: ["camera_movement"],
    forbiddenFamilies: [
      "camera_lens",
      "camera_focus",
      "shot_type",
      "lighting_direction",
    ],
    promptGuidance: "Compose a single camera move or support-style phrase.",
    rescueStrategy: { enabled: true, maxCalls: 1 },
    templated: {
      // B3 Option A (2026-05-22): expanded vocabulary + new templates to
      // increase variety within a 6-pick response. Sub-project D's labeling
      // surfaced "slow dolly {direction}" repetition because the picker
      // concentrated on one template shape with a small tempo×direction
      // permutation. Named cinematic shots, tempo extensions, and motivated-
      // qualifier templates give the picker more distinct shapes to span.
      templates: [
        {
          name: "movement-direction",
          orderedSlots: ["tempo", "technique", "direction"],
        },
        {
          name: "movement-qualifier",
          orderedSlots: ["technique", "supportQualifier"],
        },
        {
          name: "static-frame",
          orderedSlots: ["technique", "stabilityQualifier"],
        },
        // New (B3 Option A):
        {
          name: "named-cinematic-shot",
          orderedSlots: ["namedShot"],
        },
        {
          name: "tempo-extended",
          orderedSlots: ["tempoQualifier", "technique"],
        },
      ],
      slots: {
        tempo: ["slow", "gentle", "smooth", "deliberate", "languid"],
        technique: [
          "dolly",
          "tracking",
          "pan",
          "tilt",
          "crane",
          "handheld",
          "static",
          "steadicam",
          "jib",
        ],
        direction: ["forward", "backward", "lateral", "upward", "downward"],
        supportQualifier: [
          "with subtle drift",
          "following the subject",
          "with breathing micro-motion",
          "anchored on the subject",
        ],
        stabilityQualifier: ["locked-off frame"],
        // New (B3 Option A) — named cinematic shots that don't permute slots:
        namedShot: [
          "Dutch tilt",
          "Steadicam push-in",
          "crane reveal",
          "vertigo dolly zoom",
          "POV float",
          "whip pan",
          "rack focus pull",
          "match-on-action cut-in",
        ],
        // New (B3 Option A) — tempo with cinematic feel rather than direction:
        tempoQualifier: [
          "languid",
          "deliberate",
          "patient",
          "tense rapid",
          "slow building",
        ],
      },
      requiredSlots: ["technique"],
      optionalSlots: [
        "tempo",
        "direction",
        "supportQualifier",
        "stabilityQualifier",
        "namedShot",
        "tempoQualifier",
      ],
      invalidCombinations: [
        {
          technique: ["static"],
          direction: ["forward", "backward", "lateral", "upward", "downward"],
        },
        { technique: ["handheld"], stabilityQualifier: ["locked-off frame"] },
      ],
      renderRules: {
        joinWith: " ",
        dedupeCaseInsensitive: true,
      },
      dedupeRules: {
        normalizeHyphenation: true,
        trimWhitespace: true,
      },
    },
    scorerWeights: defaultWeights,
  },
  {
    categoryId: "camera.lens",
    mode: "templated",
    grammar: { kind: "technical_phrase", minWords: 2, maxWords: 5 },
    targetCount: 6,
    minAcceptableCount: 3,
    requiredFamilies: ["camera_lens"],
    forbiddenFamilies: ["camera_movement", "camera_focus", "shot_type"],
    promptGuidance: "Compose a lens or aperture phrase only.",
    rescueStrategy: { enabled: true, maxCalls: 1 },
    templated: {
      templates: [
        { name: "focal-lens", orderedSlots: ["focalLength", "lensType"] },
        { name: "aperture-lens", orderedSlots: ["aperture", "lensType"] },
        { name: "descriptor-lens", orderedSlots: ["descriptor", "lensType"] },
      ],
      slots: {
        focalLength: ["24mm", "35mm", "50mm", "85mm"],
        aperture: ["f/1.8", "f/2.0", "f/2.8", "f/4"],
        descriptor: ["fast prime", "telephoto", "wide-angle", "anamorphic"],
        lensType: ["lens", "prime lens"],
      },
      invalidCombinations: [],
      renderRules: {
        joinWith: " ",
        dedupeCaseInsensitive: true,
      },
      dedupeRules: {
        normalizeHyphenation: true,
        trimWhitespace: true,
      },
    },
    scorerWeights: defaultWeights,
  },
  {
    // B3 (2026-05-22): Sub-project D labeled the {tight,shallow} × {focus,
    // rack focus, bokeh} matrix as low-diversity. See 2026-05-22-suggestions-diversity-design.md.
    categoryId: "camera.focus",
    mode: "templated",
    grammar: { kind: "technical_phrase", minWords: 2, maxWords: 5 },
    targetCount: 6,
    minAcceptableCount: 3,
    requiredFamilies: ["camera_focus"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "shot_type"],
    promptGuidance: "Compose a focus or depth-of-field phrase only.",
    rescueStrategy: { enabled: true, maxCalls: 1 },
    templated: {
      // B3 Option A: added named-effect template + lens-style template so
      // 6 picks span more vocabulary than just {descriptor} × {focusTerm}.
      templates: [
        { name: "descriptor-focus", orderedSlots: ["descriptor", "focusTerm"] },
        { name: "descriptor-depth", orderedSlots: ["descriptor", "depthTerm"] },
        { name: "named-effect", orderedSlots: ["namedEffect"] },
        { name: "lens-style", orderedSlots: ["lensStyle", "focusTerm"] },
      ],
      slots: {
        descriptor: [
          "tight",
          "shallow",
          "soft",
          "selective",
          "creamy",
          "razor-thin",
          "feathered",
        ],
        focusTerm: ["focus", "rack focus", "bokeh", "split diopter"],
        depthTerm: ["depth of field", "rear-plane blur", "foreground swim"],
        // New (B3 Option A) — named effects that fill a single slot:
        namedEffect: [
          "tilt-shift miniature",
          "anamorphic bokeh swirl",
          "swirling Petzval bokeh",
          "macro foreground bloom",
          "hyperfocal stack",
        ],
        // New (B3 Option A) — lens-style adjectives paired with focusTerm:
        lensStyle: ["anamorphic", "vintage cine", "Petzval", "tilt-shift"],
      },
      invalidCombinations: [],
      renderRules: {
        joinWith: " ",
        dedupeCaseInsensitive: true,
      },
      dedupeRules: {
        normalizeHyphenation: true,
        trimWhitespace: true,
      },
    },
    scorerWeights: defaultWeights,
  },
  {
    // B3 (2026-05-22): Sub-project D labeled the "soft {source}" pattern as
    // low-diversity. See 2026-05-22-suggestions-diversity-design.md.
    categoryId: "lighting.source",
    mode: "templated",
    grammar: { kind: "technical_phrase", minWords: 2, maxWords: 6 },
    targetCount: 6,
    minAcceptableCount: 3,
    requiredFamilies: ["lighting_source"],
    forbiddenFamilies: ["camera_movement", "camera_lens"],
    promptGuidance:
      "Compose a light-source phrase with natural lighting language.",
    rescueStrategy: { enabled: true, maxCalls: 1 },
    templated: {
      // B3 Option A: added motivated-source + practical templates so picks
      // span more than just quality × source. Sub-project D labeled "soft
      // {source}" repetition; now the picker has motivated-light vocab
      // (key/fill/rim) and practical-light vocab to draw from.
      templates: [
        { name: "quality-source", orderedSlots: ["quality", "source"] },
        { name: "source-direction", orderedSlots: ["source", "direction"] },
        { name: "motivated-source", orderedSlots: ["role", "source"] },
        { name: "practical-light", orderedSlots: ["practicalSource"] },
        { name: "atmospheric", orderedSlots: ["atmosphericSource"] },
      ],
      slots: {
        quality: ["soft", "harsh", "warm", "cool", "diffused", "directional"],
        source: [
          "window light",
          "sunlight",
          "neon glow",
          "candlelight",
          "streetlamp spill",
          "moonlight",
          "firelight",
        ],
        direction: [
          "from the left",
          "from the right",
          "from overhead",
          "from behind",
          "raking across",
        ],
        // New (B3 Option A) — motivated-light role + source pairing:
        role: ["key", "fill", "rim", "back", "side"],
        // New (B3 Option A) — practical (in-scene) light sources:
        practicalSource: [
          "table lamp",
          "TV glow",
          "phone screen",
          "fireplace",
          "fluorescent overhead",
          "string lights",
        ],
        // New (B3 Option A) — atmospheric / motivated by environment:
        atmosphericSource: [
          "shaft of dust-lit sun",
          "haze-diffused dusk light",
          "rain-streak refraction",
          "smoke-filtered sodium vapor",
          "skylight bounce",
        ],
      },
      invalidCombinations: [],
      renderRules: {
        joinWith: " ",
        dedupeCaseInsensitive: true,
      },
      dedupeRules: {
        normalizeHyphenation: true,
        trimWhitespace: true,
      },
    },
    scorerWeights: defaultWeights,
  },
  {
    categoryId: "lighting.quality",
    mode: "templated",
    grammar: { kind: "adjective_phrase", minWords: 1, maxWords: 4 },
    targetCount: 6,
    minAcceptableCount: 3,
    requiredFamilies: ["lighting_quality"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "lighting_direction"],
    promptGuidance:
      "Compose a light-quality phrase, not a direction or camera phrase.",
    rescueStrategy: { enabled: true, maxCalls: 1 },
    templated: {
      templates: [
        { name: "quality-only", orderedSlots: ["quality"] },
        { name: "quality-noun", orderedSlots: ["quality", "lightNoun"] },
      ],
      slots: {
        quality: [
          "soft",
          "hard",
          "diffused",
          "hazy",
          "low-key",
          "high-key",
          "warm",
        ],
        lightNoun: ["light", "glow", "shadows"],
      },
      invalidCombinations: [],
      renderRules: {
        joinWith: " ",
        dedupeCaseInsensitive: true,
      },
      dedupeRules: {
        normalizeHyphenation: true,
        trimWhitespace: true,
      },
    },
    scorerWeights: defaultWeights,
  },
  {
    categoryId: "lighting.colorTemp",
    mode: "templated",
    grammar: { kind: "adjective_phrase", minWords: 1, maxWords: 3 },
    targetCount: 6,
    minAcceptableCount: 3,
    requiredFamilies: ["lighting_quality"],
    forbiddenFamilies: ["camera_movement", "camera_lens"],
    promptGuidance: "Compose a color-temperature phrase only.",
    rescueStrategy: { enabled: true, maxCalls: 1 },
    templated: {
      templates: [{ name: "temperature", orderedSlots: ["temperature"] }],
      slots: {
        temperature: [
          "warm amber",
          "cool cyan",
          "neutral daylight",
          "tungsten warmth",
          "icy blue",
        ],
      },
      invalidCombinations: [],
      renderRules: {
        joinWith: " ",
        dedupeCaseInsensitive: true,
      },
      dedupeRules: {
        normalizeHyphenation: true,
        trimWhitespace: true,
      },
    },
    scorerWeights: defaultWeights,
  },
  {
    categoryId: "style.filmStock",
    mode: "templated",
    grammar: { kind: "technical_phrase", minWords: 1, maxWords: 4 },
    targetCount: 6,
    minAcceptableCount: 3,
    requiredFamilies: ["style_film_stock"],
    forbiddenFamilies: ["camera_movement", "lighting_direction"],
    promptGuidance: "Compose a film stock or capture medium phrase only.",
    rescueStrategy: { enabled: true, maxCalls: 1 },
    templated: {
      templates: [
        { name: "stock-only", orderedSlots: ["stock"] },
        { name: "format-stock", orderedSlots: ["format", "stock"] },
      ],
      slots: {
        format: ["35mm", "16mm", "super 8"],
        stock: [
          "Kodak Portra",
          "Ektachrome",
          "Fuji Velvia",
          "Ilford HP5",
          "digital cinema",
        ],
      },
      invalidCombinations: [],
      renderRules: {
        joinWith: " ",
        dedupeCaseInsensitive: true,
      },
      dedupeRules: {
        normalizeHyphenation: true,
        trimWhitespace: true,
      },
    },
    scorerWeights: defaultWeights,
  },
  {
    categoryId: "style.colorGrade",
    mode: "templated",
    grammar: { kind: "adjective_phrase", minWords: 1, maxWords: 4 },
    targetCount: 6,
    minAcceptableCount: 3,
    requiredFamilies: ["style_color_grade"],
    forbiddenFamilies: ["camera_movement", "lighting_direction"],
    promptGuidance: "Compose a color-grade or tonal-treatment phrase only.",
    rescueStrategy: { enabled: true, maxCalls: 1 },
    templated: {
      templates: [
        { name: "tone-grade", orderedSlots: ["tone"] },
        { name: "tone-treatment", orderedSlots: ["tone", "treatment"] },
      ],
      slots: {
        tone: [
          "desaturated",
          "warm amber",
          "cool steel-blue",
          "muted pastel",
          "high contrast",
        ],
        treatment: ["grade", "treatment"],
      },
      invalidCombinations: [],
      renderRules: {
        joinWith: " ",
        dedupeCaseInsensitive: true,
      },
      dedupeRules: {
        normalizeHyphenation: true,
        trimWhitespace: true,
      },
    },
    scorerWeights: defaultWeights,
  },
  {
    categoryId: "subject",
    mode: "guided_llm",
    grammar: { kind: "freeform", minWords: 1, maxWords: 8 },
    requiredFamilies: ["subject_identity", "subject_appearance"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "lighting_direction"],
    promptGuidance:
      "Suggest literal, camera-visible subject alternatives that stay within the same scene role.",
    ...guidedLlmDefaults,
  },
  {
    categoryId: "subject.identity",
    mode: "guided_llm",
    grammar: { kind: "noun_phrase", minWords: 1, maxWords: 6 },
    requiredFamilies: ["subject_identity"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "lighting_direction"],
    promptGuidance:
      "Suggest literal subject identities, not camera or lighting details.",
    ...guidedLlmDefaults,
  },
  {
    categoryId: "subject.appearance",
    mode: "guided_llm",
    grammar: { kind: "noun_phrase", minWords: 2, maxWords: 8 },
    requiredFamilies: ["subject_appearance"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "lighting_direction"],
    promptGuidance: "Suggest camera-visible physical details only.",
    ...guidedLlmDefaults,
  },
  {
    categoryId: "action",
    mode: "guided_llm",
    grammar: { kind: "verb_phrase", minWords: 1, maxWords: 6 },
    requiredFamilies: ["action"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "lighting_direction"],
    promptGuidance: "Suggest one continuous visible action or pose.",
    ...guidedLlmDefaults,
  },
  {
    categoryId: "action.movement",
    mode: "guided_llm",
    grammar: { kind: "verb_phrase", minWords: 1, maxWords: 6 },
    requiredFamilies: ["action"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "lighting_direction"],
    promptGuidance:
      "Suggest one continuous physical movement without repeating the trailing object.",
    ...guidedLlmDefaults,
  },
  {
    categoryId: "action.gesture",
    mode: "guided_llm",
    grammar: { kind: "verb_phrase", minWords: 1, maxWords: 6 },
    requiredFamilies: ["action"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "lighting_direction"],
    promptGuidance: "Suggest a gesture or micro-action only.",
    ...guidedLlmDefaults,
  },
  {
    categoryId: "action.state",
    mode: "guided_llm",
    grammar: { kind: "verb_phrase", minWords: 1, maxWords: 6 },
    requiredFamilies: ["action"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "lighting_direction"],
    promptGuidance:
      "Suggest a static pose or state that reads clearly on camera.",
    ...guidedLlmDefaults,
  },
  {
    categoryId: "environment",
    mode: "guided_llm",
    grammar: { kind: "freeform", minWords: 1, maxWords: 8 },
    requiredFamilies: ["environment_location", "environment_context"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "lighting_direction"],
    promptGuidance:
      "Suggest location or environmental context details that stay literal and camera-visible.",
    ...guidedLlmDefaults,
  },
  {
    categoryId: "environment.location",
    mode: "guided_llm",
    grammar: { kind: "noun_phrase", minWords: 2, maxWords: 6 },
    requiredFamilies: ["environment_location"],
    forbiddenFamilies: [
      "environment_context",
      "camera_movement",
      "camera_lens",
    ],
    promptGuidance:
      "Suggest external settings, not interior props or surfaces.",
    ...guidedLlmDefaults,
  },
  {
    categoryId: "environment.context",
    mode: "guided_llm",
    grammar: { kind: "noun_phrase", minWords: 2, maxWords: 6 },
    requiredFamilies: ["environment_context"],
    forbiddenFamilies: [
      "environment_location",
      "camera_movement",
      "camera_lens",
    ],
    promptGuidance:
      "Suggest interior surfaces, atmosphere, or in-scene environmental context only.",
    ...guidedLlmDefaults,
  },
  {
    categoryId: "environment.weather",
    mode: "guided_llm",
    grammar: { kind: "freeform", minWords: 2, maxWords: 8 },
    requiredFamilies: ["environment_weather"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "lighting_direction"],
    promptGuidance:
      "Suggest literal weather descriptions that remain plausible for the scene.",
    ...guidedLlmDefaults,
  },
  {
    categoryId: "style",
    mode: "guided_llm",
    grammar: { kind: "freeform", minWords: 1, maxWords: 6 },
    requiredFamilies: ["style_aesthetic"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "lighting_direction"],
    promptGuidance: "Suggest visual treatment only, not camera setup.",
    ...guidedLlmDefaults,
  },
  {
    categoryId: "style.aesthetic",
    mode: "guided_llm",
    grammar: { kind: "freeform", minWords: 1, maxWords: 6 },
    requiredFamilies: ["style_aesthetic"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "lighting_direction"],
    promptGuidance: "Suggest aesthetic treatments, grades, or mediums only.",
    ...guidedLlmDefaults,
  },
  {
    categoryId: "audio",
    mode: "guided_llm",
    grammar: { kind: "freeform", minWords: 1, maxWords: 6 },
    requiredFamilies: ["audio"],
    forbiddenFamilies: ["camera_movement", "camera_lens", "lighting_direction"],
    promptGuidance: "Suggest only sound or score variations.",
    ...guidedLlmDefaults,
  },
];
