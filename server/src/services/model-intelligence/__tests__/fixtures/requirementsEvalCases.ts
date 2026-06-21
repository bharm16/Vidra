import type { PromptRequirements, PromptSpan } from "../../types";

/**
 * Hand-labeled golden set for model-intelligence requirements extraction.
 *
 * Each case carries GROUND TRUTH — what a human says the requirement flags
 * should be for the prompt, independent of how they are derived. The live eval
 * (scripts/evaluation/requirements-extraction-eval.ts, `npm run eval:requirements`)
 * scores the LLM perception classifier against this truth. The `regexBlindSpot`
 * flags mark cases the former keyword-regex implementation structurally missed
 * (negation, out-of-vocabulary synonyms, inflected forms); the classifier
 * closes them — see ADR-0006.
 *
 * Spans use real taxonomy role ids (see shared/taxonomy.ts): subject.identity,
 * subject.emotion, action.movement, environment.location, environment.weather,
 * environment.context, lighting.source, etc.
 */

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface RequirementsEvalCase {
  id: string;
  prompt: string;
  spans: PromptSpan[];
  /** Sparse ground truth — only the flags this case is designed to probe. */
  expected: DeepPartial<PromptRequirements>;
  /**
   * True when the current keyword-regex approach is structurally expected to
   * mis-handle this case: negation it can't see, a synonym outside its word
   * list, or an inflected form (plural/conjugation) that misses the singular
   * lemma the keyword lists match. Recorded for reporting only — the eval
   * discovers actual mismatches by running, it does not trust this flag.
   */
  regexBlindSpot?: boolean;
  note?: string;
}

export const REQUIREMENTS_EVAL_CASES: RequirementsEvalCase[] = [
  // ---- physics -----------------------------------------------------------
  {
    id: "physics/river-flood",
    prompt: "A raging river bursts its banks and floods the village.",
    spans: [
      { text: "raging river", role: "environment.location" },
      { text: "floods", role: "action.movement" },
    ],
    expected: { physics: { hasFluidDynamics: true, hasComplexPhysics: true } },
  },
  {
    id: "physics/fire-wall",
    prompt: "A wall of fire engulfs the old building.",
    spans: [{ text: "wall of fire", role: "environment.context" }],
    expected: { physics: { hasComplexPhysics: true } },
  },
  {
    id: "physics/snowfall-particles",
    prompt: "Snow drifts gently over a quiet field.",
    spans: [{ text: "snow", role: "environment.weather" }],
    expected: { physics: { hasParticleSystems: true } },
  },
  {
    id: "physics/negated-water",
    prompt: "A bone-dry desert with not a drop of water for miles.",
    spans: [{ text: "bone-dry desert", role: "environment.location" }],
    expected: { physics: { hasFluidDynamics: false } },
    regexBlindSpot: true,
    note: "Negation: the word 'water' appears but is explicitly absent.",
  },
  {
    id: "physics/deep-sea-synonym",
    prompt: "A diver explores a sunken wreck in the deep sea.",
    spans: [
      { text: "diver", role: "subject.identity" },
      { text: "deep sea", role: "environment.location" },
    ],
    expected: { physics: { hasFluidDynamics: true } },
    regexBlindSpot: true,
    note: "Synonym: 'sea' is water but is outside the keyword list.",
  },
  {
    id: "physics/inflected-flames",
    prompt: "Towering flames consume the dry forest.",
    spans: [{ text: "towering flames", role: "environment.context" }],
    expected: { physics: { hasComplexPhysics: true } },
    regexBlindSpot: true,
    note: "Morphology: 'flames' (plural) misses the singular \\bflame\\b keyword.",
  },

  // ---- character ---------------------------------------------------------
  {
    id: "character/woman-face",
    prompt: "A close-up of a woman's face fills the frame.",
    spans: [{ text: "woman", role: "subject.identity" }],
    expected: {
      character: { hasHumanCharacter: true, requiresFacialPerformance: true },
    },
  },
  {
    id: "character/horse",
    prompt: "A horse gallops across the open plain.",
    spans: [
      { text: "horse", role: "subject.identity" },
      { text: "gallops", role: "action.movement" },
    ],
    expected: { character: { hasAnimalCharacter: true } },
  },
  {
    id: "character/mech",
    prompt: "A towering mech stomps through the ruined city.",
    spans: [{ text: "mech", role: "subject.identity" }],
    expected: { character: { hasMechanicalCharacter: true } },
  },
  {
    id: "character/talk-lipsync",
    prompt: "Two friends talk quietly over coffee.",
    spans: [{ text: "friends", role: "subject.identity" }],
    expected: { character: { requiresLipSync: true } },
  },
  {
    id: "character/vocalist-synonym",
    prompt: "A vocalist mouths the lyrics into a vintage microphone.",
    spans: [{ text: "vocalist", role: "subject.identity" }],
    expected: { character: { requiresLipSync: true } },
    regexBlindSpot: true,
    note: "Synonym: lip-sync intent without the words speak/talk/sing.",
  },
  {
    id: "character/negated-people",
    prompt: "An empty waiting room with no people in sight.",
    spans: [{ text: "empty waiting room", role: "environment.location" }],
    expected: { character: { hasHumanCharacter: false } },
    regexBlindSpot: true,
    note: "Negation: 'people' appears but is explicitly absent.",
  },

  // ---- environment -------------------------------------------------------
  {
    id: "environment/kitchen-interior",
    prompt: "A cozy kitchen bathed in soft morning light.",
    spans: [{ text: "kitchen", role: "environment.location" }],
    expected: { environment: { type: "interior" } },
  },
  {
    id: "environment/forest-nature",
    prompt: "A vast forest stretches beneath a clear mountain sky.",
    spans: [
      { text: "forest", role: "environment.location" },
      { text: "mountain", role: "environment.location" },
    ],
    expected: { environment: { hasNature: true, type: "exterior" } },
  },
  {
    id: "environment/neon-urban",
    prompt: "Neon signs glow over a busy city street at night.",
    spans: [{ text: "city street", role: "environment.location" }],
    expected: { environment: { hasUrbanElements: true } },
  },

  // ---- lighting ----------------------------------------------------------
  {
    id: "lighting/dramatic-rim",
    prompt: "Harsh rim light carves a silhouette against the dark.",
    spans: [{ text: "rim light", role: "lighting.source" }],
    expected: { lighting: { requirements: "dramatic" } },
  },
  {
    id: "lighting/atmospherics-fog",
    prompt: "Thick fog rolls through the volumetric beams of light.",
    spans: [{ text: "fog", role: "environment.weather" }],
    expected: { lighting: { requiresAtmospherics: true } },
  },

  // ---- style -------------------------------------------------------------
  {
    id: "style/anime",
    prompt: "An anime girl with big, expressive eyes.",
    spans: [{ text: "anime girl", role: "subject.identity" }],
    expected: { style: { isStylized: true, hasSpecificAesthetic: "anime" } },
  },
  {
    id: "style/photoreal",
    prompt: "A photorealistic portrait of an old fisherman.",
    spans: [{ text: "old fisherman", role: "subject.identity" }],
    expected: { style: { isPhotorealistic: true, isStylized: false } },
  },
  {
    id: "style/cinematic",
    prompt: "A cinematic widescreen shot of the city skyline.",
    spans: [{ text: "city skyline", role: "environment.location" }],
    expected: { style: { requiresCinematicLook: true } },
  },
  {
    id: "style/painterly-synonym",
    prompt: "A hand-drawn, painterly watercolor scene of a harbour.",
    spans: [{ text: "harbour", role: "environment.location" }],
    expected: { style: { isStylized: true } },
    regexBlindSpot: true,
    note: "Synonym: clearly non-photoreal art outside the stylized word list.",
  },

  // ---- motion ------------------------------------------------------------
  {
    id: "motion/tracking-shot",
    prompt: "A smooth tracking shot follows the dancer.",
    spans: [{ text: "dancer", role: "subject.identity" }],
    expected: { motion: { cameraComplexity: "complex" } },
  },
  {
    id: "motion/morph",
    prompt: "The hero begins to morph into a wolf.",
    spans: [{ text: "hero", role: "subject.identity" }],
    expected: { motion: { hasMorphing: true, hasTransitions: true } },
  },
];
