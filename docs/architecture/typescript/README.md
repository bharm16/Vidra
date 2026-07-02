# TypeScript Migration Documentation

This directory contains all documentation for migrating the Prompt Builder codebase from JavaScript to TypeScript.

## Document Overview

| Document                                               | Purpose                                                              | Read When...                          |
| ------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------- |
| [ARCHITECTURE_STANDARD.md](./ARCHITECTURE_STANDARD.md) | Directory structure patterns for TS                                  | Starting a new feature or refactoring |
| [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)             | Step-by-step file conversion process                                 | Converting existing JS files          |
| [STYLE_RULES.md](./STYLE_RULES.md)                     | Type safety rules and anti-patterns                                  | Writing any TypeScript code           |
| [TSCONFIG_GUIDE.md](./TSCONFIG_GUIDE.md)               | Compiler configuration reference                                     | Setting up or debugging TS config     |
| [PATH_ALIASES.md](./PATH_ALIASES.md)                   | Path alias setup and migration                                       | Fixing relative import hell           |
| [ZOD_PATTERNS.md](./ZOD_PATTERNS.md)                   | Runtime validation with Zod                                          | Working with API responses or forms   |
| [LOGGING_PATTERNS.md](./LOGGING_PATTERNS.md)           | Structured logging standards                                         | Adding debugging, tracing, monitoring |
| [CLAUDE_CODE_TEMPLATES.md](./CLAUDE_CODE_TEMPLATES.md) | Copy-paste templates for Claude Code                                 | Requesting features via Claude Code   |
| [TEST_GUIDE.md](./TEST_GUIDE.md)                       | Test quality heuristics, TS patterns, and codebase-specific guidance | Writing or generating tests           |

## Quick Start

### For New Features

1. Read [ARCHITECTURE_STANDARD.md](./ARCHITECTURE_STANDARD.md)
2. Copy template from [CLAUDE_CODE_TEMPLATES.md](./CLAUDE_CODE_TEMPLATES.md)
3. Follow [STYLE_RULES.md](./STYLE_RULES.md)
4. Add logging per [LOGGING_PATTERNS.md](./LOGGING_PATTERNS.md)

### For Debugging

1. Run `./scripts/enable-debug.sh` to enable debug logging
2. Follow patterns in [LOGGING_PATTERNS.md](./LOGGING_PATTERNS.md)
3. Use browser console commands: `window.__logger.getStoredLogs()`

### For Migration

1. Read [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
2. Reference [ZOD_PATTERNS.md](./ZOD_PATTERNS.md) for API layers
3. Validate against [STYLE_RULES.md](./STYLE_RULES.md)

## Migration Status

Track migration progress here:

### Frontend (client/src/)

- [ ] `types/` - Global type definitions
- [ ] `utils/` - Pure utility functions
- [ ] `hooks/` - Custom React hooks
- [ ] `api/` - API layer with Zod schemas
- [ ] `components/` - React components
- [ ] `features/` - Feature modules

### Backend (server/src/)

- [ ] `types/` - Global type definitions
- [ ] `utils/` - Pure utility functions
- [ ] `services/` - Business logic services
- [ ] `routes/` - Express routes
- [ ] `middleware/` - Express middleware
- [ ] `clients/` - External API clients

## Key Principles

1. **Types First**: Define interfaces before implementation
2. **Runtime Validation**: Use Zod at system boundaries
3. **No `any`**: Use `unknown` and narrow, never `any`
4. **Strict Mode**: All compiler strictness options enabled
5. **Incremental Migration**: JS and TS coexist during transition
6. **Structured Logging**: Use logger service, never `console.log`

## Related Documentation

- [../REFACTORING_STANDARD.md](../REFACTORING_STANDARD.md) - File size limits (still apply)
- [../../DEBUGGING_GUIDE.md](../../DEBUGGING_GUIDE.md) - Full debugging guide (quick start, browser commands)

---

_Last Updated: Current Session_
