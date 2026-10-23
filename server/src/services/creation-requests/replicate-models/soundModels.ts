import {
  HIDDEN_SEED,
  SEED,
  choice,
  flag,
  nativeProfile,
  number,
  range,
  requiredUrl,
  shown,
  text,
  toggle,
  urls,
  withOptional,
  words,
} from "./profileParts";
import { TimestampGranularitySchema, formatTranscript } from "./transcript";
import type { ReplicateModelDefinition } from "./types";

const MINUTE = 60_000;

/** Eleven v3 accepts up to 3,000 characters per request; it also bounds the spend ceiling. */
export const VOICEOVER_SCRIPT_LIMIT = 3000;
/** Surrounding text only steers delivery; 1,000 characters each keeps the ceiling modest. */
export const VOICEOVER_CONTEXT_LIMIT = 1000;

const ELEVEN_VOICES = [
  "Rachel",
  "Drew",
  "Clyde",
  "Paul",
  "Aria",
  "Domi",
  "Dave",
  "Roger",
  "Fin",
  "Sarah",
  "James",
  "Jane",
  "Juniper",
  "Arabella",
  "Hope",
  "Bradford",
  "Reginald",
  "Gaming",
  "Austin",
  "Kuon",
  "Blondie",
  "Priyanka",
  "Alexandra",
  "Monika",
  "Mark",
  "Grimblewood",
] as const;

/**
 * Eleven v3 — elevenlabs/v3. Speaks the creator's exact script (audio tags
 * such as [whispers] and multi-speaker dialogue are written in the script)
 * in 26 voices and 70+ languages, with stability, similarity, style, speed
 * and surrounding-text continuity.
 */
const elevenV3: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "elevenlabs-v3",
    label: "ElevenLabs v3",
    action: "make-voiceover",
    endpoint: "elevenlabs/v3",
    mode: "text-to-speech",
    inputs: [],
    output: { kind: "audio", maxCount: 4 },
    parameters: {
      voice: choice(ELEVEN_VOICES, "Rachel"),
      stability: range(0, 1, 0.01, 0.5),
      similarityBoost: range(0, 1, 0.01, 0.75),
      style: range(0, 1, 0.01, 0),
      speed: range(0.7, 1.2, 0.01, 1),
      languageCode: words(16, "en"),
      previousText: words(VOICEOVER_CONTEXT_LIMIT),
      nextText: words(VOICEOVER_CONTEXT_LIMIT),
    },
    presentation: {
      words: "script",
      parameters: {
        voice: shown("Voice", { role: "voice" }),
        stability: shown("Stability", { format: "fraction" }),
        similarityBoost: shown("Similarity", { format: "fraction" }),
        style: shown("Style", { format: "fraction" }),
        speed: shown("Speed", { format: "times" }),
        languageCode: shown("Language", { format: "language" }),
        previousText: shown("Text before", { placeholder: "Words spoken just before this script" }),
        nextText: shown("Text after", { placeholder: "Words spoken just after it" }),
      },
    },
    generatedAudio: "always",
    deadlineSeconds: 600,
  }),
  timeoutMs: 8 * MINUTE,
  pollIntervalMs: 1000,
  preflight: (call) =>
    call.instructions.trim().length > VOICEOVER_SCRIPT_LIMIT
      ? "Voiceover scripts can be up to 3,000 characters. Split the script into parts."
      : undefined,
  input: (call) =>
    withOptional(
      {
        prompt: call.instructions.trim(),
        voice: text(call, "voice"),
        stability: number(call, "stability"),
        similarity_boost: number(call, "similarityBoost"),
        style: number(call, "style"),
        speed: number(call, "speed"),
      },
      {
        language_code: text(call, "languageCode").trim(),
        previous_text: text(call, "previousText"),
        next_text: text(call, "nextText"),
      },
    ),
};

/**
 * Lyria 3 — google/lyria-3. A 30-second 48 kHz stereo MP3 from words (genre,
 * instruments, BPM, key, mood, vocals or instrumental, lyrics and structure
 * tags) and up to 10 inspiration pictures, with a seed.
 */
const lyria3: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "lyria-3",
    label: "Lyria 3",
    action: "make-music",
    endpoint: "google/lyria-3",
    mode: "text-to-music",
    inputs: [
      { role: "reference", kinds: ["image"], minCount: 0, maxCount: 10 },
    ],
    output: { kind: "audio", maxCount: 4 },
    // Every take is 30 seconds; declaring it lets the Duration chip show it.
    parameters: { durationSeconds: { policy: "fixed", value: 30 }, seed: SEED },
    presentation: { words: "required", parameters: { durationSeconds: shown("Duration", { role: "duration", format: "seconds" }), seed: HIDDEN_SEED } },
    generatedAudio: "always",
    deadlineSeconds: 600,
  }),
  timeoutMs: 8 * MINUTE,
  pollIntervalMs: 2000,
  input: (call) =>
    withOptional(
      { prompt: call.sentInstructions },
      { images: urls(call, "reference"), seed: call.seed },
    ),
};

/**
 * Scribe v2 — elevenlabs/scribe-v2. Transcribes a clip's or audio file's
 * speech in 90+ languages (or detects it), with speaker identification for
 * up to 32 speakers, word or character timing, sound-event tags, cleaned-up
 * wording, key-term biasing, temperature and seed. The result is WebVTT
 * captions; 15 minutes keeps the captions inside the stored text limit.
 */
const scribeV2: ReplicateModelDefinition = {
  profile: nativeProfile({
    id: "elevenlabs-scribe-v2",
    label: "ElevenLabs Scribe v2",
    action: "transcribe",
    endpoint: "elevenlabs/scribe-v2",
    mode: "speech-to-text",
    inputs: [
      {
        role: "primary",
        kinds: ["video", "audio"],
        minCount: 1,
        maxCount: 1,
        maxDurationSeconds: 900,
      },
    ],
    output: { kind: "text", maxCount: 1 },
    parameters: {
      languageCode: words(16, "auto"),
      diarize: toggle(false),
      numSpeakers: range(0, 32, 1, 0),
      timestampsGranularity: choice(["word", "character", "none"], "word"),
      tagAudioEvents: toggle(true),
      noVerbatim: toggle(false),
      keyterms: words(4000),
      temperature: range(-1, 2, 0.01, -1),
      seed: SEED,
    },
    presentation: {
      words: "none",
      parameters: {
        languageCode: shown("Language", { role: "language", format: "language", values: { auto: "Auto-detect" } }),
        diarize: shown("Label speakers"),
        numSpeakers: shown("Speakers", { auto: 0 }),
        timestampsGranularity: shown("Timing", { values: { word: "By word", character: "By character", none: "None" } }),
        tagAudioEvents: shown("Tag sounds"),
        noVerbatim: shown("Remove filler words"),
        keyterms: shown("Key terms", { placeholder: "Names and words to spell exactly" }),
        temperature: shown("Temperature", { auto: -1 }),
        seed: HIDDEN_SEED,
      },
    },
    generatedAudio: "unsupported",
    deadlineSeconds: 1200,
  }),
  timeoutMs: 18 * MINUTE,
  pollIntervalMs: 2000,
  input: (call) =>
    withOptional(
      {
        audio: requiredUrl(call, "primary"),
        language_code: text(call, "languageCode").trim() || "auto",
        diarize: flag(call, "diarize"),
        num_speakers: number(call, "numSpeakers"),
        timestamps_granularity: text(call, "timestampsGranularity"),
        tag_audio_events: flag(call, "tagAudioEvents"),
        no_verbatim: flag(call, "noVerbatim"),
      },
      {
        keyterms: text(call, "keyterms").trim(),
        temperature: number(call, "temperature"),
        seed: call.seed,
      },
    ),
  text: (output, call) =>
    formatTranscript(
      output,
      TimestampGranularitySchema.parse(call.parameters.timestampsGranularity),
    ),
};

export const SOUND_MODEL_DEFINITIONS: readonly ReplicateModelDefinition[] = [
  elevenV3,
  lyria3,
  scribeV2,
];
