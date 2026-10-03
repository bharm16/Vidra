# Vidra

A visual direction workspace: start with words, a sketch, or a reference picture;
refine pictures and visible motion direction while preserving inputs and history.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![React Version](https://img.shields.io/badge/react-18.2.0-blue)](https://reactjs.org/)

## The authoring loop

1. Start a session with words, or explicitly admit a picture with associated words.
2. Inspect labeled phrases and choose suggestions to refine the visible direction.
3. Generate a picture, or use a sketch/upload; refine a session picture in the studio
   and explicitly return a produced image to the session.
4. Arm a first frame, choose camera motion as visible words, and request a clip.
5. Reopen the session with its take identities, inputs and relationships preserved.

The workspace contains the space, the input and the next-step button. The space
has words, picture and clip columns; picture refinements can form deeper chains
inside the picture column. The studio and live editor have their own surfaces.
Their bridges are explicit actions, and the live editor remains ephemeral until
the creator presses **Use this**.

A take is a durable picture or clip. Production provenance records how it was
made when known; associated words identify the session direction filed with it.
An upload has unknown production provenance. Draft/render names model tiers,
not a promise that a draft must become a final. See [the glossary](CONTEXT.md)
and [ADR-0022](docs/adr/0022-takes-can-enter-a-session-from-an-upload-the-sketchpad-or-the-studio.md).

## Implemented capabilities

| Capability                                | Current contract                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Semantic labeling and suggestions         | Labeled prompt phrases support click-to-enhance and explicit replacement.                                                                                  |
| Structured optimization                   | One LLM pass emits a cached artifact; deterministic intent and prompt-lint gates finish it. Model-target compilation uses the same artifact.               |
| Pictures and clips                        | Image generation and Wan and Veo video paths are offered for free testing; Kling, retired Sora and the incompatible legacy Luma path are excluded.         |
| Studio generation, editing and transforms | Stable model slugs, capability-based Auto routing and explicit negotiation for an incapable pin. A first turn can edit when a source image already exists. |
| Cross-mode admission                      | Upload, shown live output and produced studio images share admission, ownership, ancestry and resumable attachment contracts.                              |
| Camera choice                             | The chosen direction becomes visible words; its depth-backed or fallback illustration is always labeled illustrative.                                      |
| Runway prompt target                      | Prompts compile for Runway Gen-4.5; no generation adapter dispatches to Runway.                                                                            |

## Operating policy and verification

The owner selected free testing under [ADR-0023](docs/adr/0023-bounded-free-validation-proposal.md).
There is no customer-visible credit or checkout requirement. New per-creator
spending caps and paid Keep are deferred; existing rate limits and sketch/studio
allowances remain. The shared authorization for additional real-generation
testing is $10 total. [#124](https://github.com/bharm16/Vidra/issues/124) implements
free picture/clip HTTP intake and safe job publication.
Saved projects stay until explicit creator deletion, automatic abandoned-file
cleanup remains off, and homepage clips are deferred.

Offline replay and emulator/controlled-storage checks establish specific
contracts. They do not establish that the real browser controls and HTTP
intake complete a live clip, that each provider completes a real request, or that
the deployed version is accepted. [Current gates and proof limits](docs/audits/2026-10-03-docs-consistency.md)
remain explicit. This testing phase requires one successful real completion
per included provider; the owner waived creative quality scoring. Continuity, multi-shot production and broader generation
economics/resilience remain [deferred](docs/architecture/deferred-work-ledger.md).

## Quick Start

See [local setup](docs/QUICKSTART.md).

---

## Why This Exists

AI video models are sensitive to prompt quality, and each one wants its own dialect. Vidra compiles a prompt per model — including for Runway Gen-4.5, which it writes for but never calls. The difference between:

❌ `"person on beach"`  
✅ `"Wide shot: woman in her 30s walks barefoot along pristine beach at golden hour, lateral tracking shot, warm backlight..."`

...is the difference between generic output and cinematic results.

**The problem:** Most people don't know cinematographic language.

**The solution:** Vidra shows you what elements your prompt has, what's missing, and lets you refine each element with AI assistance.

---

## Supported Ecosystem

Provider implementations and prompt targets are enumerated below. Check the
active registries and configured availability before promising a path; the
quality task matrix evaluates support independently of registration.

**Optimizes prompts AND generates video with** (each has a generation adapter under `server/src/services/video-generation/providers/`):

- **Google Veo 3**
- **Wan**

Kling is excluded for this testing phase. OpenAI shut down Sora video generation
on 2026-09-24; its text services remain separate. The legacy Luma adapter is deferred
until its model/API mismatch is corrected. Historical ids remain readable.

**Optimizes prompts for, without generating:**

- **Runway Gen-4.5** (Stylized visuals & VFX) — a prompt target. `RunwayStrategy` describes and compiles for it, and the capability registry prices and constrains it, but `shared/modelIdentity.ts` records `generation: []`: no adapter can invoke Runway, so you take the compiled prompt to Runway yourself.

---

## Strategic Value

### For Creative Agencies

- **Standardize Quality:** Ensure every prompt sent to production meets a baseline of cinematographic detail.
- **Asset Management:** Save, search, and share successful prompt patterns across the team.
- **Client Alignment:** Use the visual preview to align with clients on style/mood before generating expensive video assets.

### For Marketing Teams

- **Speed to Market:** Reduce the "prompt engineering" learning curve for social media managers and content creators.
- **Consistency:** Maintain brand aesthetics by reusing specific Style and Lighting tokens.

---

## Current Status

Implementation and release acceptance are tracked separately. The
[consistency audit](docs/audits/2026-10-03-docs-consistency.md) records current
local contracts and the remaining browser, live-provider, quality, owner and
deployment gates. Historical screenshots, passing offline tests and adapter
registrations do not substitute for those gates.

---

## Tech Stack

|              |                                                    |
| ------------ | -------------------------------------------------- |
| **Frontend** | React 18, Vite, Tailwind, TypeScript               |
| **Backend**  | Express, TypeScript, Firebase                      |
| **LLMs**     | OpenAI (quality), Groq (speed), Gemini (diversity) |
| **Infra**    | Docker, Kubernetes, Redis, Prometheus              |

---

## Project Structure

```
prompt-builder/
├── client/                    # React frontend
│   └── src/
│       ├── features/
│       │   └── prompt-optimizer/
│       │       ├── PromptCanvas/         # Canvas orchestration + view sections
│       │       ├── PromptOptimizerContainer/  # Workspace orchestration
│       │       └── SpanCategoryAccordion/ # Category accordion overview
│       └── components/
│           └── SuggestionsPanel/         # AI suggestions
├── server/                    # Express backend
│   └── src/
│       ├── services/
│       │   ├── prompt-optimization/      # Core optimization
│       │   ├── enhancement/              # Suggestions
│       │   └── ai-model/                 # LLM routing
│       └── llm/
│           └── span-labeling/            # Semantic labeling
└── shared/
    └── taxonomy.ts            # 30+ video categories
```

### Architecture Notes

- Canonical service imports are domain-scoped (`server/src/services/enhancement/*`).
- Legacy root shims (`server/src/services/EnhancementService.ts`) are removed.
- Composition is DI-first through `server/src/config/services*.ts` and `server/src/config/routes.config.ts`.
- Architecture gates run via `npm run arch:check` (client/server cycle checks + forbidden import checks).

---

## API

**Optimize a prompt** (single buffered JSON response):

```bash
POST /api/optimize
Content-Type: application/json

{
  "prompt": "person walking on beach",
  "mode": "video",
  "targetModel": "kling-2.1"  // optional — compiles for that model
}

# Returns:
{
  "success": true,
  "data": {
    "prompt": "...",          // the finished prompt
    "optimizedPrompt": "...", // same value, legacy field name
    "previewPrompt": "...",   // short still-frame composition of the same slots
    "genericPrompt": "...",   // the prompt before any model-specific compile
    "artifactKey": "...",     // recompile for another model via POST /api/optimize-compile
    "compilation": { "status": "..." }
  }
}
```

**Get suggestions for a span:**

```bash
POST /api/enhancement/suggestions
Content-Type: application/json

{
  "highlightedText": "woman in her 30s",
  "contextBefore": "Wide shot: ",
  "contextAfter": " walks barefoot...",
  "fullPrompt": "...",
  "highlightedCategory": "subject.identity"
}
```

**Generate preview image:**

```bash
POST /api/preview/generate
Content-Type: application/json

{
  "prompt": "woman in her 30s walks along pristine beach at golden hour",
  "aspectRatio": "16:9"  // optional, defaults to "16:9"
}

# Returns:
{
  "success": true,
  "data": {
    "imageUrl": "https://...",
    "metadata": {
      "model": "flux-schnell",
      "aspectRatio": "16:9",
      "generatedAt": "2024-..."
    }
  }
}
```

> 📖 **[Full route map →](docs/architecture/ROUTE_MAP.md)**

---

## Scripts

```bash
npm start           # Run both frontend + backend
npm run dev         # Frontend only (Vite)
npm run server      # Backend only (Express)
npm run test        # Unit tests (Vitest)
npm run test:e2e    # E2E tests (Playwright)
npm run lint        # ESLint
npm run build       # Production build
npm run arch:check  # Architecture gates (cycles + forbidden imports)
```

---

## Documentation

| Doc                                                                                      | Contents                |
| ---------------------------------------------------------------------------------------- | ----------------------- |
| **[docs/QUICKSTART.md](docs/QUICKSTART.md)**                                             | Minimal local setup     |
| **[docs/architecture/ROUTE_MAP.md](docs/architecture/ROUTE_MAP.md)**                     | Generated route map     |
| **[docs/development/IMPLEMENTATION_GUIDE.md](docs/development/IMPLEMENTATION_GUIDE.md)** | Development guide       |
| **[docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)**                                 | Deployment instructions |

---

## Status

**In active development.** Core features working:

- ✅ Structured optimization (cached artifact + intent lock + prompt lint)
- ✅ Semantic span labeling (30+ categories)
- ✅ Click-to-enhance suggestions
- ✅ Direct Video Generation (Veo 3, Wan 2.2/2.5; Kling/Luma/Sora excluded this testing phase)
- ✅ Prompt compilation for Runway Gen-4.5 (prompt target only — no generation adapter)
- ✅ Video Preview Generation (Wan 2.2)
- ✅ Image Preview Generation (Flux Schnell)
- ✅ Multi-provider LLM support
- ⏳ Payment integration
- ⏳ Team collaboration

---

## License

MIT

---

## Contributing

1. Fork the repo
2. Create feature branch: `git checkout -b feature/your-feature`
3. Run tests: `npm run test && npm run lint`
4. Commit: `git commit -m "feat: add feature"`
5. Push and create PR

---

**[→ API route map](docs/architecture/ROUTE_MAP.md)** · **[→ Quickstart](docs/QUICKSTART.md)**
