# Vidra

> **Preview first. Generate once.**

AI video generation platform with a preview workflow that prevents wasted credits.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![React Version](https://img.shields.io/badge/react-18.2.0-blue)](https://reactjs.org/)

---

## The Problem

Video generation is expensive. One Sora generation costs real money. One Veo render burns real credits.

And you won't know if your prompt works until it's done rendering.

So you generate. Wait. Hate it. Tweak. Generate again. Wait again. Hate it again.

By the time you get what you wanted, you've burned through half your credits on bad takes.

## The Solution

**Draft cheap. Render perfect.**

Vidra lets you preview your video with fast, inexpensive models before committing to final generation:

| Stage                | Model                      | Credit cost         | Time   | Purpose                          |
| -------------------- | -------------------------- | ------------------- | ------ | -------------------------------- |
| **Image Preview**    | Flux Schnell               | 1 credit / image    | 5-10s  | Validate framing, lighting, mood |
| **Video Preview**    | Wan 2.2                    | 28 credits (8s)     | 30-60s | Test motion, pacing, camera      |
| **Final Generation** | Sora 2, Veo 3, Kling, Luma | 48-192 credits (8s) | 2-5min | Production-ready output          |

**The workflow:**

1. **Write** → Interactive editor with semantic highlighting
2. **Preview** → Fast drafts with Flux/Wan to validate direction
3. **Refine** → Click any highlighted phrase for AI-powered alternatives
4. **Generate** → Final video with Sora, Veo, Kling, or Luma

**Result:** 5 preview iterations + 1 final generation beats 5 blind generation attempts. Same output, 70% fewer credits.

---

## What This Is

<!-- TODO: Add GIF showing the click-to-enhance flow -->

**Vidra is NOT another paste-and-optimize tool.**

It's an interactive editing canvas where:

1. You write/paste a prompt
2. Every phrase gets ML-labeled (subject, camera, lighting, action, style...)
3. 15+ color-coded highlights appear
4. **Click ANY highlight** → get 5 AI-generated alternatives
5. One-click replace → prompt updates
6. **Visual preview** → See your prompt as an image (auto-generated with Flux Schnell)
7. Repeat until perfect

**You control every word. The AI assists, you decide.**

---

## Quick Start

Moved to `docs/QUICKSTART.md`.

---

## The Experience

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CATEGORIES        INTERACTIVE EDITOR                  SUGGESTIONS     │
│  ───────────       ──────────────────                  ───────────     │
│                                                                         │
│  Subject (3)       "A [woman in her 30s] walks        "woman in her    │
│  Action (1)         along a [pristine beach] at        30s":           │
│  Location (2)       [golden hour]..."                                  │
│  Lighting (2)                                          • elderly man   │
│  Camera (1)         ↑ Click any highlight              • young dancer  │
│  Style (1)                                             • shadowy figure│
│                                                                         │
│  [15 elements]                                         [Click to apply]│
│                                                                         │
│  ────────────────────────────────────────────────────────────────────── │
│  VISUAL PREVIEW (Flux Schnell)                                         │
│  [Generated preview image appears here as you type]                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Left:** Overview of detected elements by category  
**Center:** Your prompt with clickable highlights  
**Right:** AI suggestions for selected text  
**Bottom:** Visual preview generated automatically as you type

---

## Key Features

| Feature                                | What It Does                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Semantic Labeling**                  | 30+ categories tuned for video (subject, camera, lighting, action, style...)                                                          |
| **Click-to-Enhance**                   | Click any highlight → get context-aware alternatives → one-click replace                                                              |
| **Direct Video Generation**            | Generate actual videos using OpenAI Sora 2, Google Veo 3, Runway Gen-45, Luma Ray 3, and Kling                                        |
| **Visual Preview**                     | Auto-generates preview images using Flux Schnell as you type (debounced)                                                              |
| **Two-Stage Speed**                    | Sub-300ms draft (Groq) + background refinement (OpenAI)                                                                               |
| **Video Concept Builder**              | Guided wizard: subject → action → location → camera → lighting → style                                                                |
| **Consistency Tracking**               | Suggestions respect your edit history to maintain coherence                                                                           |
| **Integrated Asset System**            | Create and reuse **characters, styles, locations, and objects** directly inside the prompt optimizer for consistent production output |
| **`@trigger` Prompt Assembly**         | Reference assets via `@trigger` tokens with UX support (autocomplete/detection) so prompt building becomes reusable “building blocks” |
| **Reference Image Library**            | Upload/manage reference images (standalone + asset-attached) to support identity + visual continuity                                  |
| **Keyframe / Image-to-Video Workflow** | Use a start frame/keyframe (from uploads, library, or assets) to guide generation instead of text-only video                          |
| **Face-Consistent Keyframes (PuLID)**  | Higher-quality face identity preservation for character consistency (with fallback behavior when not configured)                      |
| **Consistent Generation Workflow**     | Supports “generate keyframe → approve → generate video” for multi-shot/series production patterns                                     |

---

## Billing & Credits

### Plans (monthly)

| Plan     | Price | Credits/month |
| -------- | ----- | ------------- |
| Free     | $0    | n/a           |
| Explorer | $19   | 500           |
| Creator  | $59   | 1,800         |
| Agency   | $179  | 6,000         |

**Plan highlights (from the pricing page):**

- Free: Local history, core prompt optimization, upgrade anytime
- Explorer: Priority generation queue, email support
- Creator: Faster generations, early feature access
- Agency: Team-ready workflows, priority support

### Add-on credit packs (one-time)

| Pack         | Credits | Price |
| ------------ | ------- | ----- |
| Starter Pack | 300     | $15   |
| Booster Pack | 600     | $28   |
| Pro Pack     | 1,200   | $52   |
| Studio Pack  | 3,000   | $120  |

Stripe setup: map price IDs to credit amounts via `STRIPE_PRICE_CREDITS` (include both subscriptions and packs).
Credit packs are one-time top-ups applied after checkout completes.

### Generation costs (per-second pricing)

Video credits are charged per second. Default duration is 8 seconds.

| Model      | Credits/sec | 8s Video    |
| ---------- | ----------- | ----------- |
| WAN Draft  | 3.5         | 28 credits  |
| WAN Pro    | 5           | 40 credits  |
| Sora 2     | 6           | 48 credits  |
| Sora 2 Pro | 14          | 112 credits |
| Veo 3      | 24          | 192 credits |
| Luma Ray-3 | 7           | 56 credits  |
| Kling v2.1 | 5           | 40 credits  |
| Minimax    | 4           | 32 credits  |

Image previews: 1 credit per image.

Credits are reserved at request time and refunded automatically if a preview or generation fails.
Preview and generation requests require authentication; anonymous users can’t consume credits.

---

## Why This Exists

AI video models (Sora, Runway, Veo3) are sensitive to prompt quality. The difference between:

❌ `"person on beach"`  
✅ `"Wide shot: woman in her 30s walks barefoot along pristine beach at golden hour, lateral tracking shot, warm backlight..."`

...is the difference between generic output and cinematic results.

**The problem:** Most people don't know cinematographic language.

**The solution:** Vidra shows you what elements your prompt has, what's missing, and lets you refine each element with AI assistance.

---

## Supported Ecosystem

Vidra is designed to be the all-in-one studio for the AI video ecosystem. It optimizes prompts AND directly generates video with:

- **OpenAI Sora 2** (Physics simulation & continuity)
- **Google Veo 3** (Cinematic lighting & atmosphere)
- **Runway Gen-45** (Stylized visuals & VFX)
- **Kling 2.6** (Character performance)
- **Luma Ray 3** (Morphing & transitions)
- **Wan 2.2** (High-fidelity previews)

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

**Production Ready Features:**

- ✅ Advanced Text Optimization Engine (Two-Stage Pipeline)
- ✅ Direct Video Generation (Sora 2, Veo 3, Luma Ray 3, Runway Gen-45)
- ✅ Video Preview Generation (Wan 2.2)
- ✅ Image Preview Generation (Flux Schnell)
- ✅ Concept Builder & Improvement Wizards
- ✅ Scene Change & Conflict Detection
- ✅ Enterprise-grade History & Auto-save
- ✅ Multi-Format Export (JSON/MD/TXT)

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
│           ├── SuggestionsPanel/         # AI suggestions
│           └── VideoConceptBuilder/      # Guided wizard
├── server/                    # Express backend
│   └── src/
│       ├── services/
│       │   ├── prompt-optimization/      # Core optimization
│       │   ├── enhancement/              # Suggestions
│       │   ├── video-concept/            # Video concept orchestration
│       │   └── ai-model/                 # LLM routing
│       └── llm/
│           └── span-labeling/            # Semantic labeling
└── shared/
    └── taxonomy.ts            # 30+ video categories
```

### Architecture Notes

- Canonical service imports are domain-scoped (`server/src/services/enhancement/*`, `server/src/services/video-concept/*`).
- Legacy root shims (`server/src/services/EnhancementService.ts`, `server/src/services/VideoConceptService.ts`) are removed.
- Composition is DI-first through `server/src/config/services*.ts` and `server/src/config/routes.config.ts`.
- Architecture gates run via `npm run arch:check` (client/server cycle checks + forbidden import checks).

---

## API

**Optimize with streaming:**

```bash
POST /api/optimize-stream
Content-Type: application/json

{
  "prompt": "person walking on beach",
  "mode": "video"
}

# Returns SSE stream: draft → spans → refined → done
```

**Get suggestions for a span:**

```bash
POST /api/enhance
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

- ✅ Two-stage optimization
- ✅ Semantic span labeling (30+ categories)
- ✅ Click-to-enhance suggestions
- ✅ Direct Video Generation (Sora 2, Veo 3, Luma Ray 3, Runway Gen-45)
- ✅ Video Preview Generation (Wan 2.2)
- ✅ Image Preview Generation (Flux Schnell)
- ✅ Video Concept Builder
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
