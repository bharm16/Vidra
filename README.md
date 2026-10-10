# Vidra

A visual direction workspace: start with words, a sketch or a reference picture; refine visible direction and produce pictures/clips while preserving inputs and history.

## Authoring

1. Start a session with words or explicitly admit a picture with associated words.
2. Inspect semantic phrase labels and apply suggestions through explicit edits.
3. Generate a picture, use a sketch/upload, or refine a picture in standalone Studio and explicitly return it.
4. Select a first frame, put camera direction into visible words, and request a clip.
5. Reopen the session with take identity, inputs, ancestry and recovery intact.

The space presents chronological dispatch rows; working words and conversation live in the side panel. Selecting a result preserves the working draft. **Reuse setup** deliberately restores setup. Sketch output is ephemeral until **Use this**; ordinary generated takes are persisted. Draft/render names a model tier, not lifecycle.

The current phase is free testing under [ADR-0023](docs/adr/0023-bounded-free-validation-proposal.md). Existing Studio/Sketch bounds remain. Supported generation offers are declared in `shared/videoModels.ts`; historical ids and model-specific prompt compilation have separate contracts.

## Local setup

Node 20+, ESM, React/Vite and Express/TypeScript. Install with `npm install`, configure a local `.env` from `.env.example`, and follow [QUICKSTART.md](docs/QUICKSTART.md) for Firebase/provider credentials. Keep secrets outside Git.

```bash
npm start           # Client + API
npm run dev         # Client only
npm run server      # API only
npm run verify      # Typecheck, ESLint, architecture, unit, replay
npm run lint:all    # ESLint + CSS
npm run build       # Production client build
npm run verify:drift # Route/flag/catalog freshness
```

The isolated provider-free browser journey runs with:

```bash
npx playwright test --config tests/e2e/cross-mode/playwright.config.ts
```

## Contracts and evidence

[CONTEXT.md](CONTEXT.md) defines product vocabulary and ownership; [CLAUDE.md](CLAUDE.md) defines engineering rules and mandatory commit/handoff checks. [Page 21 adoption](docs/design/page21-component-migration.md) retains the current visual reference and real state journeys.

Free intake uses durable request receipts and zero-credit jobs. Completion precedes attachment; recovery reuses the original media/take/session/version. Legacy charged-job refunds remain isolated until stored obligations are drained. Retired dormant backends and process bundles are documented in the [cleanup record](docs/audits/2026-10-09-frozen-separation-plan.md).

Replay, controlled browser journeys and emulator tests prove specified local contracts. They do not qualify live provider availability, creative quality or deployment. See [cross-mode proof limits](docs/architecture/cross-mode-golden-path.md), [provider quality](docs/architecture/provider-quality.md) and [deferred acceptance](docs/architecture/deferred-work-ledger.md).

Current [routes](docs/architecture/ROUTE_MAP.md) and [flags](docs/architecture/FEATURE_FLAGS.md) are generated from source. [Architecture contracts](docs/architecture/README.md) link the surviving media/admission/recovery documentation.

## License

MIT.
