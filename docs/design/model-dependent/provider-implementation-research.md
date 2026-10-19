# Provider implementation research

Reviewed 2026-10-10. This is documentation and source evidence for the redesign, not live provider qualification. No credentials were read, generation was started, packages were installed or provider spend was incurred. [Capability authority](capability-contract.md) still requires implemented mappings, tests and release policy before enabling a control.

## Evidence and endpoint identity

Replicate's rendered schema text omits its fields. The public HTML contains JSON script properties at `version._extras.dereferenced_openapi_schema.components.schemas.Input` and `Output`. These were extracted directly from each first-party schema page. The inspected deployment versions are:

| Operation                                                                                     | Schema version                                                     | Version timestamp           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------- |
| [Wan 2.2 text to video](https://replicate.com/wan-video/wan-2.2-t2v-fast/api/schema)          | `9f0a607c444c14a25ca46cb94f01d83566e40a7c68ee0d313cb8b8b5e5cf2c09` | 2026-09-17T11:09:39.261640Z |
| [Wan 2.5 image to video](https://replicate.com/wan-video/wan-2.5-i2v/api/schema)              | `17d990034120b74845dc0affafa81a7e70c1ab95ee7448aaf12fbc7b6bb925e2` | 2025-12-04T16:50:02.804917Z |
| [Flux Schnell text to image](https://replicate.com/black-forest-labs/flux-schnell/api/schema) | `d9fbf23e0a34bb6134f86d3e24f48c0dd96332378da307b5e9b60a9d47e4a9c2` | 2025-06-25T20:01:49.723220Z |
| [Flux Kontext Fast image edit](https://replicate.com/prunaai/flux-kontext-fast/api/schema)    | `e0869266e4964dc7e0c544eff7a95ac4b51fb98e9bf64eed6b4edfb6f651df50` | 2026-09-23T07:17:18.222506Z |

These are the schemas observed behind versionless model names; current adapters do not pin those hashes. A profile must bind its exact endpoint and schema revision and detect drift. An environment override is a different, unresolved profile until inspected. The active image edit adapter is **`prunaai/flux-kontext-fast`**, not the similarly named Black Forest Labs Kontext endpoint. [Video configuration](../../../server/src/config/modelConfig.ts), [image adapters](../../../server/src/services/image-generation/providers/ReplicateFluxKontextFastProvider.ts).

Google evidence uses the [Gemini Veo guide](https://ai.google.dev/gemini-api/docs/veo?hl=en), public [v1beta discovery document](https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta) and Google's JS SDK at commit [`2cdb3b219eefced7fba83fa76474eea58d836d70`](https://github.com/googleapis/js-genai/tree/2cdb3b219eefced7fba83fa76474eea58d836d70). Vidra directly targets `veo-3.1-generate-preview:predictLongRunning`; generic `google/veo-3` is an application alias. [Adapter](../../../server/src/services/video-generation/providers/veoProvider.ts).

## Wan payloads

| Field                | `wan-video/wan-2.2-t2v-fast`                                                                                                                                          | `wan-video/wan-2.5-i2v`                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Required             | `prompt`: string                                                                                                                                                      | `prompt`: string; `image`: URI                                                              |
| Shape                | `aspect_ratio`: `16:9` / `9:16`; default `16:9`                                                                                                                       | No aspect field; derive display geometry from the admitted image and verify delivered media |
| Resolution           | `resolution`: `480p` / `720p`; default `480p`                                                                                                                         | `resolution`: `480p` / `720p` / `1080p`; default `720p`                                     |
| Length               | `num_frames`: integer 81–121; default 81                                                                                                                              | `duration`: integer 5 / 10; default 5                                                       |
| Generation rate      | `frames_per_second`: integer 5–30; default 16                                                                                                                         | No FPS parameter                                                                            |
| Output interpolation | `interpolate_output`: boolean; default `true` (30 FPS)                                                                                                                | No interpolation parameter                                                                  |
| Prompt processing    | `optimize_prompt`: boolean; default `false`                                                                                                                           | `enable_prompt_expansion`: boolean; default `true`                                          |
| Negative prompt      | No field                                                                                                                                                              | `negative_prompt`: string; default empty                                                    |
| Seed                 | Optional nullable integer; no default seed                                                                                                                            | Optional nullable integer; no default seed                                                  |
| Audio reference      | No field                                                                                                                                                              | Optional nullable `audio`: URI; WAV/MP3, 3–30 seconds, ≤15 MB                               |
| Other fields         | `go_fast`: default `true`; `sample_shift`: number 1–20, default 12; safety checker disabled default `false`; two optional transformer LoRA URLs with scale defaults 1 | No corresponding fields                                                                     |
| Output               | URI string                                                                                                                                                            | URI string                                                                                  |

The tables paraphrase the exact embedded [Wan 2.2 schema](https://replicate.com/wan-video/wan-2.2-t2v-fast/api/schema) and [Wan 2.5 schema](https://replicate.com/wan-video/wan-2.5-i2v/api/schema). The unoffered LoRA fields are `lora_weights_transformer`, `lora_weights_transformer_2` (nullable strings) and `lora_scale_transformer`, `lora_scale_transformer_2` (numbers, default 1, no bounds supplied). Wan 2.2 has no `size`, `prompt_extend`, `negative_prompt`, `image`, `style_reference` or sound toggle. Frame count and generation rate describe intended length; actual duration and delivered FPS require probing. The schema's pricing description uses duration at 16 FPS, so changing generation FPS alone must not be treated as a proven cost reduction.

Wan 2.5 advertises generated sound or synchronization with supplied audio, but offers no disable-sound flag. Absence of `audio` means no supplied reference; it does not request silence. The provider's [README](https://replicate.com/wan-video/wan-2.5-i2v/readme) supports that distinction. Delivered stream presence remains a media fact. The schema does not establish exact image geometry rules or whether MB uses decimal bytes; retain those qualification questions.

Recommended explicit payloads, with optional seed/audio added only when accepted by the resolved profile:

```json
{
  "prompt": "captured words",
  "resolution": "480p",
  "aspect_ratio": "16:9",
  "num_frames": 81,
  "frames_per_second": 16,
  "interpolate_output": true,
  "optimize_prompt": false,
  "go_fast": true,
  "sample_shift": 12,
  "disable_safety_checker": false
}
```

```json
{
  "prompt": "captured words",
  "image": "https://owned-input.example/image.png",
  "duration": 5,
  "resolution": "720p",
  "negative_prompt": "",
  "enable_prompt_expansion": true
}
```

Current [Wan input construction](../../../server/src/services/video-generation/providers/replicateProvider.ts) sends stale keys on 2.2 and loses its requested shape/resolution. It can also switch a selected text-to-video endpoint to image-to-video when an image is present, or replace image-to-video with Wan 2.2 when an image is absent. Resolve and capture the operation **before acceptance**; missing/unsupported input must reject, not change endpoints after dispatch. Wan 2.5 has no audio option in [VideoGenerationOptions](../../../server/src/services/video-generation/providers/types.ts); it also accepts arbitrary positive durations/resolutions and replaces the provider's empty negative-prompt default with an application string. Validate 5/10, resolution and file constraints explicitly. [Manual capabilities](../../../server/src/services/capabilities/manualRegistry.ts) incorrectly include Wan 2.5's 8-second option and generic aspect/FPS/audio assumptions.

## Gemini Veo modes and serialization

| Mode                     | Inputs and coupled constraints                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text to video            | `prompt`; 4/6/8 seconds at 720p; 1080p/4k require 8 seconds                                                                                                                       |
| First-frame animation    | `prompt` and `image`; same duration/resolution constraints                                                                                                                        |
| First/last interpolation | `image` and `lastFrame`; last frame alone is invalid                                                                                                                              |
| Reference direction      | `prompt` and up to three asset references; 8 seconds; qualify exact supported combinations                                                                                        |
| Native extension         | Previous Veo video, generated/referenced within two days; 720p; `16:9` / `9:16`; source ≤141 seconds. Adds 7 seconds; returns combined video. Parameter table requires duration 8 |

All modes have native audio always on, one output and 24 FPS. Aspect default is `16:9`; resolution default is `720p`. The guide lists `personGeneration:"allow_all"` for text/extension and `"allow_adult"` for image/interpolation/references; EU, UK, CH and MENA permit only `allow_adult`. Resolve regional conflicts before offering an executable profile. These facts come from the [Gemini Veo guide](https://ai.google.dev/gemini-api/docs/veo?hl=en). An application default of 8 seconds must be captured as such. Style-reference support and mixed input modes remain unqualified on this exact path.

For direct REST, place `prompt`, `image`, `lastFrame`, `referenceImages` and `video` in `instances[0]`; settings go in `parameters`. Google's [SDK converters](https://github.com/googleapis/js-genai/blob/2cdb3b219eefced7fba83fa76474eea58d836d70/src/converters/_models_converters.ts#L2416) confirm the instance placement and map SDK `numberOfVideos` to REST `sampleCount`. A conservative request shape is:

```json
{
  "instances": [{ "prompt": "captured words" }],
  "parameters": {
    "aspectRatio": "16:9",
    "resolution": "720p",
    "durationSeconds": 8,
    "sampleCount": 1
  }
}
```

Important unresolved first-party inconsistencies:

- The guide's REST image examples use `{inlineData:{data,mimeType}}`; the pinned SDK emits `{bytesBase64Encoded,mimeType}`. The SDK emits video `{uri}` or `{encodedVideo,encoding}`. Pick one documented serialization and qualify it; do not assume these shapes are interchangeable. Prefer retaining the previous provider video object/URI for native extension. [Image/video converters](https://github.com/googleapis/js-genai/blob/2cdb3b219eefced7fba83fa76474eea58d836d70/src/converters/_models_converters.ts#L3672).
- The guide mentions Veo 3 seeds, but the pinned Gemini Developer API converter rejects `seed`. It also rejects editable `fps` and `generateAudio`. Keep seed unqualified pending resolution; no deterministic-output promise. [Converter](https://github.com/googleapis/js-genai/blob/2cdb3b219eefced7fba83fa76474eea58d836d70/src/converters/_models_converters.ts#L2416).

Current [operations mapping](../../../server/src/services/video-generation/providers/veo/operations.ts) puts last frame/references in `parameters`, contrary to both sources. [Veo generation](../../../server/src/services/video-generation/providers/veoProvider.ts) silently truncates references to three, forwards `style`, omits negative prompt, drops seed zero, and does not enforce coupled domains. [Inline media fetch](../../../server/src/services/video-generation/providers/veo/imageUtils.ts) fetches arbitrary stored extension URLs into inline data and substitutes MIME types; that is not proof of native extension eligibility. Reject incompatible modes/reference counts before dispatch, retain original provider provenance, and bind the serializer to the profile.

## Active Flux image adapters

| Field          | Flux Schnell                                                                                   | Pruna Flux Kontext Fast                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required       | `prompt`                                                                                       | `prompt`, `img_cond_path`: URI                                                                                                                                   |
| Aspect         | `1:1`, `16:9`, `21:9`, `3:2`, `2:3`, `4:5`, `5:4`, `3:4`, `4:3`, `9:16`, `9:21`; default `1:1` | Same list plus `match_input_image`; default `match_input_image`                                                                                                  |
| Output         | URI array; `num_outputs`: integer 1–4, default 1                                               | URI string                                                                                                                                                       |
| Format/quality | `webp`/`jpg`/`png`, default `webp`; quality integer 0–100, default 80                          | `png`/`jpg`/`webp`, default `jpg`; quality integer 1–100, default 80                                                                                             |
| Size           | `megapixels`: `1` / `0.25`, default `1`                                                        | `image_size`: integer, default 1024; no bound supplied                                                                                                           |
| Steps          | `num_inference_steps`: integer 1–4, default 4                                                  | Integer, default 30; no bounds supplied                                                                                                                          |
| Seed           | Optional integer                                                                               | Optional nullable integer                                                                                                                                        |
| Speed          | `go_fast` default `true`; fixed seed does not guarantee deterministic output when enabled      | `Lightly Juiced 🍊 (more consistent)`, `Juiced 🔥 (default)`, `Extra Juiced 🔥 (more speed)`, `Blink of an eye 👁️`, `Real Time`; schema default **Extra Juiced** |
| Other          | `disable_safety_checker`: default `false`                                                      | `guidance`: number, default 3.5; no bounds supplied                                                                                                              |

Sources: embedded [Schnell schema](https://replicate.com/black-forest-labs/flux-schnell/api/schema) and [Kontext Fast schema](https://replicate.com/prunaai/flux-kontext-fast/api/schema). Unbounded fields must not acquire invented sliders.

Current [Schnell adapter](../../../server/src/services/image-generation/providers/ReplicateFluxSchnellProvider.ts) explicitly sends `prompt`, `aspect_ratio`, `output_format:"webp"`, `output_quality:80`; application aspect default is `16:9` and omits supported `3:4`/`4:3`. It does not map request seed. Capture omitted effective values or explicitly send `num_outputs:1`, `megapixels:"1"`, `num_inference_steps:4`, `go_fast:true`, `disable_safety_checker:false` when the profile adopts them.

Current [Kontext adapter](../../../server/src/services/image-generation/providers/ReplicateFluxKontextFastProvider.ts) correctly sends `img_cond_path`, aspect, format, quality, speed and optional seed. Its application defaults are `match_input_image`, `webp`, quality 80 and **Juiced**, intentionally different from two schema defaults. It omits Blink of an eye. Unsupported aspects silently fall back and quality/seed are normalized. New acceptance should reject unresolved values and capture the effective mappings; do not reinterpret a saved take using today's defaults. The separate [Studio roster](../../../server/src/services/studio/StudioModelRegistry.ts) uses other endpoints and is not qualified by these Flux findings.

## Start, status, cancel, result and acceptance uncertainty

| Provider  | Reviewed public protocol                                                                                                                                                                                                                               | Required durable evidence / current gap                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replicate | `POST /v1/models/{owner}/{name}/predictions` with `{input}`; immutable-version requests use `POST /v1/predictions` with `{version,input}`. Get `GET /v1/predictions/{id}`; cancel `POST /v1/predictions/{id}/cancel`; result is `output`               | Persist prediction id, exact endpoint/version, captured input, acceptance response and terminal evidence. Video `replicate.run` returns only media; image runner retains id only inside one call. No durable resume/cancel seam |
| Gemini    | `POST /v1beta/models/veo-3.1-generate-preview:predictLongRunning`; response has server-assigned `name`. `GET /v1beta/{name}`; terminal `done` has error or response; REST output URI at `response.generateVideoResponse.generatedSamples[0].video.uri` | Persist operation name/service identity immediately, resume polling that operation, authenticated download and durable copy. Current operation name is logged, not returned through provider result/job state                   |

Replicate protocol is documented in its [HTTP reference](https://replicate.com/docs/reference/http) and public [HTTP OpenAPI](https://api.replicate.com/openapi.json). Its creation contract lists `Prefer` and `Cancel-After`, **no idempotency key**. `Prefer: wait` controls HTTP waiting; it does not cancel generation when the wait expires. `Cancel-After` controls provider deadline. [Creation guide](https://replicate.com/docs/topics/predictions/create-a-prediction).

Replicate terminal states include `succeeded`, `failed`, `canceled` and **`aborted`**. Deadline before execution yields aborted; after execution begins yields canceled. [Lifecycle and billing distinction](https://replicate.com/docs/topics/predictions/lifecycle). Current [image protocol](../../../server/src/services/image-generation/providers/runReplicatePrediction.ts) and [Studio runner](../../../server/src/services/studio/providers/ReplicateStudioImageRunner.ts) omit aborted and cannot call cancel. Their local polling timeout does not establish provider stop. API prediction input/output/files/logs expire after an hour by default; store durable evidence and media promptly. [Retention](https://replicate.com/docs/topics/predictions/data-retention/).

Google's [discovery document](https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta) exposes `models.operations.get/list`, but no model-operation cancel method or prediction request idempotency key. `batches.cancel` is a different resource. The SDK [abortSignal contract](https://github.com/googleapis/js-genai/blob/2cdb3b219eefced7fba83fa76474eea58d836d70/src/types.ts#L5031) explicitly says client abort does not cancel service work. A Veo cancel control must stay unavailable until exact provider support is established. Provider retention is two days; native extension additionally depends on that provider lifecycle.

Recommended acceptance rule, an application design inference from these protocols: a transport failure, lost create response, malformed success response or local timeout is **acceptance unknown**, not proof that no generation exists. Retain the immutable request/receipt and stop automatic resubmission unless a known handle can be recovered or nonacceptance is established. A local receipt alone cannot deduplicate an already sent provider request. Replicate explicitly reports throttling with HTTP 429, but retry classification should preserve the structured response; broad message matching is not sufficient evidence. [Rate-limit response](https://replicate.com/docs/topics/predictions/rate-limits). Current video [error classification](../../../server/src/services/video-generation/runtime/classifyError.ts) marks generation timeouts retryable, while [processing](../../../server/src/services/video-generation/runtime/processVideoJob.ts) can requeue; this needs acceptance-aware handling before claiming duplicate-free recovery.

## Qualification still open

Implement provider-free contract tests for exact payload keys, every enum/range boundary, mode/input conflicts, captured application defaults, rejected unsupported fields, zero seed policy, aborted, cancel/completion races, persisted-handle recovery, ambiguous start and output persistence. Verify the resulting adapter against the archived schema revision. These tests prove mapping and recovery behavior, not remote acceptance or creative quality.

Separate authorized provider qualification must resolve Veo media/seed inconsistencies, input geometry and file limits, extension provenance/retention, account/region/operation availability, optional sound-reference behavior, cancel economics, delivered duration/geometry/audio streams and output identity. No new provider request, account qualification, creative-quality measurement or rendition probe was performed in this research. Page 27 visual/interaction review and the image-editor deferral remain governed by [source review](source-review.md).
