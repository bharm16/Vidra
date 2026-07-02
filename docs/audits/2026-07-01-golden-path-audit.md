# Golden-Path Audit — 2026-07-01

**Method:** Launched the app and walked the golden path — _empty canvas → one-liner
("a cozy coffee shop on a rainy morning") → expansion → first frame → motion →
render_ — as an anonymous first-time creator, driving a real browser. Production
boot is currently impossible (Finding 1), so the walkthrough ran under the
test-mode boot (`npm run dev:e2e`), which skips the infra startup probes but runs
all real services. The render (Luma) leg was **not reached** — everything upstream
of it is broken.

**Headline:** The golden path fails at every stage, for different reasons. 7,400
unit tests are green and the last ~25 commits are refactors, while the one flow
ADR-0002 calls the product has zero automated coverage and does not work. The
repo's definition of "working" (gates green) and the owner's (a creator gets a
clip) have fully diverged.

---

## P0 — Blockers: the product cannot work at all

### 1. Production boot is impossible — GCS service account is dead

`npm start` → `FATAL: invalid_grant: Invalid grant: account not found` from the
GCS startup probe. `gcs-service-account.json` is
`vidra-storage@gen-lang-client-0569793111.iam.gserviceaccount.com` — the
**suspended GCP project** (appeal submitted 2026-07-01). Boot hard-requires the
bucket (`server/src/config/services.initialize.ts:118`), so the whole app is down.

### 2. Gemini key suspended — four subsystems silently degraded

The Gemini health check returns `403 CONSUMER_SUSPENDED` (same suspended
project). At boot this **disables**: the Gemini adapter → expansion's LLM rewrite
(falls back to a deterministic template), the video-to-image transformer, the
storyboard frame planner, and span labeling's primary provider
(`SPAN_PROVIDER=gemini`). All of it degrades **silently** — no UI signal, `success: true`.

> Infra lesson (standalone finding): storage + Gemini + boot gate all lived in an
> auto-created "gen-lang-client" AI-Studio project. One suspension = total outage.
> Media storage and keys must be re-homed to `flibberai` or a dedicated project —
> do not wait on the appeal to do this.

### 3. First-frame failure — GCS outage masked by an img2img provider error

**Corrected 2026-07-01 (same day, deeper trace).** The original finding blamed a
client-side kontext hardcode; the full server log disproves that. The client
sends **no provider** — the server's auto plan ran Flux Schnell (t2i) first, as
designed. Schnell **failed at the storage step** with `invalid_grant` (the dead
GCS account, Finding 1), then the loop fell through to Flux Kontext (img2img),
whose _"requires inputImageUrl"_ refusal became the surfaced 400 — masking the
real cause. Two conclusions:

- The frame step should recover on its own once GCS is restored.
- The real defect is the fallback design: an img2img-only provider sat in the
  auto plan for text-only requests, so its irrelevant error masked the root
  failure. **Fixed** same day: providers declare `requiresInputImage`, and auto
  plans skip incapable providers
  (`ImageGenerationService.text-only-provider-plan.regression.test.ts`).
- `IMAGE_MODEL` in `client/src/components/ToolSidebar/config/modelConfig.ts:56`
  (kontext) turned out to be an unconsumed constant — dead config, noted but
  left in place.

Result in UI either way: "Couldn't create a frame — Image generation failed."
on the very first submit, and the creator's typed prompt is cleared from the
box.

### 4. All previously generated media is unviewable

Old renders are fetched via signed GCS URLs signed by the dead service account →
every request 403s through `/api/storage/proxy`. Gallery/history are broken
assets until media is re-homed.

### 5. Session persistence is split-brain; refresh loses all work

- After submit, the app navigates to `/session/<id>` while `GET /api/sessions/<id>` → **404** (fires repeatedly; no error state).
- Reloading that URL → infinite "Loading prompt…" spinner. Restore from the Sessions panel → same wedge, from a clean state too.
- The Sessions panel lists the session (client-side store), the server denies it exists. Two sources of truth, disagreeing. _(Unverified hypothesis: server persistence requires an authenticated user and fails silently for anonymous.)_
- Violates the repo's own UX rule #1: refresh = work gone.
- Every page load also creates a phantom "Untitled — Draft" session in the list.

## P1 — Silent degradation: the pipeline lies about success

### 6. Expansion — the moat — returned the input verbatim, as a success

`/api/optimize` 200, `optimizedPrompt` === input. The reason is buried in
metadata: _"LLM rewrite unavailable … Client 'gemini' is not available.
Available clients: openai, groq, qwen. Configure fallbackTo in ModelConfig if
automatic fallback is desired."_ No `fallbackTo` is configured for the expansion
executionType despite three healthy providers sitting in the container.

### 7. The template fallback emits broken English into the first-frame prompt

Compiled preview prompt, verbatim: _"Establishing Shot at eye level of the scene
in a cozy coffee shop with rain visible through the windows **at rainy morning.
on 35mm at f/11. Lit by soft. Style reference: soft.** Single keyframe with crisp
detail."_ Intent lock extracted `action: "morning"`. Even with providers fixed,
this text quality would feed the product's most important artifact.

### 8. Frozen/premature stacks still run on the hot path

`model-intelligence/recommend` fires **twice** per submit (ADR-0002: premature).
Credits math runs on every render of the CTA.

## P2 — Product-identity drift: the UI is the pre-ADR-0002 product

### 9. /home sells the old product

"Better prompts. Better video. Optimize your AI video prompts for Sora, Veo,
Runway, and more." — that is refinement-for-experts, not "one-line idea → one
good clip." Nav links to Products/Pricing for a frozen economics stack.

### 10. Credit economy is dead server-side but alive in the UI

Anonymous creator sees `0cr` badge and a "Make it — 56 credits" CTA. ADR-0002
says validation-phase generation is a hard-capped passthrough on our dime; the
UI still gates and prices everything.

### 11. Dead controls at first paint

Image/Audio/3D tabs (disabled), "Voice input — coming soon", Search (disabled),
Share (disabled): five inert controls on the first screen a creator sees.

### 12. Frozen features still mounted in the client bundle

`continuity`, `convergence`, `sequence-editor`, `billing`, `model-intelligence`
all ship in `client/src/features/`. ADR-0002 froze the server stacks; nobody
swept the client. "Half-finished" and "frozen but visible" are indistinguishable
to a user.

### 13. Pre-pivot naming leaks

The empty-canvas textbox's accessible name is "Optimized prompt"; hero text
disappears the moment you type; submitted text vanishes with no visible result.

## Root cause of the audit gap

**There is no golden-path test.** `tests/e2e/` covers auth pages, marketing,
navigation, span labeling, and a workspace smoke — not the product. Nothing
anywhere asserts "a creator can get a clip," so every incremental gate stayed
green while the product broke.

---

## Proposed repair order (dependency-sorted)

0. **Re-home infrastructure** (unblocks 1, 4, and boot): new/existing healthy GCP
   project for GCS + a Gemini key outside the suspended project; rotate
   `.env`; delete the dead SA file. Don't block on the appeal.
1. **Fix first-frame provider routing** (client): text-only generation → Flux
   Schnell; Kontext only when an input image exists.
2. **Configure expansion fallback** (`fallbackTo` → openai/groq) and surface
   degraded-mode to the user instead of `success: true`.
3. **Fix session persistence**: single source of truth, error states instead of
   infinite spinners, restore works, refresh-safe.
4. **Write the golden-path e2e spec** and make it the merge gate. This is the
   new top-level definition of "working."
5. **UI sweep to ADR-0002**: unmount frozen features from the client shell, remove
   credits UI for the validation posture, rewrite /home to the actual product,
   remove dead controls, fix pre-pivot naming.
6. Re-run this audit end-to-end (including the Luma render leg, untested here).

**Definition of done (proposed, pending owner ratification):** the golden-path
e2e spec passes against real providers from an anonymous fresh load through a
playable clip, and gates every merge. "Done" for any other work item means the
golden path is still green after it.
