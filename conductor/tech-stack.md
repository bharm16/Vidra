# Tech Stack: Vidra

## 1. Core Technologies

- **Language:** TypeScript (Primary), JavaScript (ESM)
- **Frontend:** React 18, Vite, Tailwind CSS, `@promptstudio/system` (design system)
- **Backend:** Node.js (Express), `tsx` (TypeScript execution)
- **Monorepo Structure:** Managed with npm workspaces (`client/`, `server/`, `shared/`)

## 2. Infrastructure & Persistence

- **Cloud Platform:** Firebase (Auth, Firestore, Cloud Functions)
- **Storage:** Google Cloud Storage (GCS) for media assets (images, videos)
- **Database:** Firestore (Metadata), Redis (ioredis) for caching and rate limiting
- **Monitoring:** Sentry (Error tracking), Pino (Structured logging), Prometheus (Metrics)

## 3. AI & ML Integration

- **Orchestration:** Custom service-based architecture for prompt optimization and model routing.
- **Text Optimization:** OpenAI (GPT-4o), Google Gemini (Flash 2.0/2.5), Groq (Fast drafting)
- **Visual Preview:** Fal.ai (Flux Schnell for image previews)
- **Video Generation:**
  - **Previews:** Replicate (Wan 2.2)
  - **Production:** OpenAI Sora 2, Google Veo, Luma Ray 3, Kling, Runway Gen-45

## 4. Engineering & DevOps

- **Validation:** Zod (Type-safe schema validation)
- **Testing:** Vitest (Unit/Integration), Playwright (E2E)
- **Containerization:** Docker, Kubernetes
- **Payments:** Stripe (Subscription and credit pack management)
- **CI/CD:** GitHub Actions

## 5. Key Libraries

- **Image Processing:** Sharp
- **NLP/Text Utilities:** compromise, gliner, ahocorasick
- **API Clients:** replicate, lumaai, openai, @fal-ai/client
