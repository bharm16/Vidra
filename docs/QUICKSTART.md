# Quick Start

Minimal local setup instructions for Vidra.

## Prerequisites

- Node.js >= 20
- Firebase project (for auth/history)

## Run locally

```bash
# Clone (private repo)
git clone <REPO_URL>
cd prompt-builder

# Install
npm install

# Configure — create a local `.env` file. Obtain values from your team's
# secrets manager (1Password, Doppler, etc.) or generate your own dev keys.
# The server fails fast at boot with a complete list of any missing required vars.
touch .env

# Run
npm start
```

Open `http://localhost:5173`.

## Environment variables (high level)

- **Required for local dev**
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_PROJECT_ID`
  - At least one LLM provider key (commonly `OPENAI_API_KEY`)
- **Optional**
  - `GROQ_API_KEY` (fast drafts)
  - `REPLICATE_API_TOKEN` (preview generation + some fallbacks)
  - `FAL_KEY` / `FAL_API_KEY` (PuLID face-consistent keyframes)

The authoritative list lives in [`server/src/config/env.ts`](../server/src/config/env.ts) (Zod schema). Feature flag toggles live in [`server/src/config/feature-flags.ts`](../server/src/config/feature-flags.ts) — see the table in [`CLAUDE.md`](../CLAUDE.md#feature-flags).
