import { describe, expect, it, vi } from "vitest";
import {
  CapabilityProfileSchema,
  type ParameterValue,
} from "@shared/schemas/workflow/capability.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { validateProfileParameters } from "@shared/workflow/capabilityEvaluation";
import { REPLICATE_MODEL_DEFINITIONS, replicateModelFor } from "..";
import type { ModelCall, ReplicateModelDefinition } from "../types";

const tools = {
  blackEditMask: vi.fn(
    async (): Promise<string> => "data:image/png;base64,TUFTSw==",
  ),
};

function definition(id: string): ReplicateModelDefinition {
  const found = REPLICATE_MODEL_DEFINITIONS.find(
    (candidate) => candidate.profile.id === id,
  );
  if (!found) throw new Error(`Missing definition ${id}`);
  return found;
}

function defaults(
  model: ReplicateModelDefinition,
): Record<string, ParameterValue> {
  return Object.fromEntries(
    Object.entries(model.profile.parameters).flatMap(([name, policy]) =>
      policy.policy === "editable"
        ? [[name, policy.defaultValue]]
        : policy.policy === "fixed"
          ? [[name, policy.value]]
          : [],
    ),
  );
}

function call(
  model: ReplicateModelDefinition,
  overrides: Partial<Omit<ModelCall, "parameters">> & {
    parameters?: Record<string, ParameterValue>;
  } = {},
): ModelCall {
  return {
    instructions: "A red boat at dawn",
    sentInstructions: "Project instructions:\nWarm light\n\nA red boat at dawn",
    inputs: {},
    ...overrides,
    parameters: { ...defaults(model), ...overrides.parameters },
  };
}

function clip(
  contentType: string,
  durationSeconds = 6,
): ReturnType<typeof MediaVersionSchema.parse> {
  return MediaVersionSchema.parse({
    schemaVersion: "vidra-workflow/v2",
    id: "version_clip",
    ownerId: "creator",
    projectId: "project_models",
    kind: "video",
    label: "Clip",
    origin: { kind: "upload" },
    sourceInputs: [],
    object: {
      identity: "verified",
      assetId: "asset_clip",
      storagePath: "users/creator/clip",
      generation: "1",
      sha256: "a".repeat(64),
      bytes: 1000,
    },
    metadata: {
      state: "verified",
      contentType,
      width: 1280,
      height: 720,
      durationSeconds,
      audio: "present",
      probeVersion: "ffprobe-v1",
    },
    association: "linked",
    createdAt: "2026-10-19T00:00:00.000Z",
  });
}

describe("native Replicate model definitions", () => {
  it("each offers a valid, uniquely named Replicate profile whose call ends before its recovery deadline", () => {
    const ids = REPLICATE_MODEL_DEFINITIONS.map((model) => model.profile.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const model of REPLICATE_MODEL_DEFINITIONS) {
      expect(() =>
        CapabilityProfileSchema.parse({
          ...model.profile,
          availability: "qualified",
        }),
      ).not.toThrow();
      expect(model.profile.provider).toBe("replicate");
      expect(model.profile.endpoint).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
      expect(model.timeoutMs).toBeLessThan(
        model.profile.recovery.deadlineSeconds * 1000,
      );
      expect(model.profile.output.kind === "text").toBe(Boolean(model.text));
    }
  });

  it("only resolves a definition while the profile still names the same model", () => {
    expect(
      replicateModelFor({ id: "wan-3-t2v", endpoint: "alibaba/wan-3" })?.profile
        .id,
    ).toBe("wan-3-t2v");
    expect(
      replicateModelFor({ id: "wan-3-t2v", endpoint: "alibaba/wan-3-prime" }),
    ).toBeUndefined();
  });

  it("maps Wan 3 text and first-frame requests with every setting, and bounds 1080p length", async () => {
    const text = definition("wan-3-t2v");
    expect(await text.input(call(text, { seed: 7 }), tools)).toEqual({
      prompt: "Project instructions:\nWarm light\n\nA red boat at dawn",
      resolution: "720p",
      duration: 5,
      enable_prompt_expansion: true,
      aspect_ratio: "16:9",
      negative_prompt: expect.stringContaining("watermark"),
      seed: 7,
    });
    const image = definition("wan-3-i2v");
    const animated = await image.input(
      call(image, {
        inputs: { "start-frame": [{ url: "https://media.test/frame" }] },
        parameters: { negativePrompt: "" },
      }),
      tools,
    );
    expect(animated).toMatchObject({
      image: "https://media.test/frame",
      duration: 5,
    });
    expect(animated).not.toHaveProperty("aspect_ratio");
    expect(animated).not.toHaveProperty("negative_prompt");
    const long1080 = validateProfileParameters(
      { ...text.profile, availability: "qualified" },
      {
        profileId: text.profile.id,
        profileRevision: text.profile.revision,
        parameters: {
          ...defaults(text),
          resolution: "1080p",
          durationSeconds: 30,
        },
        outputCount: 1,
      },
      [],
      [],
    );
    expect(long1080.reasons).toEqual([
      expect.objectContaining({
        code: "settings_invalid",
        field: "durationSeconds",
      }),
    ]);
  });

  it("maps Gemini Omni references, keyframes and clip edits to their exact inputs", async () => {
    const text = definition("gemini-omni-1.1-t2v");
    expect(
      await text.input(
        call(text, {
          inputs: {
            reference: [
              { url: "https://media.test/a" },
              { url: "https://media.test/b" },
            ],
          },
        }),
        tools,
      ),
    ).toEqual({
      prompt: expect.any(String),
      aspect_ratio: "16:9",
      resolution: "720p",
      reference_images: ["https://media.test/a", "https://media.test/b"],
    });
    expect(await text.input(call(text), tools)).not.toHaveProperty(
      "reference_images",
    );
    const image = definition("gemini-omni-1.1-i2v");
    expect(
      await image.input(
        call(image, {
          inputs: {
            "start-frame": [{ url: "https://media.test/start" }],
            "end-frame": [{ url: "https://media.test/end" }],
          },
          parameters: { resolution: "4k" },
        }),
        tools,
      ),
    ).toMatchObject({
      image: "https://media.test/start",
      last_frame: "https://media.test/end",
      resolution: "4k",
    });
    const edit = definition("gemini-omni-1.1-edit");
    expect(
      await edit.input(
        call(edit, { inputs: { clip: [{ url: "https://media.test/clip" }] } }),
        tools,
      ),
    ).toEqual({
      prompt: expect.any(String),
      video: "https://media.test/clip",
      resolution: "720p",
    });
  });

  it("extends only MP4 clips with Grok and maps upscale and reframe settings", async () => {
    const grok = definition("grok-imagine-video-extension");
    expect(
      grok.preflight?.(
        call(grok, {
          inputs: {
            clip: [
              { url: "https://media.test/clip", version: clip("video/webm") },
            ],
          },
        }),
      ),
    ).toMatch(/MP4/);
    expect(
      grok.preflight?.(
        call(grok, {
          inputs: {
            clip: [
              { url: "https://media.test/clip", version: clip("video/mp4") },
            ],
          },
        }),
      ),
    ).toBeUndefined();
    expect(
      await grok.input(
        call(grok, { inputs: { clip: [{ url: "https://media.test/clip" }] } }),
        tools,
      ),
    ).toEqual({
      prompt: expect.any(String),
      video: "https://media.test/clip",
      duration: 6,
    });
    const topaz = definition("topaz-video-upscale");
    expect(
      await topaz.input(
        call(topaz, {
          inputs: { clip: [{ url: "https://media.test/clip" }] },
          parameters: { resolution: "4k", framesPerSecond: 60 },
        }),
        tools,
      ),
    ).toEqual({
      video: "https://media.test/clip",
      target_resolution: "4k",
      target_fps: 60,
    });
    const luma = definition("luma-reframe-video");
    expect(
      await luma.input(
        call(luma, {
          instructions: "  ",
          inputs: { clip: [{ url: "https://media.test/clip" }] },
        }),
        tools,
      ),
    ).toEqual({ video: "https://media.test/clip", aspect_ratio: "9:16" });
    expect(
      await luma.input(
        call(luma, {
          instructions: "Extend the sky",
          inputs: { clip: [{ url: "https://media.test/clip" }] },
          parameters: { cropXStart: 0, cropXEnd: 720, gridPositionY: 40 },
        }),
        tools,
      ),
    ).toEqual({
      video: "https://media.test/clip",
      aspect_ratio: "9:16",
      prompt: "Extend the sky",
      x_start: 0,
      x_end: 720,
      grid_position_y: 40,
    });
  });

  it("maps picture models with the edited picture first and refuses impossible requests before spend", async () => {
    const nanoEdit = definition("nano-banana-2.1-edit");
    expect(
      await nanoEdit.input(
        call(nanoEdit, {
          inputs: {
            primary: [{ url: "https://media.test/source" }],
            reference: [{ url: "https://media.test/ref" }],
          },
          parameters: { googleSearch: true, resolution: "4K" },
        }),
        tools,
      ),
    ).toEqual({
      prompt: expect.any(String),
      aspect_ratio: "match_input_image",
      resolution: "4K",
      google_search: true,
      image_search: false,
      output_format: "jpg",
      image_input: ["https://media.test/source", "https://media.test/ref"],
    });
    const nanoMake = definition("nano-banana-2.1");
    expect(
      nanoMake.preflight?.(
        call(nanoMake, { parameters: { aspectRatio: "match_input_image" } }),
      ),
    ).toMatch(/picture/);
    const gptEdit = definition("gpt-image-2.5-sunburst-edit");
    expect(
      await gptEdit.input(
        call(gptEdit, {
          inputs: { primary: [{ url: "https://media.test/source" }] },
        }),
        tools,
      ),
    ).toEqual({
      prompt: expect.any(String),
      aspect_ratio: "auto",
      number_of_images: 1,
      quality: "high",
      background: "auto",
      output_compression: 90,
      output_format: "webp",
      moderation: "auto",
      input_images: ["https://media.test/source"],
    });
    const transparentJpeg = validateProfileParameters(
      { ...gptEdit.profile, availability: "qualified" },
      {
        profileId: gptEdit.profile.id,
        profileRevision: gptEdit.profile.revision,
        parameters: {
          ...defaults(gptEdit),
          background: "transparent",
          outputFormat: "jpeg",
        },
        outputCount: 1,
      },
      [],
      [],
    );
    expect(transparentJpeg.reasons).toEqual([
      expect.objectContaining({ field: "outputFormat" }),
    ]);
  });

  it("converts an area mask for Ideogram and limits references alongside it", async () => {
    const ideogram = definition("ideogram-4.5-precise-edit");
    const masked = call(ideogram, {
      seed: 11,
      inputs: {
        primary: [{ url: "https://media.test/source" }],
        mask: [{ url: "https://media.test/mask" }],
        reference: [{ url: "https://media.test/r1" }],
      },
    });
    expect(await ideogram.input(masked, tools)).toEqual({
      prompt: expect.any(String),
      image: "https://media.test/source",
      quality: "medium",
      num_images: 1,
      mask: "data:image/png;base64,TUFTSw==",
      reference_images: ["https://media.test/r1"],
      seed: 11,
    });
    expect(tools.blackEditMask).toHaveBeenCalledWith("https://media.test/mask");
    const references = Array.from({ length: 4 }, (_, index) => ({
      url: `https://media.test/r${index}`,
    }));
    expect(
      ideogram.preflight?.({
        ...masked,
        inputs: { ...masked.inputs, reference: references },
      }),
    ).toMatch(/up to 3/);
    expect(
      ideogram.preflight?.({
        ...masked,
        inputs: { primary: masked.inputs.primary ?? [], reference: references },
      }),
    ).toBeUndefined();
  });

  it("refuses Topaz upscales beyond Vidra's picture limit before any spend", async () => {
    const topaz = definition("topaz-image-upscale");
    expect(
      topaz.preflight?.(
        call(topaz, {
          parameters: { sourceSize: "4000:3000", upscaleFactor: "4x" },
        }),
      ),
    ).toMatch(/40 megapixels/);
    expect(
      topaz.preflight?.(
        call(topaz, {
          parameters: { sourceSize: "1024:1024", upscaleFactor: "6x" },
        }),
      ),
    ).toBeUndefined();
    expect(topaz.preflight?.(call(topaz))).toMatch(/size must be checked/);
    expect(
      await topaz.input(
        call(topaz, {
          inputs: { primary: [{ url: "https://media.test/source" }] },
          parameters: { faceEnhancement: true },
        }),
        tools,
      ),
    ).toEqual({
      image: "https://media.test/source",
      enhance_model: "Standard V2",
      upscale_factor: "2x",
      subject_detection: "None",
      face_enhancement: true,
      face_enhancement_creativity: 0,
      face_enhancement_strength: 0.8,
      output_format: "jpg",
    });
  });

  it("speaks the exact script, makes music from words and pictures, and transcribes to captions", async () => {
    const voice = definition("elevenlabs-v3");
    expect(
      await voice.input(
        call(voice, { instructions: "  [whispers] Welcome back.  " }),
        tools,
      ),
    ).toEqual({
      prompt: "[whispers] Welcome back.",
      voice: "Rachel",
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      speed: 1,
      language_code: "en",
    });
    expect(
      voice.preflight?.(call(voice, { instructions: "a".repeat(3001) })),
    ).toMatch(/3,000/);
    const music = definition("lyria-3");
    expect(
      await music.input(
        call(music, {
          seed: 3,
          inputs: { reference: [{ url: "https://media.test/mood" }] },
        }),
        tools,
      ),
    ).toEqual({
      prompt: expect.any(String),
      images: ["https://media.test/mood"],
      seed: 3,
    });
    const scribe = definition("elevenlabs-scribe-v2");
    expect(
      await scribe.input(
        call(scribe, {
          inputs: { primary: [{ url: "https://media.test/clip" }] },
          parameters: { diarize: true, keyterms: "Vidra, Wan" },
        }),
        tools,
      ),
    ).toEqual({
      audio: "https://media.test/clip",
      language_code: "auto",
      diarize: true,
      num_speakers: 0,
      timestamps_granularity: "word",
      tag_audio_events: true,
      no_verbatim: false,
      keyterms: "Vidra, Wan",
    });
    const captions = scribe.text?.(
      {
        text: "Hi.",
        language_code: "en",
        language_probability: 0.99,
        words: [{ text: "Hi.", type: "word", start: 0.1, end: 0.5 }],
      },
      call(scribe),
    );
    expect(captions).toMatch(/^WEBVTT/);
  });
});
