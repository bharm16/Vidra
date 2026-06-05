# Client (Frontend)

React 18 + Vite frontend for the Vidra video prompt editor.

Commit protocol, TypeScript rules, and change scope limits are defined in the root `CLAUDE.md` — all rules apply here.
Root `AGENTS.md` rules apply here — especially the non-negotiable rules and commit protocol.

## Stack

- React 18 + Vite
- Tailwind CSS + DaisyUI + Radix UI primitives
- TypeScript/JavaScript mix (migration in progress)
- Lucide React for icons

## Commands

```bash
npm run dev         # Vite dev server (port 5173, proxies /api to 3001)
npm run build       # Production build
npm run lint        # ESLint
npm run test:unit   # Vitest unit tests
```

## Structure

```
client/src/
├── App.tsx, main.tsx      # Entry points
├── components/            # Shared UI components
├── features/              # Feature-specific modules
├── pages/                 # Route pages
├── hooks/                 # Custom React hooks
├── api/                   # API client functions
├── services/              # Client-side services
├── repositories/          # Data access layer
├── schemas/               # Zod validation schemas
├── contexts/              # React context providers
├── config/                # Client configuration
├── types/                 # TypeScript type definitions
├── utils/                 # Pure utility functions
└── styles/                # Global styles
```

## Architecture Pattern

Follow the **preview** feature pattern in `client/src/features/preview/`:

```
FeatureName/
├── FeatureName.tsx        # Orchestrator (~500 lines max, heuristic)
├── hooks/
│   └── useFeatureState.ts # useReducer for state management
├── api/
│   └── featureApi.ts      # All fetch calls (Zod-validated)
├── components/
│   └── SubComponent.tsx   # UI pieces (~200 lines max, heuristic)
└── config/
    └── constants.ts       # Config and constants
```

## Conventions

### Components

- Functional components with hooks only
- Props interface defined above component
- Explicit `React.ReactElement` return type for exported components
- Keep presentation separate from business logic

### State Management

- Use `useReducer` for complex state (not multiple `useState`)
- Discriminated union types for reducer actions

### API Calls

- All API calls go in `api/` or feature-specific `api/` folders — never fetch inline in components
- Use Zod to validate API responses at the wire
- Feature `api/` directories validate server responses; where the UI shape diverges from the server DTO (e.g. `continuity` flattens a nested session, `span-highlighting` reshapes label spans) they also transform — that transform is the anti-corruption layer. Where the shapes match, the `api/` layer is a validation boundary, not a transform.

### Frontend-Backend Boundary

- **NEVER** import from `server/src/` — only from `@shared/*`, `#shared/*`, or client-local code
- Shared types live in `shared/` — client-only types go in the feature's `types/` directory
- If a UI change seems to require a `shared/` type change, stop and ask whether a client-side display type would suffice
- For genuine cross-layer changes: see `.claude/skills/cross-layer-change/SKILL.md`

### Styling

- Tailwind CSS for all styling
- DaisyUI components for UI primitives
- Radix UI for accessible primitives (dialogs, popovers, tooltips)
- Check `client/src/components/` for existing shared components before creating new ones
