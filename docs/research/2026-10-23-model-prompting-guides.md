# How each generation model wants to be prompted

Research date and source access date: **2026-10-23, America/Chicago**.

**Question.** Issue #242 asks for an "Improve wording" rewrite that knows which generation model is selected. As of October 2026, how does each model's own provider say it should be prompted? This note is the evidence base for the short rewrite guidance that will be stored on each model profile.

**Scope and method.**

- **Models.** Every model Vidra offers today, plus the models in upcoming tickets. Pure utility models with no words (Topaz upscale, Luma reframe, Recraft remove background and vectorize, ElevenLabs Scribe) are skipped.
- **Sources.** Primary sources only:
  - provider prompting guides, user guides, API references and launch posts;
  - each model's Replicate page, including its input schema (field names, `negative_prompt`, length limits, how references are named).
- **What the Replicate pages are.** Replicate writes or hosts the README on each model page, so README tips are cited as "Replicate README", separately from the provider's own guidance. The schema is cited as "Replicate schema". Where the two disagree with the provider, both are recorded and the conflict is listed under Gaps.
- **How pages were read.** JavaScript-rendered pages (BytePlus, Kling, PixVerse, MiniMax) were read in a browser, signed out. Non-essential cookies were rejected. Nothing was signed into, generated, bought or uploaded. Secondary blogs were used only to find the official pages.
- **Citations.** Each link is followed by the source's own date (or "undated") and the date it was seen.
- **Rewrite guidance blocks.** Each one is written as direct instructions to an LLM rewriter. It uses only what the cited sources say. If a provider says nothing on a point, the block says nothing on it either.

## Recommendation in brief

The rewriter's job differs more by model than "make it more descriptive" suggests. Seven patterns matter.

1. **Reference tokens are syntax. Copy them byte for byte.** Each provider names attached inputs differently, and several reject or misread a changed token. Never rename, renumber, translate, merge or "tidy" a token. Never invent one for an input that is not attached. Tokens seen in primary sources:

   | Model                    | Token form in the words                                                                 | Source                                                                                                                                                                                                                                                       |
   | ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Wan 3                    | `Image 1` / `Img 1`, `Video 1`, `Audio 1`, numbered separately per type in upload order | [Alibaba prompt guide](https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-prompt-guide) (2026-10-16; seen 2026-10-23)                                                                                                                   |
   | Gemini Omni 1.1          | `<IMAGE_REF_0>`, `<VIDEO_REF_0>`, `<FIRST_FRAME>`, `<LAST_FRAME>`, counting from 0       | [Gemini Omni docs](https://ai.google.dev/gemini-api/docs/omni) (2026-09-23; seen 2026-10-23)                                                                                                                                                                  |
   | Seedance 2.0 on Replicate | `[Image1]`, `[Video1]`, `[Audio1]`                                                      | [Replicate schema](https://replicate.com/bytedance/seedance-2.0) (undated; seen 2026-10-23)                                                                                                                                                                  |
   | Seedance 2.0 per BytePlus | `Image 1`, `@Image 1`, `<Image_N>`, `Video 1`, `Audio 1`                                | [BytePlus prompt guide](https://docs.byteplus.com/en/docs/modelark/seedance-2-0-prompt-guide) (2026-09-28; seen 2026-10-23)                                                                                                                                 |
   | Kling 3.0 Omni / O1 API  | `<<<image_1>>>`, `<<<video_1>>>`                                                        | [Replicate schema](https://replicate.com/kwaivgi/kling-v3-omni-video) (undated; seen 2026-10-23)                                                                                                                                                             |
   | Kling app / 4.0          | `@Image1`, `@Video1`, `@ElementName`                                                    | [Kling 4.0 guide](https://kling.ai/quickstart/kling-4-model-user-guide) (2026-10-14; seen 2026-10-23)                                                                                                                                                        |
   | GPT Image, FLUX.2, Seedream | "Image 1", "image 2", "the first image", by position                                  | [OpenAI image prompting](https://developers.openai.com/api/docs/guides/image-prompting) (undated; seen 2026-10-23); [BFL quick reference](https://docs.bfl.ml/guides/prompting_unified_reference) (undated; seen 2026-10-23)                                   |
   | Ideogram app             | `@img_1` pills                                                                          | [Ideogram reference images](https://docs.ideogram.ai/create/reference-images) (undated; seen 2026-10-23)                                                                                                                                                     |

2. **Quoted words are payload, not prose.** Spoken dialogue and on-image text go in quotation marks for Veo, Seedance (Replicate), Kling, Gemini Omni, GPT Image, Ideogram, Recraft, Seedream and FLUX.2 (cited per section below). Keep the quoted words verbatim:
   - same spelling, same capitals, same language;
   - never translate them, and never move a line from one speaker to another.

   ElevenLabs is the clearest case. Its own "Enhance" rewriter is told: "DO NOT alter, add, or remove any words from the original dialogue text itself" ([ElevenLabs best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices), undated; seen 2026-10-23).
3. **Negatives go to one of three places, depending on the model.** Getting this wrong works against the creator.
   - **Separate field.** Replicate exposes a `negative_prompt` field for Wan 3, Veo 3.1 and 3.1 Fast, Kling 3.0, PixVerse V6 and Bria. Veo's guide wants that field written as plain nouns ("wall, frame"), not "no walls" ([Veo prompt guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide), 2026-10-22; seen 2026-10-23). Recraft gives the same advice for its Studio negative-prompt field: write "apples", not "no apples" ([Recraft negative prompts](https://www.recraft.ai/docs/recraft-studio/image-generation/working-with-text-and-prompts/negative-prompts), undated; seen 2026-10-23).
   - **Inside the prompt, as short "No X" sentences.** Gemini Omni ("No dialogue"), Seedance ("Do not generate a logo"), Wan per Alibaba's guide ("No BGM"), GPT Image ("no watermark") and Kling 4.0. Kling 4.0 limits this to only "no subtitles" and "no background music".
   - **Never, rewritten as positives.** Nano Banana ("semantic negative prompts"), Ideogram 4.5 and FLUX.2. FLUX.2 "might actually add what you're trying to avoid."
   - A rewriter must not add "no …" phrases for the third group.
   - Recraft V4.1 has no negative field, but Recraft's own V4.1 example prompts state exclusions inline ("no gradients, no shadows").
4. **Edit prompts stay short.** Gemini Omni, GPT Image, Ideogram, Seedream, Kling 4.0 and Seedance all ask for the same pattern: name the one change, then state what stays the same ("Keep everything else the same"). Gemini Omni warns that "Overly descriptive prompts can lead to unintended changes." When a source picture or clip is being edited, the rewriter should tighten the instruction, not expand it into a scene description.
5. **When a picture is the first frame, describe what moves.** For image-to-video, describe motion, camera and sound rather than re-describing the picture. Sources: [Replicate README for Veo 3.1](https://replicate.com/google/veo-3.1) (undated; seen 2026-10-23) and the Alibaba guide for Wan 3.
6. **Several models already rewrite prompts themselves.** These include:
   - Wan 3 (`enable_prompt_expansion`, on by default);
   - Ideogram (Magic Prompt);
   - Kling 4.0 ("can expand and refine your instructions");
   - Lyria ("uses a prompt rewriter internally");
   - Bria (a VLM turns the prompt into a JSON blueprint).

   For these, the providers say short prompts are fine. Vidra's rewrite should fix clarity and keep the creator's specifics, not pad.
7. **Settings belong in settings, not in the words.** Ideogram: "Writing 16:9, four images or transparent PNG in a description doesn't replace the corresponding app control" ([Ideogram prompting basics](https://docs.ideogram.ai/prompting/prompting), updated about 2026-10-20; seen 2026-10-23). OpenAI: "Set API parameters separately from the prompt." The rewriter should not write aspect ratio, duration, resolution or counts into the words. Vidra's chips carry those.

Length limits the rewriter must stay under:

| Model                  | Limit                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Wan 3                  | 20,000 characters (Alibaba API)                                                                     |
| GPT Image              | 32,000 characters (OpenAI API)                                                                      |
| Recraft V4.x           | 10,000 characters                                                                                   |
| Ideogram 4.5           | 10,000 characters                                                                                   |
| Ideogram 3.0 Character | about 150 words                                                                                     |
| ElevenLabs v3          | 5,000 characters                                                                                    |
| Seedance 2.0           | 4,000 characters (Replicate); BytePlus recommends under 600 English words                           |
| Seedream 5             | 4,000 characters                                                                                    |
| Kling 3.0              | 2,500 characters (Replicate)                                                                        |
| Kling 4.0              | 8,000 tokens                                                                                        |
| PixVerse V6            | 5,000 characters (PixVerse API)                                                                     |
| MiniMax Music          | Lyrics 1 to 3,500 characters; style prompt up to 2,000 characters                                   |

Each limit is cited in its model's section.

---

## Currently offered

### Wan 3 (text-to-video and image-to-video) — `alibaba/wan-3`

**Prompt structure.** Alibaba's full formula is: overall description, then reference citations (Image N / Video N / Audio N), then shots, then dialogue, sound and music, then style and mood, then a negative list. Each shot is written as "Shot N (start-end seconds): Subject + Scene + Motion + Aesthetic control". Any part you don't need can be skipped. Source: [wan3.0 prompt guide](https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-prompt-guide) (2026-10-16; seen 2026-10-23).

- **Multi-shot.** Use "Shot 1 [0-3s]" or "Shot 1 (00:00-00:03)". Pick one style and use it throughout. Shots should be 2 to 5 seconds, with "no gaps or overlaps".
- **Camera.** Use plain camera terms (push in, pull out, orbit, handheld follow). Write "Fixed shot, camera static" for a locked camera.
- **Style and mood.** Put style, color tone and mood at the start or the end.
- **Image-to-video.** The image already sets subject, scene and style, so the words should cover motion, plot, dialogue and camera.
- **Editing.** Change "one item at a time".

**References.** In the words, write "Image 1"/"Img 1", "Video 1", "Audio 1". These are numbered by upload order, separately per type. A single input can be called "reference image" ([prompt guide](https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-prompt-guide); [video generation guide](https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-guide), 2026-10-11; seen 2026-10-23). Vidra's Replicate endpoint takes only one optional first-frame `image` ([Replicate schema](https://replicate.com/alibaba/wan-3), undated; seen 2026-10-23), so multi-reference tokens do not apply there yet.

**Dialogue, sound, music** (all from the prompt guide):

- **Dialogue.** Write it as "character + speaking verb + colon + quoted content", for example `she whispers: "…"`, one speaker per line.
- **Lip sync.** Append "Lip sync."
- **Sound effects.** Ambient sound fills itself in from the visible action. Specific sound effects go in their own sentences.
- **Unwanted sound.** To prevent unwanted sound, write "No dialogue" or "No BGM, generate only ambient and action sounds."

**Negative prompts.** Conflicting:

- Alibaba's guide puts a "negative prompt list" inside the prompt. It says to list only what must not appear, and not to pad the list or repeat the positive prompt.
- Alibaba's API documents no `negative_prompt` parameter ([API reference](https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-api-reference), 2026-10-15; seen 2026-10-23).
- Replicate does expose a `negative_prompt` field ([Replicate schema](https://replicate.com/alibaba/wan-3)).

**Length.** Up to 20,000 characters; beyond that, the text "is automatically truncated" (API reference).

**Avoid:**

- high-frequency actions;
- padded negative lists;
- mixing first-and-last-frame mode with all-reference mode;
- several edits in one request.

The API's `prompt_extend` (Replicate: `enable_prompt_expansion`, default on) means "a large language model rewrites the input prompt" (API reference).

```text
Rewrite guidance (Wan 3)
Keep the creator's idea; organise it as: one-line overall description, then the action, camera and lighting, then sound, then style and mood at the end. For multi-shot ideas use "Shot 1 [0-3s]: …" with 2–5 s shots that meet end to end. Write dialogue as `Name says: "exact words"`, one speaker per line, never altering the quoted words. If a start picture is attached, describe motion, camera and sound, not the picture. Put exclusions in the negative field when it exists; otherwise end with short "No X." sentences. Do not add on-screen text, aspect ratio or duration.
```

### Gemini Omni 1.1 (text-to-video, image-to-video, edit a clip by words) — `google/gemini-omni-1.1`

**Prompt structure.**

- **Text-to-video.** Include "scene description, camera movement, lighting and mood". Vague prompts like "make it move" do worse than describing camera movement, subject motion and environmental effects ([Gemini Omni Flash docs](https://ai.google.dev/gemini-api/docs/omni), 2026-09-23; seen 2026-10-23).
- **Single shot.** By default the model "will try to create a video with a few different shots". For one shot, write "In a single continuous shot" or "No scene cuts".
- **Timing.** Timing works in natural language ("After 3 seconds, …") or as timecodes (`[0-3s] …`).
- **Meta prompting.** Instructions such as "Consider micro-detail, expression and timing…" are supported.
- **On-screen text.** Define any text that will appear, even background signs.

**Editing a clip.** "Simple prompts work best for video editing. Overly descriptive prompts can lead to unintended changes." Add "Keep everything else the same." Google's own pairs:

- Avoid a long sentence about removing a phone; write "Make the phone invisible. Keep everything else the same."
- Avoid a long sentence about a cat; write "Add a cat that jumps onto his lap, he begins to pet it. Keep everything else the same."

Extensions use prompts like "The scene continues". For timecodes in an extension, 0s means the start of the extended part.

**References.** Tags bind uploaded media to roles:

- `<FIRST_FRAME>` and `<LAST_FRAME>`;
- `<IMAGE_REF_N>` and `<VIDEO_REF_N>`, counting from 0;
- for complex cases, a header such as `[# References <IMAGE_REF_0>@Image1]`.

Reference images "should not be used as literal initial frames." Replicate exposes `image`, `last_frame`, `reference_images` and `video` fields ([Replicate schema](https://replicate.com/google/gemini-omni-1.1), undated; seen 2026-10-23). It does not say whether tags pass through.

**Dialogue and sound.** The model adds audio by default. Describe the audio you want, especially music ("Include calm background music"). The Replicate README adds "describe dialogue (in quotes)" ([Replicate README](https://replicate.com/google/gemini-omni-1.1)).

**Negative prompts.** There is no separate field: "negative prompts are not supported (you can put your negatives in the regular prompt: e.g., "Do not do X")". The guide's examples are "No dialogue", "No embellishments", "No extra sound effects" (Gemini docs).

**Length.** No prompt limit is stated. Uploaded clips for editing or extension must be 10 s or less.

**Avoid:**

- voice editing;
- extending an uploaded clip with new dialogue;
- audio references;
- reasoning across multiple videos.

All are listed as unsupported (Gemini docs).

```text
Rewrite guidance (Gemini Omni 1.1)
For new clips: describe scene, subject motion, camera movement, lighting, mood and the audio you want, in plain sentences; put spoken lines in quotes. If the creator wants one take, add "In a single continuous shot. No scene cuts." Timed beats may use "[0-3s] …". For edits of an attached clip: keep it to one short instruction plus "Keep everything else the same." — do not expand it. Put exclusions in the prompt as short sentences ("No dialogue."). Keep any <IMAGE_REF_n>, <VIDEO_REF_n>, <FIRST_FRAME>, <LAST_FRAME> tags exactly; never add them.
```

### Grok Imagine video extension — `xai/grok-imagine-video-extension`

**What xAI publishes.** xAI's extension page says only that you provide "a source video and a text prompt describing what should happen next", plus example prompts ("The cat turns its head, notices a butterfly, and leaps off.") and limits ([xAI Video Extension](https://docs.x.ai/developers/model-capabilities/video/extension), undated; seen 2026-10-23).

- The extension is 2 to 10 s and continues from the last frame.
- The source clip is 2 to 15 s.
- Output is capped at 720p.

xAI's generation page has no prompting guidance on structure, camera, audio, negatives, length or reference naming ([xAI Video Generation](https://docs.x.ai/developers/model-capabilities/video/generation), undated; seen 2026-10-23).

**Replicate README tips** (Replicate's, not xAI's):

- "Describe the action, not the scene";
- mention camera movement;
- be specific about motion.

Source: [Replicate README](https://replicate.com/xai/grok-imagine-video-extension) (undated; seen 2026-10-23).

**Negative prompts.** No field ([Replicate schema](https://replicate.com/xai/grok-imagine-video-extension)), and xAI does not address in-prompt negatives.

**Length.** Not documented.

```text
Rewrite guidance (Grok Imagine extension)
Write only what happens next, starting from the last frame of the attached clip: the next action, how the subject moves, and any camera move, in one or two concrete sentences. Do not re-describe the existing scene. Keep the creator's wording of the action; do not add sound, dialogue or exclusions — xAI documents no convention for them.
```

### Nano Banana 2.1 (make and edit pictures) — `google/nano-banana-2.1`

**Prompt structure.** Google's 2.1 model page has no prompting tips of its own. It defers to the Nano Banana image guide ([Nano Banana 2.1](https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1), 2026-10-06; seen 2026-10-23). That guide gives templates ([Nano Banana image generation](https://ai.google.dev/gemini-api/docs/image-generation), 2026-10-09; seen 2026-10-23):

- **Photoreal.** "A photorealistic [type of shot] of a [subject] in a [setting]. [light]. Shot from a [camera angle] with a [lens type]."
- **Text.** `Create a [image type] for [brand] with the text "[text]" in a [font style].`

Its best practices:

- "Be hyper-specific";
- "Provide context and intent" (say what the picture is for);
- step-by-step instructions for complex scenes;
- photographic and cinematic camera language.

**Editing.** "Using the provided image, change only the [element] to [new]. Keep everything else in the image exactly the same, preserving the original style, lighting, and composition." For critical details such as faces and logos, "describe them in great detail along with your edit request."

**References.** Refer to inputs by position: "the element from image 1", "the first image" (image guide). Replicate accepts up to 14 images in `image_input` ([Replicate schema](https://replicate.com/google/nano-banana-2.1), undated; seen 2026-10-23). Google's limits: 2.1 supports resemblance of up to 4 characters and fidelity of up to 10 objects.

**Text in images.** Put the exact words in quotes and describe the font style. "Gemini works best if you first generate the text and then ask for an image with the text."

**Negative prompts.** No field. Use "semantic negative prompts": "Instead of saying 'no cars,' describe the intended scene positively: 'an empty, deserted street with no signs of traffic.'"

**Length.** Not stated. Best-performing languages are listed in the limitations.

```text
Rewrite guidance (Nano Banana 2.1)
Write a narrative description, not a keyword list: subject, setting, lighting, camera angle and lens, plus what the picture is for. Put any words that must appear in quotes with a described font style. For edits, use "Using the provided image, change only [X] to [Y]. Keep everything else exactly the same." With several inputs, refer to them as "image 1", "image 2" by position and say what comes from each. Turn exclusions into positive descriptions of what should be there; never write "no X".
```

### GPT Image 2.5 Sunburst and GPT Image 2 (make and edit pictures) — `openai/gpt-image-2.5-sunburst`, `openai/gpt-image-2`

**Prompt structure.** OpenAI's current guide covers GPT Image 2.5 and says its techniques also apply to GPT Image 2 ([OpenAI image prompting](https://developers.openai.com/api/docs/guides/image-prompting), undated; seen 2026-10-23). Its fundamentals:

- **Define the result.** Name the subject and the intended use (product photograph, ad, diagram). For complex requests, use labeled sections in the order "scene, subject, details, and constraints".
- **Format.** Any format works (short, paragraph, JSON-like, tags). Choose the easiest to maintain.
- **Photoreal.** Say "photorealistic" or "real photograph". Treat camera specs as appearance cues, not exact simulation.
- **People.** Describe framing, gaze and pose ("full body visible, feet included").
- **Iterate.** Change one thing per turn.

**Editing.** "Separate changes from constraints": say "change only X", then list what to preserve (identity, geometry, layout, lighting, labels). OpenAI's examples end with "Do not change anything else." Repeat the preserve list on every iteration.

**References.** "Identify each input by number and purpose: subject, style, clothing, or background", and say which element moves where. Replicate's README example: "Apply the style from image 1 to the subject in image 2" ([Replicate README](https://replicate.com/openai/gpt-image-2), undated; seen 2026-10-23).

**Text in images.** Put required wording in quotes. Describe position and typography. Spell unusual words letter by letter. Ask for no extra text, and say how many times the text should appear ("Render the tagline exactly once").

**Negative prompts.** No field ([Replicate schema](https://replicate.com/openai/gpt-image-2.5-sunburst), undated; seen 2026-10-23). Exclusions go in the prompt as constraints ("No extra text, no watermarks, no unrelated logos") per OpenAI's guide.

**Length.** Up to 32,000 characters ([OpenAI Images API](https://developers.openai.com/api/reference/resources/images/methods/generate), undated; seen 2026-10-23).

**Avoid:**

- writing settings into the prompt ("Set API parameters separately from the prompt");
- assuming repeated edits keep regions pixel-identical.

OpenAI describes Sunburst as the model "for workflows where editing precision matters most" ([GPT-Image-2.5 Sunburst model page](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst), undated; seen 2026-10-23).

```text
Rewrite guidance (GPT Image 2.5 / 2)
State the deliverable and its use first, then scene, subject, details and constraints (short labeled lines are fine for complex requests). Use concrete materials, light, framing and pose; say "photorealistic" when realism is wanted. Quote exact on-image text, give placement and type style, and say it appears once with no extra text. For edits: "Change only X." then list what must stay (face, pose, layout, lighting) and end "Do not change anything else." Name inputs as "image 1", "image 2" with their roles. Exclusions are allowed as short constraint phrases. Never write size, quality or background settings into the words.
```

### Ideogram 4.5 Precise Edit (area edits) — `ideogram-ai/ideogram-4-5-precise-edit`

The same guide also covers Ideogram 4.5 generation and Ideogram Character, which are in the coming tickets and get their own blocks under "Coming in tickets".

**Prompt structure.**

- **Edit instruction.** With a source image attached, "your prompt becomes an edit instruction… say what should change and keep the rest of the prompt short" ([Ideogram reference images](https://docs.ideogram.ai/create/reference-images), undated; seen 2026-10-23).
- **Precise Edit.** The app asks "What should change?" Its example for a masked area is "mustard yellow velvet upholstery" ([Masks and inpainting](https://docs.ideogram.ai/edit/masks-and-inpainting), undated; seen 2026-10-23).
- **Multi-turn.** "Change one thing per turn, say what should stay the same". Ideogram's example prompts:
  - "Change the sofa upholstery to deep forest green velvet. Keep the sofa's shape and the rest of the room exactly the same."
  - "Make it evening: … Keep every object exactly where it is."

**References.** Up to 4 reference images, or 3 with a mask ([Replicate schema](https://replicate.com/ideogram-ai/ideogram-4-5-precise-edit), undated; seen 2026-10-23). In the Ideogram app, references are `@img_1` pills: "Place the bottle from @img_1 on the table in @img_2." Ideogram adds: "select the actual pills rather than typing a guessed file name." The Replicate schema does not say how API references are named.

**Text in images.** Quote exact words, mention them early, say where they appear, keep them short ([Text in images](https://docs.ideogram.ai/prompting/text-in-images), undated; seen 2026-10-23).

**Negative prompts.** "Ideogram 4.5 and 4.0 have no separate Negative prompt field." "Image models don't handle 'no', 'without' or 'not' well. They latch onto the word that follows." Describe what you'd see instead ([Fix common problems](https://docs.ideogram.ai/prompting/fix-common-problems), undated; seen 2026-10-23).

**Length.** Up to 10,000 characters for 4.5, though "a focused prompt is still easier to control" ([Prompt structure](https://docs.ideogram.ai/prompting/prompt-structure), undated; seen 2026-10-23).

**Avoid:** weights and flags such as `::1` or `--ar`. Ideogram "treats them as words" ([Prompting basics](https://docs.ideogram.ai/prompting/prompting), updated about 2026-10-20; seen 2026-10-23).

```text
Rewrite guidance (Ideogram 4.5 Precise Edit)
Rewrite into one short edit instruction: what changes in the marked area or picture, then "Keep … exactly the same" naming what must not move. One change per request. Quote any new on-image words exactly and say where they sit. Describe the wanted result positively — never "no X", "without X" or "not X". Do not add scene description, weights, flags, aspect ratio or other settings. Keep any reference mention exactly as written.
```

### Recraft V4.1 and V4.1 Pro, raster and SVG — `recraft-ai/recraft-v4.1`, `-v4.1-pro`, `-v4.1-svg`, `-v4.1-pro-svg`

**Prompt structure.** Recraft publishes no formal V4.1 prompt guide. Its launch post stresses short prompts: V4.1 "can read a short prompt and get the aesthetic right, all without the instructions of War and Peace" and "Give V4.1 just a few words". Its long examples are dense comma-separated design briefs: a vector logo prompt specifying lettering, palette, "Flat fills only" and lockup ([Recraft V4.1](https://www.recraft.ai/docs/recraft-models/recraft-v4-1), released 2026-05-14; seen 2026-10-23).

- **Vector models.** For logos, typography and illustrations.
- **Utility models.** For flat, front-facing, simple scenes.
- **Replicate.** V4.1 "follows it closely" whether the prompt is "a few words or a detailed paragraph" ([Replicate README](https://replicate.com/recraft-ai/recraft-v4.1), undated; seen 2026-10-23).

**References.** None. The Replicate endpoints take only `prompt`, `aspect_ratio` and `size` ([Replicate schema](https://replicate.com/recraft-ai/recraft-v4.1-svg), undated; seen 2026-10-23).

**Text in images.** "You can increase accuracy by placing the text in quotation marks" ([Adding text to an image](https://www.recraft.ai/docs/recraft-studio/image-generation/working-with-text-and-prompts/adding-text-to-an-image), undated; seen 2026-10-23).

**Negative prompts.** "Not supported by V4.1: `negative_prompt`, `style` (curated styles), `text_layout`, and the `artistic_level` and `no_text` controls" ([Recraft V4.1 API](https://www.recraft.ai/docs/api-reference/models/recraft-v4-1), undated; seen 2026-10-23). Recraft's own V4.1 vector example still states exclusions inline ("no gradients, no shadows").

**Length.** 10,000 characters for V4 and newer ([Limits and sizes](https://www.recraft.ai/docs/api-reference/appendix), undated; seen 2026-10-23).

```text
Rewrite guidance (Recraft V4.1 / Pro / SVG)
Keep short ideas short — Recraft says a few words are enough and the model supplies taste. When the creator gives detail, tighten it into a compact design brief: subject, medium (photo, flat vector illustration, logo, 3D), palette, composition, finish. Put exact lettering in quotes. For SVG, name it as a vector logo, icon or illustration with flat fills. There is no negative field; state any must-not constraints briefly inline. Do not add aspect ratio or size.
```

### ElevenLabs v3 (text to speech) — `elevenlabs/v3`

**Script structure.**

- ElevenLabs now steers v3 users to v4. "Many of the prompting techniques for Eleven v4 also apply to Eleven v3" ([What is Eleven v3?](https://elevenlabs.io/docs/help-center/product/core-capabilities/text-to-speech/what-is-eleven-v3-alpha), undated; seen 2026-10-23).
- "Text structure strongly influences output." Use natural speech patterns, proper punctuation and clear emotional context ([TTS best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices), undated; seen 2026-10-23).
- Replicate notes v3 "requires more prompt engineering than previous models" ([Replicate README](https://replicate.com/elevenlabs/v3), undated; seen 2026-10-23).

**Audio tags.** Wrap a short direction in square brackets where the delivery should change ([audio tags FAQ](https://elevenlabs.io/docs/help-center/product/core-capabilities/text-to-speech/how-do-audio-tags-work-with-eleven-v3-and-v4), undated; seen 2026-10-23). Tag kinds:

- emotions: `[curious]`, `[sad]`;
- delivery: `[whispers]`, `[shouts]`;
- reactions: `[laughs]`, `[sighs]`, `[clears throat]`;
- sound effects: `[applause]`;
- accents: `[strong French accent]`.

How to write tags (best practices):

- Tags should "clearly describe the voice quality you want", for example `[low, gravelly voice]`, because a tag can be misread as a sound effect.
- Match tags to the voice; "A meditative voice shouldn't shout".

**Punctuation.** Ellipses add pauses and weight. Capitals add emphasis. v3 and v4 "do not support SSML break tags".

**Dialogue.** Multi-speaker scripts use `Speaker 1: [tag] line`.

**ElevenLabs' own enhancer rules.** The prompt behind its "Enhance" button is published:

- add tags "immediately before the dialogue segment they modify or immediately after";
- "DO NOT alter, add, or remove any words from the original dialogue text";
- do not use tags such as `[standing]`, `[grinning]`, `[pacing]`, `[music]`;
- emphasis may only come from capitals, `?`, `!` or ellipses.

**Narrative cues.** Narrative emotion cues like "she asked, her voice trembling" work, but "the model will still speak out the emotional delivery guides".

**Negative prompts.** Not applicable. No field ([Replicate schema](https://replicate.com/elevenlabs/v3)).

**Length.** 5,000 characters, about 5 minutes ([ElevenLabs models](https://elevenlabs.io/docs/overview/models), undated; seen 2026-10-23).

```text
Rewrite guidance (ElevenLabs v3)
The words are the script and are spoken verbatim: never add, remove or reword any of them. You may only insert square-bracket audio tags before or after the segment they modify ([whispers], [sighs], [excited], [laughs]), and add emphasis with CAPITALS, ellipses, "?" or "!". Tags must describe something audible about the voice; never visual or stage tags like [standing] or [music]. Do not add SSML <break> tags or narration like "she said sadly" (it will be read aloud). For dialogue keep "Speaker 1:" labels. Stay under 5,000 characters.
```

### Lyria 3 (music) — `google/lyria-3`

**Which model this is.** Replicate's `google/lyria-3` is the Clip variant, which "always generates a 30-second MP3 clip". `google/lyria-3-pro` makes full songs ([Replicate README](https://replicate.com/google/lyria-3), undated; seen 2026-10-23). Google's page now names the family "Lyria 3.5 & Lyria 3 Clip". Its prompt guide covers both ([Lyria prompt guide](https://ai.google.dev/gemini-api/docs/lyria-prompt-guide), 2026-09-17; seen 2026-10-23).

**Prompt structure.** "Both short and detailed prompts produce strong results."

- Lead with the primary genre. Genres can be combined, with an era or regional variant.
- Name instruments and how they sound together.
- Add tempo (BPM), key and scale, and mood adjectives.
- Shape structure with tags or arrows (`[Intro] -> [Verse 1] -> [Chorus]`), energy directions, or timing markers ("The chorus kicks in at 22 seconds").

**Vocals and lyrics.**

- **Default.** "Lyria 3.5 generates vocal tracks with lyrics by default."
- **Your own lyrics.** Put them "beneath a Lyrics: header", with section tags, and parentheses for backing vocals.
- **Generated lyrics.** Describe the narrative and key phrases.
- **Singer.** Describe gender, range and timbre.

Best practices ([Generate music with Lyria](https://ai.google.dev/gemini-api/docs/music-generation), 2026-10-01; seen 2026-10-23):

- "Separate lyrics from instructions";
- "Prompt in the language you want the lyrics in";
- for instrumentals, "Instrumental only, no vocals".

**Negative prompts.** No field ([Replicate schema](https://replicate.com/google/lyria-3)). The only documented exclusion is "Instrumental only, no vocals".

**Length.** Not stated.

**Avoid.** Requests for "specific artist voices" or "copyrighted lyrics" are blocked. "Lyria 3.5 uses a prompt rewriter internally."

```text
Rewrite guidance (Lyria 3)
Lead with genre (plus era or region if given), then instruments and how they sound, then tempo in BPM, key, and mood words. For a 30-second clip keep structure light; for songs, sketch it with [Intro] -> [Verse] -> [Chorus] or timing cues. If the creator supplied lyrics, put them unchanged under a "Lyrics:" header with section tags, separate from the musical direction; do not translate them. Write in the language the lyrics should be sung in. For no vocals, add "Instrumental only, no vocals." Never name a real artist's voice or quote existing song lyrics.
```

---

## Coming in tickets

### Seedance 2.0 and 2.0 Fast — `bytedance/seedance-2.0`, `bytedance/seedance-2.0-fast`

**Prompt structure.** BytePlus gives a basic formula per task. Source: [Seedance 2.0 series prompt guide](https://docs.byteplus.com/en/docs/modelark/seedance-2-0-prompt-guide) (2026-09-28; seen 2026-10-23).

- **Omni reference.** "Reference <Subject_N> in <Image_N> to generate…"
- **Video edit.** "Strictly edit <Video_N>, and modify … to …". Parts not mentioned stay unchanged.
- **Extension.** "Extend <Video_N> forward/backward…"

Its advanced formula is: "precise subject + action details + scene/environment + lighting & color tone + camera movement + visual style + image quality + constraints".

- **Shots.** Write complex clips as "Shot 1 / Shot 2 / Shot 3". The guide warns that "support for precise timing (such as 0–3 seconds) is unstable".
- **Camera.** One camera move per shot.
- **Action.** Body-part-specific action. Prefer slow, continuous movement.
- **Emotion.** Show emotion through physical details rather than words like "very sad".

**References.** Two conventions disagree:

- **Replicate.** The schema says `[Image1]`, `[Video1]`, `[Audio1]`, with up to 9 images, 3 videos and 3 audio files. Audio "requires at least one reference image or video" ([Replicate schema](https://replicate.com/bytedance/seedance-2.0), undated; seen 2026-10-23).
- **BytePlus.** The guide writes "Image 1", "@Image 1" and `<Image_N>`. Define each subject once ("Define the woman … in Image 1 as Subject 1") and reuse the same label every time. For edit and extend, write "<Video_N>" directly, not "reference <Video_N>", "to avoid being incorrectly identified as a reference task." Use 4 to 5 assets, not the maximum. Place the most important asset first.

**Dialogue and sound.** Also conflicting:

- **Replicate.** "For dialogue, put the spoken words in double quotes" ([Replicate README](https://replicate.com/bytedance/seedance-2.0)).
- **BytePlus symbol table.** Music in `（）`, sound effects in `< >`, dialogue in `{}`, subtitles in `【】`.
- **BytePlus examples.** Many of the guide's own examples still use double quotes.
- **Language.** Dialogue language must be consistent. A language other than Chinese or English must be named ("says in Japanese …").
- **Voice reference.** Describe voice traits ("the low, thick, warm … voice of @Audio 1").

**Negative prompts.** No field ([Replicate schema](https://replicate.com/bytedance/seedance-2.0-fast), undated; seen 2026-10-23). Use constraint words in the prompt: "keep it subtitle-free", "do not generate a logo", "do not generate a watermark" (BytePlus).

**Length.** Up to 4,000 characters; "BytePlus recommends keeping prompts under 600 English words" (Replicate schema for 2.0; not stated for Fast). Also: "Do not directly use the complete script as the prompt."

```text
Rewrite guidance (Seedance 2.0 / Fast)
Structure as: who, doing what, where, light and tone, camera, style, then constraints. For more than one beat write "Shot 1: … Shot 2: …" without second timings, one camera move per shot, slow continuous actions described by body part. Copy every reference token exactly as the creator wrote it ([Image1], Image 1, @Image 1) and bind each person to one label used consistently. For edits say "Strictly edit [Video1]: change X to Y, keep everything else unchanged." Keep spoken lines verbatim in quotes. End with needed constraints ("Keep it subtitle-free. Do not generate a watermark."). Stay under 600 words.
```

### Kling 3.0, 3.0 Omni, O1 (clip editing), and Kling 4.0 — `kwaivgi/kling-v3-video`, `kwaivgi/kling-v3-omni-video`, `kwaivgi/kling-o1`

**Kling 3.0.** Source: [Kling VIDEO 3.0 guide](https://kling.ai/quickstart/klingai-video-3-model-user-guide) (2026-02-06; seen 2026-10-23).

- **Multi-shot.** The model "understand[s] scene coverage and shots in your prompt"; custom shots are written "Shot 1, profile shot of …. Shot 2, …".
- **Dialogue.** Pair each character with their line: `Mom (softly, in a surprised tone): Wow, …` or `says "…"`.
- **Languages.** Chinese, English, Japanese, Korean and Spanish, with dialects and accents tagged in the prompt ("speaks in English with an Indian accent"). Other languages are translated to English.
- **Bound voices.** If an element has a bound voice, "it's not recommended to set the tone again in the prompt."
- **Replicate structure.** Scene setting, subject details, motion, then audio with "Dialogue in quotation marks" ([Replicate README](https://replicate.com/kwaivgi/kling-v3-video), undated; seen 2026-10-23).
- **Replicate fields.** `negative_prompt` (max 2,500 characters) and a `multi_prompt` JSON with up to 6 shots. The prompt maximum is 2,500 characters ([Replicate schema](https://replicate.com/kwaivgi/kling-v3-video)).

**Kling 3.0 Omni and O1.** Sources: [Kling VIDEO 3.0 Omni guide](https://kling.ai/quickstart/klingai-video-3-omni-model-user-guide) (2026-02-06; seen 2026-10-23); [Kling VIDEO O1 guide](https://kling.ai/quickstart/klingai-video-o1-user-guide) (2025-12-15; seen 2026-10-23).

- **Reference prompts.** Structure: "[Detailed description of Elements] + [Interactions/actions between Elements] + [Environment or background] + [Visual directions…]".
- **Edit templates:**
  - "Remove [content] from [@Video]";
  - "Change [subject] in [@Video] to [target]";
  - "Change [@Video] to [style] style";
  - "Based on [@Video], generate the next shot: …".
- **Shots.** Written "Shot 1 (2s): …".
- **Reference tokens.** On Replicate, Omni and O1 use `<<<image_1>>>` and `<<<video_1>>>` ([Replicate schema](https://replicate.com/kwaivgi/kling-v3-omni-video), undated; seen 2026-10-23).
- **Replicate conflicts.** The O1 README instead shows `@Element1` and `@Image1` ([Replicate README](https://replicate.com/kwaivgi/kling-o1), undated; seen 2026-10-23). The 3.0 Omni README lists a `negative_prompt` that its schema does not have.

**Kling 4.0.** A full guide exists: [Kling 4.0 User Guide](https://kling.ai/quickstart/kling-4-model-user-guide) (2026-10-14; seen 2026-10-23). The model became available on October 15 ([Kling 4.0 release note](https://kling.ai/release-note/release-notes/Kling_4?type=dialog), 2026-10-15; seen 2026-10-23).

- **Principle.** "Use descriptive language and minimize abstract terms and negative instructions… Negative prompts can increase the likelihood of errors. Only two types of negative instructions are truly necessary: no subtitles and no background music."
- **Abstract words.** Replace them with visible detail: not "Premium look" but side backlighting, a blurred background and matte grain.
- **References.** Assets are numbered `@Image1`, `@Video1`, and you should state each one's role ("@Image1 defines the scene. Preserve its spatial layout…").
- **Prompt structure:** [Asset Roles] → [Overall Settings] → [Sequence of Events: 0–X s …] → [Audio: dialogue/voiceover + ambience + music + SFX].
- **Edits.** Must say "Edit @Video1" plus "Keep everything else unchanged"; "Simply writing 'Reference @Video1' may be interpreted as reference-based generation".
- **Length.** Prompts up to 8,000 tokens. The model expands simple prompts.

```text
Rewrite guidance (Kling 3.0 / 3.0 Omni / O1)
Order: scene and light, subject details, motion and camera, then audio. For several shots write "Shot 1 (2s): framing, action. Shot 2 (3s): …" (max 6). Give each spoken line to a named character with tone in brackets and the words in quotes, unchanged; name the language or accent if not English. Copy reference tokens (<<<image_1>>>, @Image1, @Element names) exactly. For clip edits use Kling's forms: "Change [subject] in <<<video_1>>> to …", "Remove … from …". Put exclusions in the negative field when present; otherwise only "no subtitles" or "no background music". Under 2,500 characters.
```

```text
Rewrite guidance (Kling 4.0)
Lead with asset roles ("@Image1 defines the scene; preserve its layout.") using the creator's tokens exactly, then overall look, then events in time order ("0–3 s: …"), then audio (dialogue in quotes, ambience, music, effects). Replace abstract words ("premium", "vintage") with visible details. Avoid negative instructions except "no subtitles" and "no background music". For edits write "Edit @Video1: change X. Keep everything else unchanged." — never "Reference @Video1". Short ideas may stay short; Kling expands them.
```

### Veo 3.1, 3.1 Fast, 3.1 Lite — `google/veo-3.1`, `google/veo-3.1-fast`, `google/veo-3.1-lite`

**Status note.** "Veo 3.1 Preview … in the Gemini API was shut down on October 22, 2026." Google points users to Gemini Omni Flash or the GA models on the Gemini Enterprise Agent Platform ([Video generation in the Gemini API](https://ai.google.dev/gemini-api/docs/video), 2026-10-22; seen 2026-10-23). Replicate still lists all three endpoints.

**Prompt structure.** Google lists these elements ([Veo docs, prompt guide](https://ai.google.dev/gemini-api/docs/veo), 2026-10-22; seen 2026-10-23):

- Subject and Action;
- Style;
- optionally: camera positioning and motion, composition, focus and lens effects, and ambiance.

It also says to "Use descriptive language". The Agent Platform guide adds temporal elements (pacing, evolution, rhythm) and cinematic editing terms ("match cut", "jump cut"). It recommends "separate sentences in your prompt to describe the audio" ([Video generation prompt guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide), 2026-10-22; seen 2026-10-23).

**Dialogue and sound.**

- "Dialogue: Use quotes for specific speech."
- Sound effects: "Explicitly describe sounds."
- Ambient noise: describe the soundscape.
- Google's example writes speaker labels: `Man: (Hand on his hunting knife) "That's no ordinary bear."`

**References.**

- **First frame.** The image is used "as the initial frame".
- **Asset images.** Up to three images "of a single person, character, or product". On Replicate these only work at 16:9 and 8 s ([Replicate schema](https://replicate.com/google/veo-3.1), undated; seen 2026-10-23).
- **Lite.** Takes no reference images and cannot extend clips ([Replicate README](https://replicate.com/google/veo-3.1-lite), undated; seen 2026-10-23).
- **Extension.** Voice only carries over if present in the last second.
- **Image-to-video.** Describe "the motion and action you want to see, not just … what's already in the image" ([Replicate README](https://replicate.com/google/veo-3.1)).

**Negative prompts.** Separate `negative_prompt` field on 3.1 and Fast. There is none on Lite ([Replicate schema](https://replicate.com/google/veo-3.1-fast), undated; seen 2026-10-23). Google: do not use "no" or "don't". Describe what you don't want as nouns, for example "wall, frame".

**Length.** Not stated.

```text
Rewrite guidance (Veo 3.1 / Fast / Lite)
Write subject, action, setting, style, then camera position and movement, framing, lens and light, in descriptive sentences. Describe sound in separate sentences: dialogue as `Name: "exact words"`, then sound effects, then ambience. With a start picture, describe the motion and sound, not the picture. Put unwanted things in the negative field as a plain noun list ("text overlay, watermark"), never "no …"; Lite has no negative field, so describe the wanted scene positively instead. Do not write duration or aspect ratio into the words.
```

### PixVerse V6 — `pixverse/pixverse-v6`

**Prompt structure.** PixVerse has no standalone V6 prompt guide. Its model page says ([PixVerse V6](https://pixverse.ai/en/model/pixverse-v6), undated; seen 2026-10-23):

- "Write the scene as if you were briefing a camera operator and sound designer at the same time. Identify the subject, setting, camera, motion, light, audio, and final mood."
- **Camera.** "State whether the camera pushes in, pans, tilts, tracks, or circles". V6 "responds well to … slow push-in, handheld tracking shot, low-angle shot, aerial view, POV movement, pan, tilt, orbit, and close-up." "The clearer the camera language, the easier it is for the model to follow."
- **Consistency.** "Repeat the same identity anchors across every shot description." Inconsistent runs come from vague prompts or "too many competing actions."

**Multi-shot.** With `generate_multi_clip_switch`, write "Shot 1, wide shot of … Shot 2, close-up of …" ([Replicate README](https://replicate.com/pixverse/pixverse-v6), undated; seen 2026-10-23). PixVerse's API example uses "Shot 1: … Shot 2: …" ([PixVerse text-to-video API](https://docs.platform.pixverse.ai/text-to-video-13016634e0), undated; seen 2026-10-23).

**References.** In PixVerse's own API, references use named handles ("@robot meets @companion"). Vidra's Replicate endpoint takes only a first and last frame ([Replicate schema](https://replicate.com/pixverse/pixverse-v6)).

**Dialogue and sound.** Audio covers background music, sound effects and character dialogue (Replicate README). No dialogue format is documented.

**Negative prompts.** Replicate has a `negative_prompt` field. PixVerse's own text-to-video API schema lists none (API page).

**Length.** 5,000 characters in PixVerse's API.

```text
Rewrite guidance (PixVerse V6)
Brief it like a camera operator and sound designer: subject, setting, one clear camera move (push-in, pan, tilt, track, orbit), the motion, light, audio and final mood, in literal sentences. For multi-shot, write "Shot 1, wide shot of … Shot 2, close-up of …" and repeat the same identity details (hair, clothing, product) in every shot. Trim competing actions to one main action per shot. Put exclusions in the negative field.
```

### Seedream 5 Pro / 5 Lite — `bytedance/seedream-5-pro`, `bytedance/seedream-5-lite`

**Prompt structure.** BytePlus's Seedream prompt guide is titled for 4.0 to 4.5, though its URL slug says "4-0-5-0". It advises ([Seedream 4.0–4.5 prompt guide](https://docs.byteplus.com/en/docs/modelark/seedream-4-0-5-0-prompt-guide), 2026-09-28; seen 2026-10-23):

- "coherent natural language to describe the subject + action + environment", not keyword lists;
- state the application ("Design a logo for a gaming company…");
- prefer "concise and precise prompts" over "ornate and complex vocabulary".

The Replicate README for 5.0 Lite repeats these tips ([Replicate README](https://replicate.com/bytedance/seedream-5-lite), undated; seen 2026-10-23).

**Editing.** "Use concise, unambiguous instructions… Avoid vague pronouns… specify [what stays] explicitly" ("…keeping its pose unchanged"). Seedream 5.0 adds two location methods ([Seedream 5.0 pro / flash tutorial](https://docs.byteplus.com/en/docs/modelark/seedream-5-0-pro), undated; seen 2026-10-23):

- coordinate tags in the prompt (`<bbox>x1 y1 x2 y2</bbox>`, `<point>`);
- marks drawn on the image ("Add a TV inside the blue box").

**References.** "Replace the character in Image 2 with the character from Image 1, and generate the result in the style of Image 3." Inputs: up to 10 on Pro, up to 14 on Lite ([Replicate schema](https://replicate.com/bytedance/seedream-5-pro), undated; seen 2026-10-23).

**Text.** "Use double quotation marks for the text that needs to appear."

**Series.** "a series", "a set" or a stated number triggers multi-image output.

**Negative prompts.** No field. The guide only shows exclusions inline ("Do not include any text or hand-drawn edges").

**Length.** 4,000 characters; BytePlus recommends under 600 English words (Replicate schema).

```text
Rewrite guidance (Seedream 5)
Write coherent sentences — subject, action, environment, then style, colour, light and composition — and state what the picture is for. Prefer concise, precise wording over stacked adjectives. Put on-image text in double quotes. For edits, name the exact target (no "that one"), the change, and what stays unchanged. Refer to inputs as "Image 1", "Image 2" with each one's role. Keep any <bbox>…</bbox> or <point> tags exactly. Only say "a set of N" if the creator asked for several pictures.
```

### FLUX.2 Pro / Max — `black-forest-labs/flux-2-pro`, `black-forest-labs/flux-2-max`

**Prompt structure.** BFL's docs now centre on FLUX 3. FLUX.2 guidance sits in its quick reference ([BFL prompt reference](https://docs.bfl.ml/guides/prompting_unified_reference), undated; seen 2026-10-23):

- "No negative prompts supported";
- "use quotation marks for exact text";
- hex colour codes for exact colours;
- "JSON structured prompts supported";
- camera models for photoreal looks;
- front-load text and keep it short.

JSON prompts use fields such as scene, subjects (description, position, action), style and color_palette. BFL says to "Choose the format that is easier to maintain" ([JSON prompting](https://docs.bfl.ml/guides/usecases_t2i_json_prompting), undated; seen 2026-10-23). Replicate's README adds: "organize your prompt by importance: subject first, then action, style, and context" ([Replicate README](https://replicate.com/black-forest-labs/flux-2-pro), undated; seen 2026-10-23).

**References.** Up to 8 via API. Point to inputs by index ("Replace the background with the beach in image 3"). This comes from the Replicate README and BFL's editing page ([FLUX.2 image editing](https://docs.bfl.ml/flux_2/flux2_image_editing), undated; seen 2026-10-23).

**Negative prompts.** None. If you write "no text" or "no extra fingers", "it might actually add what you're trying to avoid… Write 'Clean background with natural hands at rest out of frame'" (Replicate README).

**Length.** Not stated.

```text
Rewrite guidance (FLUX.2 Pro / Max)
Order by importance: subject, action, style, context; concise but specific. Use exact hex codes when the creator gives colours. Quote on-image text, keep it short and mention it early. For edits, refer to inputs as "image 1", "image 2" and say which element goes where. Never write "no X" or "without X" — rewrite every exclusion as a positive description of what is there instead. If the creator wrote a JSON prompt, keep it as JSON.
```

### Ideogram 4.5 (generation) and Ideogram Character — `ideogram-ai/ideogram-4-5`, `ideogram-ai/ideogram-character`

**Ideogram 4.5 generation.** Template: "[image type] of [main subject], [action or placement], [setting], [lighting], [style]", plus `text that reads "[exact words]"`. The parts go in order: summary, subject details, pose, secondary elements, setting, light, framing, finish ([Prompt structure](https://docs.ideogram.ai/prompting/prompt-structure), undated; seen 2026-10-23). Habits from [Prompting basics](https://docs.ideogram.ai/prompting/prompting) (updated about 2026-10-20; seen 2026-10-23):

- write in sentences;
- describe what can be seen;
- put the main idea first;
- "Say what you want, not what you don't".

The same endpoint also edits up to 5 source images ([Replicate schema](https://replicate.com/ideogram-ai/ideogram-4-5), undated; seen 2026-10-23). Edits follow the Precise Edit guidance above.

**Ideogram Character.** This is the Ideogram 3.0 Character model. It takes one `character_reference_image` and has a `magic_prompt_option` ([Replicate schema](https://replicate.com/ideogram-ai/ideogram-character), undated; seen 2026-10-23).

- **Length.** "On Ideogram 3.0, keep plain-language prompts under about 150 words (roughly 200 tokens)" (Prompt structure).
- **Negatives.** The Ideogram 3.0 app has a negative prompt setting, but Replicate's schema has no such field ([Fix common problems](https://docs.ideogram.ai/prompting/fix-common-problems), undated; seen 2026-10-23).
- **Prompting tips.** Ideogram's Characters page gives none beyond "Describe the new scene" ([Characters](https://docs.ideogram.ai/organize-and-share/characters), undated; seen 2026-10-23).

```text
Rewrite guidance (Ideogram 4.5 generation / Character)
Open with one sentence naming the image type, main subject and tone; then subject details, pose, setting, lighting, framing and finish, in that order, as full sentences. Put exact on-image words in quotes near the start and say where they sit. Describe only what should be visible and phrase everything positively — never "no", "without" or "not". No weights or flags. For Character, describe only the new scene and keep it under 150 words.
```

### Recraft V4 Styles — `recraft-ai/recraft-v4-styles`

**Prompt structure.** The style comes from 1 to 10 reference images or a `style_id`; "V4 Styles models always require a style". The prompt describes the subject ("a cyclist riding through a city park") ([Recraft V4 Styles API](https://www.recraft.ai/docs/api-reference/models/recraft-v4-styles), undated; seen 2026-10-23).

- **Precise mode.** For "match this exactly" ([V4 Styles launch](https://www.recraft.ai/docs/recraft-models/recraft-v4-styles), released August 2026; seen 2026-10-23).
- **Flexible mode.** Recraft's default. Replicate defaults to precise ([Replicate schema](https://replicate.com/recraft-ai/recraft-v4-styles), undated; seen 2026-10-23).

No prompting guide beyond this exists.

**Negative prompts.** No field. **Length.** 10,000 characters.

```text
Rewrite guidance (Recraft V4 Styles)
The attached style references carry the look, so describe only the subject, action and composition in a short plain sentence or two. Do not add medium, palette or style words that could fight the reference style. Quote any exact lettering.
```

### Bria (FIBO and Bria 3.2) — `bria/fibo`, `bria/image-3.2`

**Prompt structure.** Bria recommends a "shot spec" prompt with these parts:

- Subject;
- Environment;
- Composition;
- Lighting;
- Style/medium;
- Constraints: "What must stay the same, what to avoid, required text".

Source: [Bria image generation best practices](https://docs.bria.ai/image-generation-best-practices) (undated; seen 2026-10-23).

- **Superlatives.** Long stacks of superlatives ("ultra, 8K, masterpiece") are "Usually no" help. Concrete lighting, composition, material and background cues work better.
- **Text.** "Put the exact text verbatim in quotes" with placement and typography.
- **Pipeline.** Prompts become a `structured_prompt` JSON blueprint before rendering. Refine "changing one thing at a time." Replicate's FIBO exposes `structured_prompt` ([Replicate schema](https://replicate.com/bria/fibo), undated; seen 2026-10-23).
- **Bria 3.2.** No prompting guidance from Bria was found; Bria's current docs describe Fibo 2.

**Negative prompts.** Separate `negative_prompt` field on both Replicate endpoints ([Replicate schema](https://replicate.com/bria/image-3.2), undated; seen 2026-10-23). Bria's Lite pipeline lacks it.

**Length.** Not stated.

```text
Rewrite guidance (Bria)
Write a compact shot spec: subject, environment, composition, lighting, style or medium, then constraints and any exact text in quotes with placement. Replace vague superlatives ("ultra", "8K", "masterpiece") with concrete light, angle, material and background cues. Move exclusions to the negative field. If a structured JSON prompt is present, leave it untouched.
```

### MiniMax Music 2.5 — `minimax/music-2.5`

**Availability flag.** MiniMax's current docs list only music-3.0, music-2.6 and cover models. They say: "Starting August 20, 2026, the paid APIs (Music Generation and Lyrics Generation) will no longer be available to new users" ([MiniMax music generation guide](https://platform.minimax.io/docs/guides/music-generation), undated; seen 2026-10-23). Replicate still serves Music 2.5.

**Prompt structure.** Two fields:

- **`lyrics`** (required). 1 to 3,500 characters. Use `\n` between lines and structure tags such as `[Intro]`, `[Verse]`, `[Pre Chorus]`, `[Chorus]`, `[Bridge]`, `[Outro]`, `[Inst]`, `[Solo]`.
- **`prompt`** (optional). Style, mood and scenario, 0 to 2,000 characters.

Source: [Replicate schema](https://replicate.com/minimax/music-2.5) (undated; seen 2026-10-23). MiniMax's API reference lists the same 14 tags for its current models ([MiniMax API reference](https://platform.minimax.io/docs/api-reference/music-generation), undated; seen 2026-10-23).

Replicate's README guide:

- **Prompt pattern.** "[Genre], [Mood/Emotion], [Vocal description], [Tempo], [Key instruments], [Era/Style reference], [Production style]".
- **Lyrics.** Keep each lyric section to 2 to 4 lines. Parentheses carry backing vocals and performance directions ("(whispered)", "(Guitar solo - slow, mournful)").
- **Instrumentals.** Use `[Inst]` tags.
- **Languages.** English and Mandarin are strongest.

**Negative prompts.** No field. **Length.** As above.

```text
Rewrite guidance (MiniMax Music 2.5)
Two parts: the style prompt and the lyrics. Rewrite only the style prompt, as comma-separated "genre, mood, vocal description, tempo (BPM), key instruments, era reference, production style", under 2,000 characters. Leave the creator's lyric words unchanged; you may add section tags ([Verse], [Chorus], [Bridge], [Outro], [Inst]) on their own lines and parenthetical delivery cues like (whispered). Keep sections 2–4 lines. For instrumentals use [Inst] sections with instrument directions in parentheses.
```

### ElevenLabs Music — `elevenlabs/music`

**Prompt structure.** "A prompt answers five questions, whether you intend it to or not: genre, mood, instrumentation, tempo, and production era". Questions left open get "the most average" answer ([Eleven Music best practices](https://elevenlabs.io/docs/overview/capabilities/music/best-practices), undated; seen 2026-10-23).

- **Production words.** Studio vocabulary works ("sidechained", "close-mic'd", "tape saturation").
- **Tempo and key.** The model holds stated BPM and key.
- **Arrangement.** Narrate the arrangement in order ("start with just …, then bring in …").
- **Loops.** Exclusions are the prompt: "no melody — just drums".
- **Use case.** High-level intent prompts ("ad for a sneaker brand") are "often enough".

**Vocals and lyrics.**

- "By default, most music prompts will include lyrics". Add "instrumental only" for none.
- Timing cues work ("lyrics begin at 15 seconds").
- Your own lyrics can be supplied.
- On Replicate, `force_instrumental` defaults to true ([Replicate schema](https://replicate.com/elevenlabs/music), undated; seen 2026-10-23). Vocals need that setting off, whatever the words say.

**Negative prompts.** No field. Exclusions are written inline.

**Length.** Prompt length is not stated ([Compose music API](https://elevenlabs.io/docs/api-reference/music/compose), undated; seen 2026-10-23). Duration on Replicate is 5 to 300 s.

```text
Rewrite guidance (ElevenLabs Music)
Make sure the prompt decides genre, mood, instruments, tempo (BPM, and key if given) and production era; use studio terms for sound (close-mic'd, tape saturation, plate reverb). Narrate the arrangement in order with "start with just …, then bring in …". For loops state bars, BPM, key and what is banned ("no melody, just drums"). Keep any lyrics verbatim and add timing cues only if the creator gave them. Short intent prompts ("ad for a sneaker brand") may stay short.
```

### Stable Audio 2.5 — `stability-ai/stable-audio-2.5`

**Prompt structure.** Start with three building blocks: "Genre/Style", "Tempo (BPM)" and "Overall Mood". Then add:

- primary and supporting instruments;
- rhythm and texture elements;
- production characteristics.

Order matters: "Core style/genre, Key instruments and musical elements, Mood and emotion, Specific details, Additional instructions". Use specific subgenres and precise mood words ("euphoric" rather than "happy"). Optionally add a title ("titled 'Rebellion'"), geography ("Detroit") and a use case ("perfect for a long drive"). Source: [Stable Audio 2.5 prompt guide](https://kb.stability.ai/knowledge-base/stable-audio-2.5-prompt-guide) (undated; seen 2026-10-23).

**Vocals.** Every example in the guide is an instrumental. It gives no lyrics or vocals convention.

**Negative prompts.** No field ([Replicate schema](https://replicate.com/stability-ai/stable-audio-2.5), undated; seen 2026-10-23).

**Length.** Not stated. Duration is up to 190 s on Replicate.

```text
Rewrite guidance (Stable Audio 2.5)
Order: specific subgenre and style, key instruments (lead, supporting, rhythm, texture), mood in precise words (euphoric, melancholic, soaring), BPM, production character (lo-fi, pristine, vintage, layered), then use case ("perfect for …"). Avoid repeating the same adjective; use era or place references when the creator implies them. Do not add lyrics or vocals the creator did not ask for.
```

---

## Gaps

- **Grok Imagine (xAI).** No official prompting guidance. xAI documents only API mechanics and example prompts. The "describe the action, not the scene" tips are Replicate's.
- **Recraft V4.1 and V4 Styles.** No formal prompt guide. Guidance is limited to the launch posts, the quote rule for text, and the API's unsupported-field list.
- **Seedance 2.0 reference tokens and punctuation conflict.**
  - Replicate says `[Image1]` and double quotes for dialogue.
  - BytePlus writes "Image 1", "@Image 1" and `<Image_N>`, and its symbol table says dialogue goes in `{}`, music in `（）` and sound in `< >`.
  - BytePlus's own examples mostly use double quotes.
  - Which token the Replicate wrapper actually binds is unverified.
- **Kling reference tokens conflict.**
  - The Replicate schemas for 3.0 Omni and O1 use `<<<image_1>>>`.
  - The O1 Replicate README shows `@Element1`/`@Image1`.
  - Kling's app guides use `@Image1`/`@Element`.
  - The 3.0 Omni README lists a `negative_prompt` its schema lacks.
- **Wan 3 negatives.** Replicate exposes `negative_prompt`. Alibaba's API documents none, and its guide puts negatives inside the prompt. Whether the Replicate field reaches the model is unverified.
- **PixVerse V6.**
  - No standalone prompt guide, only the model page and API examples.
  - Replicate's `negative_prompt` has no counterpart in PixVerse's own text-to-video schema.
  - No dialogue format is documented.
- **Google negatives conflict across models.** Veo's guide says list nouns in the negative field and avoid "no". Gemini Omni has no field and recommends "No dialogue"-style sentences in the prompt. Both are Google, for different mechanisms.
- **Veo 3.1 availability.** The Gemini API preview shut down on 2026-10-22. Replicate still lists the endpoints. How Replicate serves them afterwards was not checked.
- **Gemini Omni on Replicate.** Google documents `<IMAGE_REF_n>` and related tags. Replicate does not say whether its wrapper passes them through.
- **Ideogram 4.5 Precise Edit references.** The Ideogram app binds references with `@img_N` pills. Neither Ideogram nor Replicate documents how API references are named in the prompt.
- **Nano Banana 2.1.** No 2.1-specific guide. The Nano Banana family guide applies. No prompt length limit is published.
- **GPT Image.** OpenAI's 2026-04-21 cookbook guide is marked archived. The current guide (undated) covers 2.5 and applies to 2.
- **Seedream 5.** No 5.0-specific prompt guide. BytePlus's guide covers 4.0 to 4.5, and the 5.0 tutorial covers only interactive editing and layers. Replicate's `seedream-5` slug no longer resolves; `seedream-5-pro` and `seedream-5-lite` do.
- **FLUX.2.** BFL's guides now target FLUX 3. FLUX.2 guidance is a short quick-reference block.
- **Bria 3.2.** No prompting guidance found. Bria's docs now describe Fibo 2.
- **MiniMax Music 2.5.**
  - MiniMax's current docs cover music-3.0 and 2.6 only.
  - Paid API access is closed to new users since 2026-08-20.
  - 2.5 prompt guidance exists only in Replicate's README.
- **ElevenLabs v3.** ElevenLabs now recommends v4. v3 guidance is inherited from the v4 section.
- **Lyria.** Google's docs now describe Lyria 3.5 and Lyria 3 Clip. Replicate's `google/lyria-3` is the 30-second Clip. The prompt guide covers both.
- **Stable Audio 2.5.** The official guide covers instrumental music only. It has no vocals or lyrics convention and no negative-prompt guidance.
- **Ideogram Character.** This is an Ideogram 3.0 model. Ideogram's Characters page has no prompting tips beyond "Describe the new scene". The 150-word limit comes from the general Ideogram 3.0 guidance.
- **Prompt length not published** for Gemini Omni, Grok extension, Nano Banana, Veo, Lyria, FLUX.2, Bria, ElevenLabs Music and Stable Audio.
