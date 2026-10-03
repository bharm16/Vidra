# Offline cross-mode browser proof (#141)

Run the actual React controls against an isolated Vite/API pair on port 58141:

```bash
npx playwright test --config tests/e2e/cross-mode/playwright.config.ts
```

On a Mac with Chrome installed, `E2E_CHROME_CHANNEL=chrome` uses that browser
instead of a downloaded Playwright Chromium. Set `CROSS_MODE_TEST_OUTPUT` to a
new absolute directory to preserve each run's failure traces separately.

The dedicated configuration enables `CROSS_MODE_BROWSER_PROOF`. The ordinary
E2E configuration skips this spec because its server does not expose the
controlled boundaries. The original `golden-path.spec.ts` remains unchanged and
requires its separate verification.

## What is real and what is controlled

The live editor, sketch canvas, acceptance action, studio, selection and return,
camera picker, generate button, navigation and reload are the production React
components. Admission, studio turns, session writes, first-frame arming,
generation HTTP intake, inline job processing and worker attachment are the
production routes and services. Clip intake is never replaced by `page.route()`.

The runner reuses the #138 storage/session/project boundary doubles. Synthetic
provider ports supply typed studio decisions, a raster image and a short playable
MP4; the actual video-generation service dispatches through those ports. The
main walkthrough selects Veo in the real model control and asserts the HTTP
model, provider model, prompt and first-frame URL. Its fixture declares only
the Gemini/Veo provider available and rejects every other provider/model;
it never silently falls back or advertises global model availability. The
free job-store adapter records its 202 receipt before making the job visible and
throws if the credit-reservation method is reached. Real Firestore atomicity is
proved separately by the intake transaction tests.

Backend outbound calls are blocked by the existing outbound guard; browser
requests to nonlocal hosts are blocked, except the synthetic object host routed
to its stored bytes. Depth exercises both the real unavailable-provider fallback
and the available case through the actual depth route, service and SDK. Only
the SDK's queue HTTP transport is synthetic and routed inside the guard. The
picker must still offer a choice and show its illustrative label in both cases. The generated
PNG/MP4 fixtures carry no live-provider or creative-quality claim. This suite
spends nothing and needs no provider credentials.

Transport-fault tests forward acceptance requests to the real server before
holding, duplicating or dropping the response. Persistence-fault tests fail the
storage port, preserving the real admission receipt and retry behavior. Expired
media fixtures replace only transport URLs; their durable handles remain.

## Required assertions

The dedicated suite contains ten cases.

The main walkthrough checks sketch admission, studio edit selection and ancestry,
returned first frame, visible camera words, the submitted HTTP payload, provider
parameters, pending generation, decoded clip playback and durable reopening.
Separate cases cover cross-version associated words, attachment failure after
reload, failed arming, duplicate concurrent retries, two distinct shown outputs
accepted concurrently with their own words and responses released out of order,
a lost committed response, expired media and navigation before acceptance returns.

These are functional browser contracts. A passing synthetic clip does not prove
live provider completion, production storage, deployment access or release
acceptance; those observations must name their actual environment and version.

## Visibility observation for #65

The main run uses the real Fit to view action after waiting for hydrated take
nodes. In a clip-focused restored session, the associated words node can overlap
the sidebar when reached with the pointer; its actual keyboard Enter action
restores the correct words. This observation belongs to the all-shells review
and is not visual-design approval. No test uses a forced click or directly
changes the canvas transform.

## Controlled clip codec

`clip.mp4` contains two 32×32 VP9 frames over 0.2 seconds, with no audio. The
container and served content type remain MP4 / `video/mp4`. This is a controlled
provider response used to verify decoding, playback, download, and reload; it
makes no claim about live provider output quality.

The original H.264 High (`avc1.64000a`) fixture reached the CI browser intact
with HTTP 200 and SHA-256
`f09ec5be44114e0b56bedf21b0c76d20a31580bf84ae8784998972b913d3d4bc`, but the
bundled Chromium 141.0.7390.37 decoder rejected it with media error 4:
`DEMUXER_ERROR_NO_SUPPORTED_STREAMS`. An isolated decoder probe reproduced
`readyState=0` and rejected `play()` in that browser, while installed Chrome
played those same bytes. The VP9 MP4 replacement decodes to `readyState=4` and
plays in both. [Playwright documents the proprietary codec differences between
bundled Chromium and branded browsers](https://playwright.dev/docs/browsers).

The replacement is a lossless codec conversion; both files decode to the same
raw-frame SHA-256
`0090195482761912523740ecf1dcdbd7b5e2ca9e7394b9501e4576259ad9001c`. Regenerate
from the original committed fixture with FFmpeg (the test runner needs no
FFmpeg installation):

```bash
git show 0fea88b25f5b0889fe5a5cb3b693044f54902ec0:tests/e2e/cross-mode/clip.mp4 > /tmp/vidra-controlled-h264.mp4
ffmpeg -y -i /tmp/vidra-controlled-h264.mp4 -an -c:v libvpx-vp9 -lossless 1 -pix_fmt yuv420p -movflags +faststart tests/e2e/cross-mode/clip.mp4
ffprobe -v error -show_streams -show_format tests/e2e/cross-mode/clip.mp4
```

The verified replacement file SHA-256 is
`78ebfa2235648a9066288b54d5fc8fb9cfe9c87c9bbf9006da525fea59aa1c5d`. FFmpeg
versions may change container metadata without changing the decoded frames.
Playback assertions stay unchanged; successful transport alone does not pass
the browser test.
