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
