# One creative space for every kind of media

Research date and source access date: **2026-10-19, America/Chicago**.

**Question.** How should Vidra keep pictures, clips, audio and any later input or output in one creative space? One interface should handle every media type, without separate modes, and without breaking as models and inputs change. Bryce set the bar twice. First: one consistent UI "without breaking". Then: "image mode should have its own logic obviously but we shouldnt change the whole ui or load a new space just because the generated outputs change."

**Scope and method.**

- **Sources.** Official documentation, help centers, changelogs, launch posts and first-party product pages for 19 products: Adobe Firefly, Runway, Krea, Magnific (Freepik's name since April 2026), Higgsfield, Leonardo, Google Flow, OpenAI's Sora, Midjourney, Luma, Figma Weave, Canva, CapCut, Ideogram, Recraft, Kling, ElevenLabs, Descript and the Gemini app. Apple's guidance on modality is the one design-principle source.
- **Live pages.** Where a help page lagged the product, the live product page was opened signed out and is cited as "live UI". Nothing was uploaded, generated, bought or signed into. Secondary write-ups were used only as leads.
- **What this records.** Like the [2026-10-09 study](2026-10-09-competitive-workflows.md), this records documented and observed behaviour. It does not measure output quality, demand or completion rates. That study covered credits, recovery and positioning; this one covers how the interface carries mixed media.
- **Citations.** Each link is followed by the source's own date (or "undated") and the date it was seen.

## Recommendation in brief

**Modes are logic, not location.** Keep `/app` as Vidra's only creative space.

- **What may change.** Choosing to make a picture, a clip, audio or captions changes only what the selected capability profile governs:
  - the input tiles;
  - whether words are needed;
  - the model list;
  - the setting chips;
  - the primary button's label.
- **What never changes.** It never changes the route, the panels, the composer's place, the feed, the viewer or the library.
- **Studio.** Studio's separate route, roster and planner retire into this one space.

Evidence for the rule:

- **In-place switching is where 2026 converged.** The newest releases put one composer on screen whose output switch swaps input slots and settings in place: Firefly's new workspace, Runway's Tool mode, Kling 4.0, Flow, Midjourney, Recraft, Leonardo, CapCut's Video Studio and ElevenLabs' playground.
- **Changing place has a visible cost.** Some products still send people to another page, app or product when the output changes: Ideogram's per-type apps, Krea's separate Image and Video tools, Magnific's six audio tools, Higgsfield's per-type pages, Firefly's audio pages, Flow Music and the Sora split. These show the cost.
- **Split-off pages get folded back.** New output types tend to arrive as new pages, and vendors spend the following months folding them back into one place.

Vidra's profiles already hold the per-mode logic. What would break as models change is the client's hard-coded lists.

## Where each platform sits

| Platform               | Output switching in place                                                                                                                                                                                                                                                                                                                                                                                                                            | Where switching still changes place                                                                                                                                                                                                                                                                                                                                                                                                                    | One library across kinds                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kling**              | The 4.0 home keeps the same input box and URL when the output changes. Only the model, mode, input slots and settings summary swap ([app home](https://kling.ai/app/) (live UI, signed out; seen 2026-10-19)). Kling 4.0 merged inputs previously spread across the toolbar into one box for image, video and audio references ([Kling 4.0 release](https://kling.ai/release-note/release-notes/Kling_4?type=dialog) (2026-10-15; seen 2026-10-19)). | Text-to-audio and video-to-audio are separate pages, and mixing is sent to outside editors ([adding sound](https://kling.ai/blog/add-ai-video-sound-effects-voiceovers) (2026-06-26; seen 2026-10-19)).                                                                                                                                                                                                                                                | My, Shared and Member assets ([team features](https://kling.ai/release-note/release-notes/v3c5osl0fp?type=dialog) (2026-03-16; seen 2026-10-19)).                                                                             |
| **Runway**             | Tool mode has Image, Video and Audio tabs on one panel. An image model appears only while Image is selected ([GPT Image 2](https://help.runwayml.com/hc/en-us/articles/51111417337363-Creating-images-with-GPT-Image-2) (2026-08-24; seen 2026-10-19)).                                                                                                                                                                                              | Many operations are separate App pages. Expand Video opens Edit Studio ([Gen-4 Video](https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4-Video) (2026-09-11; seen 2026-10-19)), and Upscale Image exists only as an App ([upscaling](https://help.runwayml.com/hc/en-us/articles/55474983733395-Upscaling-videos-and-images) (2026-09-24; seen 2026-10-19)).                                                               | Assets holds generations and uploads, including audio, filtered by media type ([assets](https://help.runwayml.com/hc/en-us/articles/4408611980563-Managing-assets) (2026-08-25; seen 2026-10-19)).                            |
| **Adobe Firefly**      | The new workspace (beta, August 2026) has an Image or Video choice in one action bar. Generate and Timeline are tabs of one project ([overview](https://helpx.adobe.com/firefly/web/unified-generation-and-editing-experience/generation-and-editing-experience-overview.html) (2026-08-19; seen 2026-10-19)).                                                                                                                                       | Speech, music and sound effects are separate pages ([workspace overview](https://helpx.adobe.com/firefly/web/get-started/access-the-app/firefly-workspace-overview.html) (2026-08-07; seen 2026-10-19)). Opening a Boards video in the editor creates a new project ([Boards: add videos](https://helpx.adobe.com/firefly/web/create-mood-boards/firefly-boards/add-videos.html) (2026-08-18; seen 2026-10-19)).                                       | One generation history filtered by Images, Videos and Audio ([history](https://helpx.adobe.com/firefly/web/access-your-files/view-generation-history.html) (2026-06-16; seen 2026-10-19)).                                    |
| **Google Flow**        | Image or Video is chosen in the prompt box's model menu. All results share one project grid ([create videos](https://support.google.com/flow/answer/16353334?hl=en) (undated; seen 2026-10-19)).                                                                                                                                                                                                                                                     | Music lives in a separate product, Flow Music ([Flow Music](https://support.google.com/flow/answer/17083868?hl=en) (undated; seen 2026-10-19)).                                                                                                                                                                                                                                                                                                        | The rail filters All media, Images, Videos, Characters, Scenes and Uploads. Each asset has its own version history ([projects and assets](https://support.google.com/flow/answer/16935308?hl=en) (undated; seen 2026-10-19)). |
| **Midjourney**         | With a picture in the Imagine bar, toggles switch between making a video and making a still ([Creating on Web](https://docs.midjourney.com/hc/en-us/articles/33390732264589-Creating-on-Web) (2026-08-31; seen 2026-10-19)).                                                                                                                                                                                                                         | The full Editor is its own tab ([Editor](https://docs.midjourney.com/hc/en-us/articles/32764383466893-Editor) (2026-09-02; seen 2026-10-19)). New versions launch on a separate alpha site first ([Version](https://docs.midjourney.com/hc/en-us/articles/32199405667853-Version) (2026-09-01; seen 2026-10-19)).                                                                                                                                      | Organize filters by media type ([organizing](https://docs.midjourney.com/hc/en-us/articles/33329462451469-Organizing-Your-Creations) (2026-06-11; seen 2026-10-19)).                                                          |
| **Recraft**            | Image, Vector, Video, Mockup and Image set are generation types in one Create tab. Video lands on the same canvas ([generate a video](https://www.recraft.ai/docs/recraft-studio/video-generation/how-to-generate-a-video) (undated; seen 2026-10-19)).                                                                                                                                                                                              | None found.                                                                                                                                                                                                                                                                                                                                                                                                                                            | History filters Image or Video ([history](https://www.recraft.ai/docs/recraft-studio/history) (undated; seen 2026-10-19)).                                                                                                    |
| **Leonardo**           | The home prompt bar's Image and Video tabs swap only the chips. The Image, Video, Audio and 3D shortcuts all open one `/generate` route with a different default model ([app home](https://app.leonardo.ai/) (live UI, signed out; seen 2026-10-19)).                                                                                                                                                                                                | Upscaler, Flow State and Blueprints keep their own pages ([Pro Upscaler](https://intercom.help/leonardo-ai/en/articles/14698341-how-to-use-pro-upscaler) (2026-08-25; seen 2026-10-19)).                                                                                                                                                                                                                                                               | One Library for images, video and 3D. Audio is undocumented ([collections](https://intercom.help/leonardo-ai/en/articles/9047341-collections) (2026-02-18; seen 2026-10-19)).                                                 |
| **CapCut**             | Video Studio's Creation mode (Auto, Image, Video) changes only the placeholder, suggestions and settings ([Video Studio](https://www.capcut.com/ai-creator/agent) (live UI, signed out; seen 2026-10-19)).                                                                                                                                                                                                                                           | Design Studio, Video Studio and the editor are separate spaces. Edit More hands work to the desktop editor ([Video Studio page](https://www.capcut.com/tools/video-studio) (undated; seen 2026-10-19)).                                                                                                                                                                                                                                                | Per-tool histories and cloud storage only.                                                                                                                                                                                    |
| **ElevenLabs**         | An Image/Video toggle sits in one prompt box ([Image & Video](https://elevenlabs.io/docs/eleven-creative/playground/image-video) (undated; seen 2026-10-19)). Inside a Studio 4.0 project, one Create menu offers video, image, speech, sound effects and music ([Studio](https://elevenlabs.io/docs/eleven-creative/products/studio) (undated; seen 2026-10-19)).                                                                                   | Outside Studio, speech, sound effects and music are separate pages. Finishing moves the asset into a Studio project.                                                                                                                                                                                                                                                                                                                                   | Split across the playground history, the Studio library and platform Assets ([assets](https://elevenlabs.io/docs/overview/administration/assets) (undated; seen 2026-10-19)).                                                 |
| **Descript**           | Image and Video are tabs in one pane ([generate media](https://help.descript.com/generative-media/generate-media) (2026-09-08; seen 2026-10-19)).                                                                                                                                                                                                                                                                                                    | Audio is a separate pane ([generate audio](https://help.descript.com/generative-media/generate-audio) (2026-09-09; seen 2026-10-19)). Switching tabs starts a fresh prompt, and history is kept per type.                                                                                                                                                                                                                                              | The Media Library filters Audio, Video and Image ([media library](https://help.descript.com/add-and-manage-media/media-library-overview) (2026-10-08; seen 2026-10-19)).                                                      |
| **Luma**               | Image, video and audio tools all land on the same board ([toolbar](https://lumalabs.ai/learning-center/articles/luma-UI-the-toolbar) (2026-03-09; seen 2026-10-19)).                                                                                                                                                                                                                                                                                 | Ad Variants opens from a separate Discover tab ([Variants](https://lumalabs.ai/news/introducing-luma-variants) (2026-10-01; seen 2026-10-19)).                                                                                                                                                                                                                                                                                                         | Organised per board. Boards cap at 10,000 objects ([Pages](https://lumalabs.ai/news/new-luma-pages) (2026-07-28; seen 2026-10-19)).                                                                                           |
| **Gemini app**         | One chat; the tools menu was unified for images, video and music ([I/O 2026](https://blog.google/innovation-and-ai/technology/ai/google-io-2026-all-our-announcements/) (2026-05-20; seen 2026-10-19)).                                                                                                                                                                                                                                              | Google Pics launched as a separate image tool for testers (same source).                                                                                                                                                                                                                                                                                                                                                                               | Images and videos are kept together.                                                                                                                                                                                          |
| **Higgsfield**         | Cinema Studio's Image/Video tab keeps the URL and the composer's place ([Cinema Studio](https://higgsfield.ai/generate) (live UI, signed out; seen 2026-10-19)).                                                                                                                                                                                                                                                                                     | Image, Video and Audio are separate pages with different layouts ([home](https://higgsfield.ai/) (live UI, signed out; seen 2026-10-19)). Lip sync and voice are separate tools ([lip sync and voiceover](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-lipsync-voiceover-and-aspect-ratios) (2026-08-01; seen 2026-10-19)).                                                                                                    | Assets filters Image, Video and Audio ([account](https://higgsfield.ai/creator-hub/help-center/getting-started/whats-in-my-higgsfield-account) (2026-07-30; seen 2026-10-19)).                                                |
| **Magnific (Freepik)** | Video Generator modes switch inside its panel. In Spaces, each node owns its output ([nodes](https://www.magnific.com/ai/docs/nodes-and-connections) (undated; seen 2026-10-19)).                                                                                                                                                                                                                                                                    | Going from Image to Video changes the route and replaces the tool panel ([Video Generator](https://www.magnific.com/app/ai-video-generator) (live UI, signed out; seen 2026-10-19)). Audio is split across six tools ([audio tools](https://www.magnific.com/app/tools/audio) (live UI, signed out; seen 2026-10-19)).                                                                                                                                 | Project History holds image, video and audio from every tool ([projects](https://www.magnific.com/ai/docs/projects) (undated; seen 2026-10-19)).                                                                              |
| **Krea**               | Seedance Studio and Realtime switch between Image and Video next to the prompt ([Seedance Studio](https://www.krea.ai/docs/user-guide/features/seedance-studio) (undated; seen 2026-10-19)).                                                                                                                                                                                                                                                         | Image and Video are separate tools with different composers ([image](https://www.krea.ai/docs/user-guide/features/krea-image) (undated; seen 2026-10-19)).                                                                                                                                                                                                                                                                                             | An Assets grid; type filters are undocumented.                                                                                                                                                                                |
| **Ideogram**           | Model swaps and video input modes happen in place ([create videos](https://docs.ideogram.ai/create/video) (2026-10-15; seen 2026-10-19)).                                                                                                                                                                                                                                                                                                            | Image and Video runs go to different apps ([create](https://docs.ideogram.ai/create/create) (2026-10-19; seen 2026-10-19)). Edit, Remove background and Upscale each open a separate app ([edit](https://docs.ideogram.ai/edit/edit) (2026-10-19; seen 2026-10-19)).                                                                                                                                                                                   | Images and videos together, with no type filter ([library](https://docs.ideogram.ai/organize-and-share/assets) (2026-10-19; seen 2026-10-19)).                                                                                |
| **Figma Weave**        | No switch is needed: each node owns its output ([nodes](https://help.weavy.ai/en/articles/12292386-understanding-nodes) (2026-03-29; seen 2026-10-19)).                                                                                                                                                                                                                                                                                              | Timeline work opens a full-window compositor ([timeline editor](https://help.weavy.ai/en/articles/14689260-timeline-editor) (2026-04-20; seen 2026-10-19)). Video and 3D tools won't run inside Figma Design ([tools](https://help.weavy.ai/en/articles/12267755-tools) (2026-10-19; seen 2026-10-19)).                                                                                                                                                | Results stay inside their nodes.                                                                                                                                                                                              |
| **Canva**              | A content-type choice in the Canva AI box ([Canva AI](https://www.canva.com/help/using-canva-ai/) (undated; seen 2026-10-19)).                                                                                                                                                                                                                                                                                                                       | Dream Lab works only from the homepage ([Dream Lab](https://www.canva.com/help/generate-with-dreamlab/) (undated; seen 2026-10-19)). The AI tool pages open results as a new design in a new tab ([AI tools pages](https://www.canva.com/help/ai-tools-pages/) (undated; seen 2026-10-19)).                                                                                                                                                            | The uploads filter covers Images and Videos only ([uploads](https://www.canva.com/help/manage-uploads/) (undated; seen 2026-10-19)).                                                                                          |
| **OpenAI Sora**        | Sora 1 had an Image option in its prompt window ([creating images, archived](https://web.archive.org/web/20260327070818/https://help.openai.com/en/articles/10877094-creating-images-on-sora) (archived 2026-03-27; seen 2026-10-19)).                                                                                                                                                                                                               | Sora 1 and Sora 2 ran as separate experiences, and images moved out to ChatGPT ([Sora 1 sunset, archived](https://web.archive.org/web/20260328185054/https://help.openai.com/en/articles/20001071-sora-1-sunset-faq) (archived 2026-03-28; seen 2026-10-19)). The app closed on 2026-04-26 ([discontinuation](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation) (updated about August 2026; seen 2026-10-19)). | The Sora 1 library mixed images and videos.                                                                                                                                                                                   |

## Patterns, with evidence

### 1. One composer whose typed attachments accept any media

**Most 2026 composers take pictures, clips and audio in one box.** They differ in how they record what each attachment is for. There are three ways.

**Typed slots.**

- **Firefly's new action bar.** Video has First frame, Last frame and Reference slots; pictures take a Reference ([generate and edit](https://helpx.adobe.com/firefly/web/unified-generation-and-editing-experience/generate-and-edit-content.html) (2026-08-19; seen 2026-10-19)).
- **Midjourney.** The Imagine bar has drop sections for an Edit Model reference, Style Reference, Image Prompt and Animate. In video mode they become a starting frame, an ending frame and motion ([Creating on Web](https://docs.midjourney.com/hc/en-us/articles/33390732264589-Creating-on-Web) (2026-08-31; seen 2026-10-19); [Video](https://docs.midjourney.com/hc/en-us/articles/37460773864589-Video) (2026-08-31; seen 2026-10-19)).
- **Flow.** Frames (start and end drop zones) is separate from Ingredients (images, video, characters and voices) ([create videos](https://support.google.com/flow/answer/16353334?hl=en) (undated; seen 2026-10-19)).
- **Leonardo.** Its attach button asks whether the picture is a reference, a start frame or an end frame ([start and end frames](https://intercom.help/leonardo-ai/en/articles/12504736-creating-videos-with-start-frames-and-end-frames) (2026-08-25; seen 2026-10-19)).
- **Krea.** Its video composer has add-image, add-video and add-audio tiles plus start-frame and end-frame chips ([video](https://www.krea.ai/video) (live UI, signed out; seen 2026-10-19)).
- **ElevenLabs.** It offers start-frame, end-frame and image-reference slots per model ([Image & Video](https://elevenlabs.io/docs/eleven-creative/playground/image-video) (undated; seen 2026-10-19)).
- **Magnific.** Its Video Generator has start and end image slots, plus a media tray whose contents follow the model ([Video Generator](https://www.magnific.com/app/ai-video-generator) (live UI, signed out; seen 2026-10-19)).

**Reference bins named in the words.**

- **Runway.** It labels attachments Image n, Video n and Audio n so the words can name them; roles depend on each model's creation mode ([reference media](https://help.runwayml.com/hc/en-us/articles/52963720640275-Using-reference-media-to-guide-your-generations) (2026-06-27; seen 2026-10-19); [Seedance 2.5](https://help.runwayml.com/hc/en-us/articles/53542207042323-Creating-with-Seedance-2-5) (2026-10-13; seen 2026-10-19)).
- **Kling 4.0.** Omni Reference numbers up to 15 mixed assets for the words to name. Keyframes uses typed first, middle and last frame slots instead, and the two cannot be combined in one task ([Kling 4.0 guide](https://kling.ai/quickstart/kling-4-model-user-guide) (2026-10-14; seen 2026-10-19)).
- **Ideogram.** It blocks a run whose words mention a reference the chosen model will not use ([reference images](https://docs.ideogram.ai/create/reference-images) (2026-10-19; seen 2026-10-19)).

**Typed ports.**

- **Weave and Magnific Spaces.** Both colour-code ports by media type and refuse connections between incompatible ports ([connecting edges](https://help.weavy.ai/en/articles/14688276-connecting-edges-wires) (2026-04-20; seen 2026-10-19); [nodes](https://www.magnific.com/ai/docs/nodes-and-connections) (undated; seen 2026-10-19)).

**For Vidra.** Typed roles survive model churn, because a new model only declares which roles it accepts. Bins that put each item's job into the words need per-model rules for blocking and rewriting (Ideogram, Kling). Vidra's profiles already declare roles and accepted kinds. Keep typed roles. Give large reference bins numbered captions that the words can name.

### 2. Model and action pickers filtered by the inputs and the output wanted

**Every product filters by output.**

- Runway shows image models only in Image mode ([GPT Image 2](https://help.runwayml.com/hc/en-us/articles/51111417337363-Creating-images-with-GPT-Image-2) (2026-08-24; seen 2026-10-19)).
- Kling scopes its model menu to the chosen output ([app home](https://kling.ai/app/) (live UI, signed out; seen 2026-10-19)).
- Recraft's model list follows the generation type ([generate a video](https://www.recraft.ai/docs/recraft-studio/video-generation/how-to-generate-a-video) (undated; seen 2026-10-19)).

**Few products filter by what is attached.**

- Kling greys out the models the current input mode cannot use ([app home](https://kling.ai/app/) (live UI, signed out; seen 2026-10-19)).
- Descript shows unsupported options as disabled buttons ([generate media](https://help.descript.com/generative-media/generate-media) (2026-09-08; seen 2026-10-19)).

**Most others correct after the fact.**

- Flow moves you to a compatible model when it detects an unsupported feature ([Flow FAQ](https://support.google.com/flow/answer/16353333?hl=en) (undated; seen 2026-10-19)).
- Midjourney strips parameters that don't apply ([web updates](https://updates.midjourney.com/web-updates-4/) (2026-01-20; seen 2026-10-19)).
- Ideogram marks extra references "Not used" and clears them when the model takes none ([reference images](https://docs.ideogram.ai/create/reference-images) (2026-10-19; seen 2026-10-19)).
- Runway greys out the Generate button and gives the reason on hover ([Seedance 2.0](https://help.runwayml.com/hc/en-us/articles/50488490233363-Creating-with-Seedance-2-0) (2026-10-15; seen 2026-10-19)).
- Krea's Studio refuses to switch from Video to Image until video and audio references are removed ([Seedance Studio](https://www.krea.ai/docs/user-guide/features/seedance-studio) (undated; seen 2026-10-19)).

**Capability tags and Auto are common.**

- **Capability tags.** Magnific's picker filters by features such as lip sync, start and end frame, and audio references ([Video Generator](https://www.magnific.com/app/ai-video-generator) (live UI, signed out; seen 2026-10-19)). Krea tags each model with its inputs ([video](https://www.krea.ai/video) (live UI, signed out; seen 2026-10-19)).
- **Auto that picks an editing model.** Ideogram and Recraft both offer Auto, and both switch to an editing model when a reference is attached ([Ideogram models](https://docs.ideogram.ai/create/models) (2026-10-19; seen 2026-10-19); [Recraft editing](https://www.recraft.ai/docs/recraft-studio/image-editing/editing-images-with-natural-language) (undated; seen 2026-10-19)).
- **Other Auto options.** Leonardo, Krea and CapCut also offer Auto ([Leonardo](https://intercom.help/leonardo-ai/en/articles/8942360-how-to-generate-images-with-leonardo-ai) (2026-02-17; seen 2026-10-19); [Krea image](https://www.krea.ai/docs/user-guide/features/krea-image) (undated; seen 2026-10-19)).
- **Agents.** Agents choose models per step ([Runway Agent](https://help.runwayml.com/hc/en-us/articles/51601639579667-Creating-with-Runway-Agent) (2026-10-13; seen 2026-10-19); [Firefly AI Assistant](https://helpx.adobe.com/firefly/web/firefly-ai-assistant/ai-assistant-faq.html) (2026-09-24; seen 2026-10-19)).
- **Higgsfield.** It defaults each model family to its latest version ([which model](https://higgsfield.ai/creator-hub/help-center/ai-models/which-ai-model-should-i-use) (2026-08-01; seen 2026-10-19)).
- **Canva.** It has no model picker at all, only a quality tier with automatic fallback ([AI quality](https://www.canva.com/en_gb/help/canva-ai-quality-tiers-standard-premium-ultra/) (undated; seen 2026-10-19)).

**Action menus can follow the input.**

- Ideogram lists only the tools compatible with the chosen input ([apps](https://docs.ideogram.ai/create/apps) (2026-10-19; seen 2026-10-19)).
- Runway's node Swap lists only compatible nodes ([workflows](https://help.runwayml.com/hc/en-us/articles/45763528999699-Introduction-to-Workflows) (2026-07-16; seen 2026-10-19)).

**For Vidra.** Group actions by what they make, and grey out models by what is attached. Don't hide, auto-switch or block. This matches Vidra's greyed-out rule and reuses its existing input-aware candidate check. Auto is common enough to be expected, and Studio already routes that way.

### 3. Mode-less and mode-switch designs: in place versus another place

**The pattern to keep: one composer switches its output in place.**

| Product                    | What the output switch changes                                                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kling 4.0                  | The placeholder, model chip, mode chip, input slots and settings summary. The box and URL stay ([app home](https://kling.ai/app/) (live UI, signed out; seen 2026-10-19)).                                                                                 |
| Firefly's new workspace    | Image or Video in one action bar. Generate and Timeline are tabs of one project ([overview](https://helpx.adobe.com/firefly/web/unified-generation-and-editing-experience/generation-and-editing-experience-overview.html) (2026-08-19; seen 2026-10-19)). |
| Runway's Tool mode         | Tabs on one panel; results stay in the same session ([GPT Image 2](https://help.runwayml.com/hc/en-us/articles/51111417337363-Creating-images-with-GPT-Image-2) (2026-08-24; seen 2026-10-19)).                                                            |
| Flow                       | The model menu inside the prompt box.                                                                                                                                                                                                                      |
| Midjourney                 | Toggles inside the Imagine bar.                                                                                                                                                                                                                            |
| Recraft                    | Generation types inside one Create tab.                                                                                                                                                                                                                    |
| Leonardo                   | Tabs that swap only the chips.                                                                                                                                                                                                                             |
| CapCut Video Studio        | Placeholder, suggestions and settings only ([Video Studio](https://www.capcut.com/ai-creator/agent) (live UI, signed out; seen 2026-10-19)).                                                                                                               |
| Higgsfield's Cinema Studio | Image/Video tab; URL and composer stay ([Cinema Studio](https://higgsfield.ai/generate) (live UI, signed out; seen 2026-10-19)).                                                                                                                           |
| ElevenLabs                 | A toggle in the prompt box.                                                                                                                                                                                                                                |

Sources for the uncited rows are in the table above.

**The anti-pattern: changing output moves you to another page, app or product.**

| Product               | Where the switch sends you                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ideogram              | Image and Video runs go to different apps, each with its own panel and feed ([create](https://docs.ideogram.ai/create/create) (2026-10-19; seen 2026-10-19)).                                                           |
| Krea                  | Image and Video are separate tools with different composers. Picture results send you to the Video, Edit or Enhance tool ([image](https://www.krea.ai/docs/user-guide/features/krea-image) (undated; seen 2026-10-19)). |
| Magnific              | Going from Image to Video changes the route and replaces the whole tool panel. Audio is six separate tools ([audio tools](https://www.magnific.com/app/tools/audio) (live UI, signed out; seen 2026-10-19)).            |
| Higgsfield's main app | Pictures use a bottom prompt bar, while video and audio use a stacked side panel on other pages ([home](https://higgsfield.ai/) (live UI, signed out; seen 2026-10-19)).                                                |
| Firefly               | Speech, music and sound effects are pages of their own ([workspace overview](https://helpx.adobe.com/firefly/web/get-started/access-the-app/firefly-workspace-overview.html) (2026-08-07; seen 2026-10-19)).            |
| Google                | Music is a separate product, Flow Music ([Flow Music](https://support.google.com/flow/answer/17083868?hl=en) (undated; seen 2026-10-19)).                                                                               |
| ElevenLabs            | Speech, sound effects and music are separate pages outside a Studio project ([Image & Video](https://elevenlabs.io/docs/eleven-creative/playground/image-video) (undated; seen 2026-10-19)).                            |
| Canva                 | Generation spread into five overlapping video generators and homepage-only tools ([Magic Video](https://www.canva.com/help/magic-video/) (undated; seen 2026-10-19)).                                                   |

**How each design holds up as models are added.**

- **In-place designs take new models as picker rows.** Flow added Gemini Omni Flash and Omni 1.1 as menu entries in the same box ([I/O 2026 Flow](https://blog.google/innovation-and-ai/models-and-research/google-labs/flow-updates/) (2026-05-19; seen 2026-10-19); [new creative controls](https://blog.google/innovation-and-ai/models-and-research/google-labs/new-creative-controls-google-flow/) (2026-08-27; seen 2026-10-19)). When Midjourney's Edit Model replaced Omni Reference, the bar swapped one slot rather than changing its layout ([Omni Reference](https://docs.midjourney.com/hc/en-us/articles/36285124473997-Omni-Reference) (2026-09-01; seen 2026-10-19)).
- **Place-based designs take new output types as new pages.**
  - Firefly's August 2026 speech, music and sound-effects launch arrived as pages, not inside the new bar ([Adobe blog](https://blog.adobe.com/en/publish/2026/08/20/adobe-firefly-expands-its-creative-ai-studio-generate-music-speech-and-sound-effects-in-one-place) (2026-08-20; seen 2026-10-19)).
  - Magnific, Kling and Canva grew new tools the same way.
- **The direction in 2026 is consolidation.**
  - Flow folded Whisk and ImageFX into one workspace in February ([Flow updates](https://blog.google/innovation-and-ai/models-and-research/google-labs/flow-updates-february-2026/) (2026-02-25; seen 2026-10-19)).
  - Runway removed its All Tools page in April and folded its standalone tools into Apps and Tool mode ([deprecated tools](https://help.runwayml.com/hc/en-us/articles/40213860628371-Deprecated-Standalone-Tools) (2026-08-05; seen 2026-10-19)).
  - Firefly opened its unified workspace in August, and Kling 4.0 shipped one input box in October.
  - OpenAI retired Sora 1, saying one experience reduces complexity, and later closed Sora entirely ([Sora 1 sunset, archived](https://web.archive.org/web/20260328185054/https://help.openai.com/en/articles/20001071-sora-1-sunset-faq) (archived 2026-03-28; seen 2026-10-19); [discontinuation](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation) (updated about August 2026; seen 2026-10-19)). OpenAI gave no reason for the closure beyond those pages.
- **Apple names the failure.** Its modality guidance warns designers to "avoid creating a modal experience that feels like an app within your app" ([Apple HIG: Modality](https://developer.apple.com/design/human-interface-guidelines/modality) (last changed 2023-12-05; seen 2026-10-19)).

**In-place switching can still be done badly.**

- Descript starts a fresh prompt when you switch between Image and Video, and keeps a separate history for each ([generate media](https://help.descript.com/generative-media/generate-media) (2026-09-08; seen 2026-10-19)).
- Recraft's settings don't carry across generation types ([prompt panel](https://www.recraft.ai/docs/recraft-studio/image-generation/prompt-panel) (undated; seen 2026-10-19)).
- Krea blocks the switch until references are removed.

Vidra's drafts already keep words and inputs when the action changes; that must stay.

### 4. Feed, canvas, node graph or timeline

**Feeds carry mixed media in one stream with a type filter.**

- Runway keeps each session as a feed ([sessions](https://help.runwayml.com/hc/en-us/articles/33545310653203-Generating-with-Sessions) (2026-07-16; seen 2026-10-19)).
- Flow uses one project grid with Scenebuilder for sequences ([edit videos and build scenes](https://support.google.com/flow/answer/16935718?hl=en) (undated; seen 2026-10-19)).
- Midjourney's Create page is one feed ([website overview](https://docs.midjourney.com/hc/en-us/articles/33329460426765-Website-Overview) (2026-06-11; seen 2026-10-19)).
- Kling 4.0 adds grid and list views ([Kling 4.0 release](https://kling.ai/release-note/release-notes/Kling_4?type=dialog) (2026-10-15; seen 2026-10-19)).
- The Gemini app is one chat.

**Where the canvas is the only space, it hits limits.**

- Luma puts all work on boards holding images, video, audio and text. Boards cap at 10,000 objects, so Luma added Pages to split them ([Welcome to Luma Agents](https://lumalabs.ai/learning-center/articles/welcome-to-luma-agents) (2026-03-09; seen 2026-10-19); [Pages](https://lumalabs.ai/news/new-luma-pages) (2026-07-28; seen 2026-10-19)).
- Recraft's project canvas takes video as a playable layer, but its frames cannot hold video ([frames](https://www.recraft.ai/docs/recraft-studio/frames/introduction-to-frames) (undated; seen 2026-10-19)).

**Everywhere else, the canvas or graph is a second space for experts, beside the generator.**

| Product    | Canvas or graph, and what its maker says it is for                                                                                                                                                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Magnific   | Spaces is pitched at professionals who need structure and repeatability; one-click tools are for everyone else ([introducing Spaces](https://www.magnific.com/blog/introducing-spaces/) (2025-11-04; seen 2026-10-19)).                                                                                                                                              |
| Runway     | Workflows are for repeatable pipelines, and the standard interface is for quick iteration ([workflows](https://help.runwayml.com/hc/en-us/articles/45763528999699-Introduction-to-Workflows) (2026-07-16; seen 2026-10-19)).                                                                                                                                         |
| Firefly    | Boards is an ideation and moodboard canvas, with no audio object ([about Boards](https://helpx.adobe.com/firefly/web/create-mood-boards/firefly-boards/about-firefly-boards.html) (2026-02-02; seen 2026-10-19)). Graph is for repeatability ([Graph](https://helpx.adobe.com/firefly/web/firefly-graph/firefly-graph-overview.html) (2026-06-16; seen 2026-10-19)). |
| Higgsfield | Canvas is for chaining models; a specific tool is recommended when you know the output ([which tool](https://higgsfield.ai/creator-hub/help-center/tools/which-higgsfield-tool-should-i-use) (2026-08-01; seen 2026-10-19)).                                                                                                                                         |
| Weave      | Shares a simplified tool view built from the graph ([tools](https://help.weavy.ai/en/articles/12267755-tools) (2026-10-19; seen 2026-10-19)).                                                                                                                                                                                                                        |

**Hand-offs between these spaces are where things break.**

- **Moving between spaces.** Opening a Boards video in Firefly's editor creates a new project ([Boards: add videos](https://helpx.adobe.com/firefly/web/create-mood-boards/firefly-boards/add-videos.html) (2026-08-18; seen 2026-10-19)). ElevenLabs sends Flows output to its Studio timeline by saving files and importing them ([how Flows differs from Studio](https://elevenlabs.io/docs/help-center/product/flows-image-video/flows/how-does-flows-differ-from-studio) (undated; seen 2026-10-19); [Flows](https://elevenlabs.io/docs/eleven-creative/products/flows) (undated, alpha; seen 2026-10-19)).
- **Graphs that hard-wire a model.** When ElevenLabs removed Sora 2 from its picker, every flow and template using it had to be repointed by hand ([changelog](https://elevenlabs.io/docs/changelog/2026/9/23) (2026-09-23; seen 2026-10-19)). In Weave, swapping a model means adding a new node ([helpers](https://help.weavy.ai/en/articles/12268300-helpers-overview) (2026-06-09; seen 2026-10-19)).

**Finishing happens on a timeline in every serious product.**

- Firefly's editor is multi-track and makes captions ([about the editor](https://helpx.adobe.com/firefly/web/firefly-video-editor/about-firefly-video-editor/about-firefly-video-editor.html) (2026-02-27; seen 2026-10-19)).
- ElevenLabs Studio is a linear multi-track timeline ([Studio 4.0](https://elevenlabs.io/blog/introducing-studio-4) (2026-09-21; seen 2026-10-19)).
- Canva moved video designs onto tracks ([create and edit videos](https://www.canva.com/help/creating-and-editing-videos/) (undated; seen 2026-10-19)).
- Krea's agent has two video and two audio tracks ([agent video editor](https://www.krea.ai/krea-agent/video-editor) (undated; seen 2026-10-19)).
- Runway's agent timeline takes no images ([assembling clips](https://help.runwayml.com/hc/en-us/articles/52685547867667-Trimming-and-Assembling-Clips-in-Studio) (2026-07-09; seen 2026-10-19)).

**For Vidra.** A feed for making, a stage for viewing and assembling, and a library for keeping carry every media type without a second space. That is Vidra's current shell. A canvas or graph would be a second space for experts, against [ADR-0002](../adr/0002-vidra-is-an-authoring-tool-for-non-experts.md)'s audience. It would also reopen the "nothing spatial is stored" rule that [ADR-0012](../adr/0012-the-space-lineage-network.md) and [ADR-0019](../adr/0019-the-studio-standalone-conversational-image-workspace.md) kept.

### 5. Results of any kind in one library, history and timeline

**One pool with a type filter is standard.**

- Firefly keeps one generation history filtered by Images, Videos and Audio ([history](https://helpx.adobe.com/firefly/web/access-your-files/view-generation-history.html) (2026-06-16; seen 2026-10-19)).
- Higgsfield saves every image, video and audio file to Assets and filters by type ([account](https://higgsfield.ai/creator-hub/help-center/getting-started/whats-in-my-higgsfield-account) (2026-07-30; seen 2026-10-19)).
- Magnific's project History holds every image, video and audio file from every tool ([projects](https://www.magnific.com/ai/docs/projects) (undated; seen 2026-10-19)).
- Runway's Assets filters by media type ([assets](https://help.runwayml.com/hc/en-us/articles/4408611980563-Managing-assets) (2026-08-25; seen 2026-10-19)).
- Descript's Media Library has Audio, Video and Image filters ([media library](https://help.descript.com/add-and-manage-media/media-library-overview) (2026-10-08; seen 2026-10-19)).
- Flow, Midjourney and Recraft filter pictures and videos.
- Flow also keeps a version history per asset ([projects and assets](https://support.google.com/flow/answer/16935308?hl=en) (undated; seen 2026-10-19)).

**Audio is the kind most often missing or scattered.**

- Flow, Midjourney, Ideogram and Recraft keep no standalone audio.
- Leonardo doesn't document audio in its Library and tells people to assemble music elsewhere ([music and voiceovers](https://leonardo.ai/news/how-to-add-ai-music-to-videos) (2026-08-10, updated 2026-09-30; seen 2026-10-19)).
- ElevenLabs splits results across three stores ([Studio](https://elevenlabs.io/docs/eleven-creative/products/studio) (undated; seen 2026-10-19)).
- Canva scatters AI results across per-tool histories ([Dream Lab](https://www.canva.com/help/generate-with-dreamlab/) (undated; seen 2026-10-19)).

**For Vidra.** The library-wide Media view with a type filter, plus the Versions panel, already fits. It needs Audio as a first-class kind.

### 6. Per-model settings that come and go without breaking the layout

**Settings live under the prompt and change with the model.**

- Firefly says model-specific settings change when you switch models, and its video settings vary by model ([generate and edit](https://helpx.adobe.com/firefly/web/unified-generation-and-editing-experience/generate-and-edit-content.html) (2026-08-19; seen 2026-10-19)).
- Krea shows only the settings a model supports ([image](https://www.krea.ai/docs/user-guide/features/krea-image) (undated; seen 2026-10-19)).
- Flow's prompt-box settings change by model ([models and features](https://support.google.com/flow/answer/16352836?hl=en) (undated; seen 2026-10-19)).

**The products split on whether settings vanish or grey out.**

| Behaviour                                  | Products                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unusable controls vanish                   | Magnific's chip row drops unsupported controls per model ([Video Generator](https://www.magnific.com/app/ai-video-generator) (live UI, signed out; seen 2026-10-19)). Higgsfield's chip row scrolls sideways as models add chips ([video](https://higgsfield.ai/ai/video) (live UI, signed out; seen 2026-10-19)). |
| Unusable controls stay, locked or disabled | Runway keeps an input-decided setting visible but locked ([Seedance 2.5](https://help.runwayml.com/hc/en-us/articles/53542207042323-Creating-with-Seedance-2-5) (2026-10-13; seen 2026-10-19)). Descript shows disabled buttons.                                                                                   |

**The long tail sits behind one control.**

- Runway puts frame rate and seed under Advanced settings ([Gen-4.5](https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5) (2026-08-13; seen 2026-10-19)).
- Kling opens one summary chip into a popover whose rows change with the model ([app home](https://kling.ai/app/) (live UI, signed out; seen 2026-10-19)).
- Higgsfield's audio has an Advanced drawer ([changelog](https://higgsfield.ai/creator-hub/changelog) (2026-08-10 entry; seen 2026-10-19)).

**Carry-over on a model switch is rarely documented.** Ideogram documents the fullest rules ([image settings](https://docs.ideogram.ai/create/image-settings) (2026-10-19; seen 2026-10-19); [create videos](https://docs.ideogram.ai/create/video) (2026-10-15; seen 2026-10-19)):

- the words and the image count carry over;
- shape carries only if the new model supports it;
- model-specific options do not transfer;
- unsupported video values fall back to supported ones.

Recraft falls back to the closest supported ratio. Most others say nothing.

**The two extremes.**

- Firefly's speech page swaps its whole control set per model ([speech with partner models](https://helpx.adobe.com/firefly/web/work-with-audio-and-video/work-with-audio/generate-speech-using-partner-models.html) (2026-08-07; seen 2026-10-19)).
- Canva exposes no model settings at all.

**For Vidra.** Vidra already has the documented behaviours above in one place: greyed core chips, full option lists, and nearest-value carry-over. What is missing is a place for the long tail ([figma log](../design/model-dependent/replicate-models-figma-log.md) gap S2). Put it behind one control, not a growing chip row.

### 7. Edits, extends, upscales, reframes, audio and captions

**The pattern that survives model churn: an action on a result opens the same composer with the input already bound.**

- **Firefly.** Its result actions include:
  - Generate video, which uses the picture as first frame;
  - Use as reference;
  - Edit image or clip;
  - Load all, which restores the setup;
  - Add to timeline.

  ([generate and edit](https://helpx.adobe.com/firefly/web/unified-generation-and-editing-experience/generate-and-edit-content.html) (2026-08-19; seen 2026-10-19)).

- **Leonardo.** Generate Video on a picture switches to video with that picture as start frame ([getting started](https://leonardo.ai/news/how-to-use-leonardo-ai/) (2026-02-18, updated 2026-05-05; seen 2026-10-19)).
- **Descript.** Extend reopens the same generate pane ([extend video](https://help.descript.com/generative-media/extend-video) (2026-09-08; seen 2026-10-19)).
- **Flow.** It extends from the opened clip and saves a frame as an ingredient, start frame or end frame ([edit videos](https://support.google.com/flow/answer/16935718?hl=en) (undated; seen 2026-10-19)).
- **Midjourney.** It offers Animate, Upscale, Vary, Pan and Zoom Out on the result ([modifying creations](https://docs.midjourney.com/hc/en-us/articles/33329329805581-Modifying-Your-Creations) (2026-09-01; seen 2026-10-19)).
- **Recraft.** It groups actions on the selected object into three groups: Modify, Reuse and Finalise ([context panel](https://www.recraft.ai/docs/recraft-studio/image-generation/context-panel) (undated; seen 2026-10-19)).

**The patterns that do not survive it.**

- **Separate editor pages.**
  - Runway's Edit Studio app ([Gen-4 Video](https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4-Video) (2026-09-11; seen 2026-10-19)).
  - Magnific's Clip Editor page ([Clip Editor](https://www.magnific.com/ai/docs/clip-editor) (undated; seen 2026-10-19)).
  - Ideogram's separate Edit, Remove background and Upscale apps ([edit](https://docs.ideogram.ai/edit/edit) (2026-10-19; seen 2026-10-19)).
- **Post-processing models added to the main picker.** ElevenLabs lists edit, extend, lip-sync and upscale models alongside generators, which keeps enlarging the picker ([Image & Video](https://elevenlabs.io/docs/eleven-creative/playground/image-video) (undated; seen 2026-10-19)).

**Audio and captions are finished on the timeline.**

- **Firefly's editor** generates sound effects beside the viewer and drops them on the timeline ([sound effects](https://helpx.adobe.com/firefly/web/firefly-video-editor/generate-audio/generate-sound-effects.html) (2026-06-16; seen 2026-10-19)). It makes styled captions from speech, with .srt export ([captions](https://helpx.adobe.com/firefly/web/firefly-video-editor/add-and-organize-media/add-captions.html) (2026-08-06; seen 2026-10-19)), and auto-reframes from a clip's properties ([auto reframe](https://helpx.adobe.com/firefly/web/firefly-video-editor/add-and-organize-media/apply-auto-reframe.html) (2026-09-23; seen 2026-10-19)).
- **CapCut** keeps AI music, text to speech and auto captions as tabs beside a persistent timeline ([voiceover and captions](https://www.capcut.com/help/add-voiceover-captions-to-ad-videos-ai) (2026-08-13; seen 2026-10-19)).
- **ElevenLabs Studio 4.0** places speech, sound effects and music in a project, and treats captions as clips ([Studio 4.0](https://elevenlabs.io/blog/introducing-studio-4) (2026-09-21; seen 2026-10-19)).
- **Canva** turns captions into an editable timeline layer ([captions](https://www.canva.com/help/generate-edit-captions-on-videos/) (undated; seen 2026-10-19)).

**Where this is missing.**

- Runway retired its Subtitles and Transcript tools with no replacement ([deprecated tools](https://help.runwayml.com/hc/en-us/articles/40213860628371-Deprecated-Standalone-Tools) (2026-08-05; seen 2026-10-19)).
- Flow, Midjourney, Ideogram and Recraft have no captions.

**For Vidra.** Derive actions on a result from the profiles that accept its kind, and open the same composer. Finish voiceover, music and captions in the Editor timeline.

## What this means for Vidra

**`/app` is already in-place for pictures and clips:**

- one composer, with the action chooser inside its primary button;
- one conversation feed;
- one media viewer;
- one library;
- one video editor.

**Studio is exactly the place-based pattern Bryce rejects.** It is a separate route with its own:

- chat;
- infinite plane;
- model roster;
- language-model planner;
- projects.

A "Use in a video" bridge joins it to `/app`. [ADR-0019](../adr/0019-the-studio-standalone-conversational-image-workspace.md) chose that deliberately in July.

**The `/app` client hard-codes its actions, visible settings and role names.** As a result, most of the 17 new profiles cannot be reached from the UI ([figma log](../design/model-dependent/replicate-models-figma-log.md), gaps S1–S11).

### What already fits

1. **Profiles already hold the logic.** Each profile in [`capability.schemas.ts`](../../shared/schemas/workflow/capability.schemas.ts) states:
   - its action;
   - typed input roles, with accepted kinds and limits;
   - its output kind;
   - editable, fixed, derived, unsupported and unknown parameters;
   - constraints;
   - generated sound;
   - availability.

   The [native Replicate profiles](../../server/src/services/creation-requests/replicate-models/) declare every documented input and setting. A new model is a new profile.

2. **The data is media-agnostic.**
   - **Drafts** ([`draft.schemas.ts`](../../shared/schemas/workflow/draft.schemas.ts)) carry an action, words, role-typed inputs, settings keyed by profile, a destination and an optional `contextualTarget` (a draft, a video edit or a media version).
   - **Request slots** hold a media version or text.
   - **Media versions** are picture, clip, audio or export.
3. **The chip row already behaves like the best documented products.**
   - Core chips grey out and keep their place.
   - Menus list every value, with unusable ones greyed.
   - Changing model keeps usable values and moves the rest to the nearest offer ([`capabilityEvaluation.ts`](../../shared/workflow/capabilityEvaluation.ts), [`capabilitySettings.ts`](../../client/src/features/project-workspace/state/capabilitySettings.ts)).
4. **Input-aware candidate checks exist.** `acceptsCurrentInputs` and `preModelParameterChoices` already find the qualified profiles that accept the attached inputs. They are the basis for greying models and for Auto.
5. **The shell already mixes pictures and clips** ([`ProjectWorkspace.tsx`](../../client/src/features/project-workspace/ProjectWorkspace.tsx)). It has:
   - **The feed.**
   - **The viewer's Use menu**: Use as input, Use frame, Edit, Animate, Add to video and Reuse setup.
   - **Versions.**
   - **The library-wide Media view** with a type filter.
   - **The Editor stage**, holding:
     - Project media, which has an audio mode;
     - captions;
     - source audio;
     - one music track.
6. **An Advanced chip already exists.** It is the "Length and motion" chip in [`FrameSettings.tsx`](../../client/src/features/project-workspace/components/FrameSettings.tsx), and it is the right home for long-tail settings.
7. **Spend is already shared.** Each slot reserves against the one daily cap that Studio also uses.

### What must change

1. **Actions come from data, not a client list.**
   - **Today.** [`ComposerSubmit.tsx`](../../client/src/features/project-workspace/components/ComposerSubmit.tsx) hard-codes eight actions. `actionLabel` and the placeholder in [`PromptComposer.tsx`](../../client/src/features/project-workspace/components/PromptComposer.tsx) know ten. Seven catalog actions are unreachable: upscale-image, edit-video, upscale-video, reframe-video, make-voiceover, make-music and transcribe (S1).
   - **Change.** Add a shared action registry. Each entry holds:
     - a label;
     - a result noun;
     - its output group (Picture, Clip, Audio or Text);
     - its words policy;
     - its core chip roles.

     The chooser lists every action the catalog offers.

2. **Profiles name their parameters' roles.**
   - **Today.** Only shape, duration, resolution and sound are shown, matched by regular expressions on parameter names; every other setting silently keeps its default (S2). `CORE_SETTINGS` gives pictures one chip, and audio and text none.
   - **Change.** Each parameter declares an optional role (shape, duration, resolution, sound, voice, language, scale) and a label. Anything without a role goes under Advanced. This is a shared contract change, so `npx tsc --noEmit` runs first.
3. **Words follow the profile.**
   - **Today.** Every action requires words.
   - **Change.** Each profile declares its words as one of:
     - required;
     - optional guidance (reframe);
     - an exact script (voiceover);
     - none (upscale, transcribe).

     A script is not given prompt highlighting (S3).

4. **Input cells come from the profile.**
   - **Today.** Default roles are hard-coded by action in `inputBinding.ts`, and the `imageEdit` branches in `PromptComposer.tsx` special-case pictures.
   - **Change.** The add-cells, the picker's filter (Pictures, Clips, Audio) and role reassignment on an action switch all come from the profile's input roles. This closes S5 end frame, S6 area, S7 audio and S8 clip.
5. **Audio and captions are first-class results** (S9, S10).
   - **Feed.** Audio results are a feed row with play and duration. Captions are a text card offering Add to video and Download .vtt.
   - **Viewer.** The viewer toolbar gains Kind=Audio.
   - **Library and picker.** Both gain an Audio filter.
   - **Today**, the thumbnail and the viewer show only the word "Audio" and a bare player.
6. **Actions on a result come from the profiles** (S1 entry points).
   - **Today.** The Use menu lists fixed actions.
   - **Change.** It lists the actions whose profiles accept the result's kind, and each one opens the same composer.
7. **The editor holds more than one audio track** (S11).
   - **Today.** The video edit schema allows picture and clip items plus one background track ([`video-edit.schemas.ts`](../../shared/schemas/workflow/video-edit.schemas.ts)).
   - **Change.** Voiceover needs its own lane, and transcripts need to become caption elements.
8. **One composer from the start.** The empty-state pair "Make picture / Make clip" goes. The composer always renders on Video, and the output switch beside the primary is the only output switch (Rule 3).

### What can retire

- **Studio as a place.** This covers:
  - the `/studio` routes in `client/src/App.tsx`;
  - the thread, plane and layout code in `client/src/features/studio/`;
  - the "Use in a video" bridge.

  Studio records stay readable through their legacy origin, and the spend cap and ledger stay.

- **Studio's second catalog,** [`StudioModelRegistry.ts`](../../server/src/services/studio/StudioModelRegistry.ts). Its models become workflow profiles: Recraft V4.1 (standard and Pro, raster and vector), Nano Banana 2, 2 Lite and Pro, and GPT Image 2. Its Auto routing becomes the model chip's Auto. Background removal and vectorize become picture actions.
- **Studio's second orchestrator,** [`StudioPolicyEngine.ts`](../../server/src/services/studio/StudioPolicyEngine.ts) and its six-way decision schema. Ask, Improve wording and Expand description already exist as text actions in the same composer.
- **The `?view=model` study presentation.** Its model captions move into the model menu.
- **The standalone `/live-editor` page.** Sketch inside `/app` covers it.
- **ADR-0019's first decision.** The decision that Studio is its own surface is superseded once this is adopted. Record that in a new ADR; ADRs stay as written.

## The recommended space

**Rule 1: Modes are logic, not location.** Changing what you generate never swaps the layout or loads another space.

| What may change with the action or output       | What never changes                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Input tiles and their add-cells                 | The route                                                                             |
| Whether words are needed, and their placeholder | Which rail item is selected                                                           |
| The model list                                  | The layout and its geometry (history rail, feed and docked composer)                  |
| The setting chips and Advanced                  | The composer's place                                                                  |
| The primary button's label                      | The feed and its scroll position                                                      |
| The in-progress noun                            | The media being viewed                                                                |
| The viewer's kind for the result                | The library                                                                           |

Rail destinations are tasks: Create, Projects, Media and Video edits, then the tools Sketch, Upscale, Reframe and Captions. They are never output kinds. There is no Images, Audio or Studio destination.

**Rule 2: One surface.** The conversation feed is the stage. Each request shows in the feed with its results at feed size and their actions under them, and the composer is docked under the feed. The large player is Focus, opened on demand over the workspace; closing it returns to the same scroll. The history rail beside the feed is the quick index: one item per request, newest last. Clicking an item jumps the feed to that request, and hovering shows a quick look. The Media library keeps everything.

- **Adopted 2026-10-19.** Bryce adopted the generations feed with the history rail. It replaces the Conversation panel beside the 992 × 828 media viewer ([proposal](../design/generations-feed-proposal-2026-10-19.md)).
- **Assembling.** An edit opens in Focus with its preview and timeline. Its Add voiceover, Add music and Make captions close Focus and open the docked composer, bound to the edit (Rule 8).
- No infinite canvas, no node graph and no second chat.
- If an agent is added later, it is a mode of the same composer and feed, not a new page. Flow does this by turning its prompt box into the agent chat ([Flow agent](https://support.google.com/flow/answer/17093911?hl=en) (undated; seen 2026-10-19)).

**Rule 3: One composer.** It has four parts: the input row, the words, the chips and the primary button.

- **Make new things in the composer, change things with tools.** Adopted 2026-10-20, replacing the chooser inside the primary button. Bryce rejected both a dropdown holding every action and a row of verb tabs ("whats the difference between make and animate").
  - **One output switch.** Video · Image · Voiceover · Music sits beside the primary. It is the only output switch, and Video is the default.
  - **Inputs decide the operation.** A picture in the start frame makes the video an animation, and a bound clip makes it an edit or an extension. There is no Animate, Edit or Extend mode.
  - **Rail tools for changes.** Upscale, Reframe and Captions are rail tools beside Sketch. A tool opens the same composer in place, with only its input and settings: no switch and no words, except Reframe's optional guidance. Sketch covers Edit a region.
  - **Buttons on results.** Every result shows its verbs as visible buttons (Rule 8). A verb that is a tool opens that tool with the result bound.
  - **Writing help.** Improve wording and Ask a question are buttons at the right of the input row. They act on the words and are disabled while the words are empty. A voiceover script is exact, so it has none.

| Where                | What it holds                                                   |
| -------------------- | --------------------------------------------------------------- |
| Composer switch      | Video, Image, Voiceover, Music                                  |
| Rail tools           | Sketch (Edit a region), Upscale, Reframe, Captions              |
| Buttons on a result  | The result's verbs in Rule 8, plus Reuse setup and Download     |
| Buttons on the words | Improve wording, Ask a question                                 |

- **No missing-input lockout.** Choosing an action is never blocked for lack of an input. The action shows the inputs it needs.
- **Kept across switches.** Words and compatible inputs survive every switch.

**Rule 4: Typed inputs.** Every attachment has a role from the profile: primary, reference, mask, start frame, end frame, clip or audio.

- **Add-cells.** Only the roles the current action accepts get add-cells, and the picker filters to that role's kinds.
- **On an action switch:**
  - each input moves to the role the new action uses for its kind;
  - inputs it cannot use stay in the row, greyed and left out of the request (Ideogram's "Not used");
  - switching back restores them.
- **Never switches the action.** Attaching something never switches the action.
- **Large bins.** Large reference bins get numbered captions (Image 1, Clip 1, Audio 1) that the words can name, as Runway and Kling label them.

**Rule 5: Model selection.** The model chip lists the action's profiles.

- **Greying.** Models that cannot take the attached inputs or chosen values are greyed, with no reason text.
- **Auto, the first row.** Its chips offer what the qualified candidates offer, which is the existing pre-model choice. Preparation resolves Auto to one exact profile, and the request and its details record that model.
- **Carry-over.** Changing model keeps usable values and moves the rest to the nearest offer, as today.

**Rule 6: Settings.** Each action has a fixed core chip row in a fixed order:

| Action    | Core chips                                       |
| --------- | ------------------------------------------------ |
| Picture   | model, shape, resolution, count                  |
| Clip      | model, shape, duration, resolution, sound, count |
| Voiceover | model, voice, count                              |
| Music     | model, duration, count                           |
| Captions tool | model, language                              |
| Upscale tool  | model, scale                                 |
| Reframe tool  | model, shape                                 |

- **Stable within an action.** Chips never appear or disappear when the model changes; unusable ones grey out.
- **Advanced holds the rest.** Every other parameter lives under the one Advanced chip, as one field bar per setting: a menu, a labelled slider, a toggle or a text field. Advanced appears only when the selected model has extras. It sits last, so nothing moves.
- **No guessing by name.** The client never guesses a role from a parameter name.
- **No seed control.** New variation and Reuse setup already give a fresh seed or the same one.

**Rule 7: Results.** Every result lands in the same feed, opens in the same Focus and appears in the same library.

- **Feed and Focus.** Audio shows in the feed as take rows with play, waveform and duration. Focus adds Kind=Audio: playback over a waveform, Use, and Download.
- **Library and picker filters.** These are All, Pictures, Clips and Audio.
- **Captions.** They stay a text result with Add to video and Download .vtt. They become stored files only when a transcript outgrows the 32,000-character text limit, which is an existing engineering follow-up.

**Rule 8: Edits and finishing.** Actions on a result come from the profiles that accept its kind. They are visible buttons, never a menu: under the result in the feed, and in the library's action bar when its card is selected. Each opens the same composer with the result already bound to its role. Upscale, Reframe and Make captions open their rail tool, and Edit a region opens Sketch:

| Result  | Actions                                                                                     |
| ------- | ------------------------------------------------------------------------------------------- |
| Picture | New variation, Edit, Edit a region, Animate (a video with it as the start frame), Upscale, Use as reference |
| Clip    | Edit, Extend, Upscale, Reframe, Make captions, Use a frame, Add to video                    |
| Audio   | Add to video, Make captions                                                                 |

- **No separate pages.** No operation gets its own page.
- **Finishing in the Editor timeline.** The timeline holds picture and clip items, captions, source audio, music and voiceover lanes.
- **Editor actions.** Add voiceover, Add music and Make captions in the editor open the same composer, bound to the edit.
- **Placement is explicit.** The result waits in Project media for one explicit Add. Generation never places itself, as the [capability contract](../design/model-dependent/capability-contract.md) requires.

**Acceptance check.**

- **Switching outputs and tools.** On desktop, with results in the feed, switch the composer between Video, Image, Voiceover and Music, then open the Upscale, Reframe and Captions tools.
  - These must stay identical: the URL, the history rail, the feed's blocks and scroll, and the composer's docked place. The composer grows upward from its docked bottom when its chips wrap.
  - Only these may change: the input row, the words state, the chips and the primary label.
- **Adding a model.** Add a model's profile to the catalog. It must appear in the model menu, chips and Advanced without client changes.
- **Adding an action.** Adding a new action takes one registry entry plus its profiles.

**Order of work.** Design stays in Figma until Bryce asks for code.

1. **Figma.**
   - The composer for each output, the output switch and the rail tools. (The grouped chooser drawn first was retired on 2026-10-20.)
   - The Advanced field types.
   - The audio and captions feed rows.
   - The viewer's Kind=Audio.
   - The library and picker Audio filter.
   - The Use menus for each kind.
   - The editor's voiceover lane.

   This covers S1–S3, S5 and S7–S11.

2. **Shared contracts.** The action registry, parameter roles and labels, and the words policy.
3. **The composer.** It derives from those contracts, and the hard-coded lists are deleted.
4. **Audio and captions** across the feed, viewer, library and picker.
5. **Actions on results and the editor's audio lanes.**
6. **Studio retirement.**
   - Redirect `/studio` to `/app`.
   - Move Studio's roster into profiles.
   - Keep its records readable.
   - Write the ADR.

## Evidence limits

- **No signed-in checks.** No accounts, uploads or generations were used. Live checks were signed out and from one location. Login-walled screens were judged from documentation: Runway, Luma, ElevenLabs, Descript, Leonardo's `/generate`, and Kling's Canvas and Assets.
- **Docs lag the products.** Examples:
  - Firefly's Boards model list;
  - Runway's Edit Studio pages;
  - Krea's video guide;
  - Leonardo's help center against its live routing;
  - Magnific's docs.

  Ideogram's docs were being edited the day they were read, and Canva's and Recraft's help pages are undated.

- **Renamed or retired products.** Freepik is now Magnific. Luma's Dream Machine name is retired in favour of the Luma app and Luma Agents ([LLM info](https://lumalabs.ai/llm-info) (2026-07-13; seen 2026-10-19)). Ideogram's Canvas is now Studio ([canvas](https://docs.ideogram.ai/using-ideogram/ideogram-features/canvas) (2026-10-14; seen 2026-10-19)). Sora is discontinued, and its earlier behaviour comes from archived OpenAI help pages.
- **Behaviour most products don't document.** Few say whether settings survive a model switch, or whether model lists grey out by attached input; Kling is the only one observed doing that.
- **Not covered.** Cost, allowance and the spend display (figma log gap S12). User research, completion rates and output quality were not measured.
- **Not yet adopted.** This is a recommendation for Bryce. It changes Studio's status only through a new ADR, and it authorises no provider spend or implementation.
