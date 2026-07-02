# Client (Frontend)

React 18 + Vite frontend for the Vidra video prompt editor.

Root `AGENTS.md` rules apply here — especially the non-negotiable rules and commit protocol.

## Stack

- React 18 + Vite
- Tailwind CSS + `@promptstudio/system` (design system) + Radix UI primitives
- TypeScript/JavaScript mix (migration in progress)
- Lucide React for icons

## Architecture Pattern

Follow the **preview feature** pattern in `client/src/features/preview/`:

```
FeatureName/
├── FeatureName.tsx        # Orchestrator
├── hooks/
│   └── useFeatureState.ts # useReducer for state management
├── api/
│   └── featureApi.ts      # All fetch calls (Zod-validated)
├── components/
│   └── SubComponent.tsx   # UI pieces
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
- Use Zod to validate API responses
- Feature `api/` directories transform server DTOs into client-friendly shapes (anti-corruption layer)

### Anti-Corruption Layer

```
Server DTO → feature/api/schemas.ts (Zod) → feature/api/*.ts (transform) → hook → component
```

- UI components consume transformed client types, never raw server DTOs
- If a server response field changes, only the feature's `api/` files should need updating
- If a UI-only concern needs a new type, create it in the feature's `types/` directory — do not add it to `shared/`

### Styling

- Tailwind CSS for all styling
- `@promptstudio/system` components for UI primitives
- Radix UI for accessible primitives (dialogs, popovers, tooltips)
- Check `client/src/components/` for existing shared components before creating new ones

### Boundary Rule

- **NEVER** import from `server/src/` — only from `@shared/*`, `#shared/*`, or client-local code
- If a UI change seems to require a `shared/` type change, stop and ask whether a client-side display type would suffice
