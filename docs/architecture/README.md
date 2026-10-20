# Architecture contracts

Engineering rules live in [CLAUDE.md](../../CLAUDE.md); product vocabulary and ownership live in [CONTEXT.md](../../CONTEXT.md).

- [Service boundaries](SERVICE_BOUNDARIES.md). Runtime flags are declared in `server/src/config/feature-flags.ts`.
- [Free generation intake](free-generation-intake.md).
- [Media lifecycle](admission-media-lifecycle.md).
- [Deferred work](deferred-work-ledger.md) distinguishes external acceptance from source verification.
